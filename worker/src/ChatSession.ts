import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import type { TravelSearchParams } from "./workflow";

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

// ── Combined LLM response: intent + conversational reply ───
interface IntentAndResponse {
    params: {
        destination: string | null;
        startDate: string | null;
        endDate: string | null;
        budget: number | null;
    };
    reply: string;
}

// ── Travel-related keywords for lightweight pre-check ──────
const TRAVEL_KEYWORDS = /\b(trip|travel|fly|flight|hotel|book|plan|vacation|holiday|visit|budget|destination|stay|airport|itinerary)\b/i;

export class ChatSession extends DurableObject<Env> {
    private messages: ChatMessage[] = [];

    // ── Lifecycle: rehydrate chat history from durable storage ──
    private async loadHistory(): Promise<void> {
        const stored = await this.ctx.storage.get<ChatMessage[]>("messages");
        this.messages = stored ?? [];
    }

    private async saveHistory(): Promise<void> {
        await this.ctx.storage.put("messages", this.messages);
    }

    // ── Fetch: WebSocket upgrade + HTTP callback route ───────
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // Route: POST /api/workflow-complete — receives workflow results
        if (request.method === "POST" && url.pathname.endsWith("/workflow-complete")) {
            return this.handleWorkflowComplete(request);
        }

        // Route: WebSocket upgrade
        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
            return new Response("Expected WebSocket upgrade", { status: 426 });
        }

        await this.loadHistory();

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        this.ctx.acceptWebSocket(server);

        // Send existing chat history to reconnecting clients
        if (this.messages.length > 0) {
            server.send(JSON.stringify({ type: "history", content: this.messages }));
        }

        return new Response(null, { status: 101, webSocket: client });
    }

    // ── Hibernation API: message handler ─────────────────────
    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

        try {
            await this.loadHistory();

            let parsed: { type?: string; content?: string };
            try {
                parsed = JSON.parse(raw);
            } catch {
                parsed = { type: "message", content: raw };
            }

            const userText = parsed.content?.trim();
            if (!userText) return;

            // 1. Append user message to history & persist
            this.messages.push({ role: "user", content: userText });
            await this.saveHistory();

            // 2. Lightweight pre-check: only invoke the intent parser if
            //    the conversation looks travel-related. This avoids double
            //    LLM calls for casual chat like "hello" or "how are you".
            const hasTravelContext =
                TRAVEL_KEYWORDS.test(userText) ||
                this.messages.some((m) => TRAVEL_KEYWORDS.test(m.content));

            if (hasTravelContext) {
                await this.handleTravelMessage(ws);
            } else {
                await this.handleCasualChat(ws);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error occurred";
            ws.send(JSON.stringify({ type: "error", content: errorMsg }));
        }
    }

    // ── Hibernation API: close handler ───────────────────────
    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
        ws.close(code, "Durable Object is closing WebSocket");
    }

    // ── Hibernation API: error handler ───────────────────────
    async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
        console.error("WebSocket error:", error);
        ws.close(1011, "WebSocket error");
    }

    // ── Travel message: single LLM call for intent + reply ───
    // Combines intent extraction and conversational response into
    // one LLM call, halving latency and token cost vs. two calls.
    private async handleTravelMessage(ws: WebSocket): Promise<void> {
        ws.send(JSON.stringify({ type: "status", content: "Thinking..." }));

        const intentAndReply = await this.parseIntentAndRespond();

        const { params, reply } = intentAndReply;

        if (params.destination && params.startDate && params.endDate && params.budget) {
            // ── Scenario B: All fields present → trigger workflow
            // Send the LLM's acknowledgment reply first
            this.messages.push({ role: "assistant", content: reply });
            await this.saveHistory();
            ws.send(JSON.stringify({ type: "message", content: reply }));

            // Then kick off the workflow
            await this.triggerWorkflow(ws, {
                destination: params.destination,
                startDate: params.startDate,
                endDate: params.endDate,
                budget: params.budget,
            });
        } else {
            // ── Scenario A: Missing data → use the LLM's follow-up reply
            this.messages.push({ role: "assistant", content: reply });
            await this.saveHistory();
            ws.send(JSON.stringify({ type: "message", content: reply }));
        }
    }

    // ── Single combined LLM call: extract + respond ──────────
    // Returns both the extracted travel params AND a human reply
    // in a single inference pass.
    private async parseIntentAndRespond(): Promise<IntentAndResponse> {
        const systemPrompt: ChatMessage = {
            role: "system",
            content: [
                "You are a friendly AI travel agent. You have two jobs in every response:",
                "1. Extract travel parameters from the ENTIRE conversation: destination, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), and budget (integer USD). The current date is March 2026.",
                "2. Write a short, friendly reply to the user.",
                "",
                "Respond ONLY with a raw JSON object (no markdown, no extra text) with these exact keys:",
                '{ "params": { "destination": string|null, "startDate": string|null, "endDate": string|null, "budget": number|null }, "reply": string }',
                "",
                "If all params are known, your reply should confirm them enthusiastically.",
                "If some params are missing, your reply should naturally ask for the missing information while acknowledging what you already know.",
            ].join("\n"),
        };

        const messages: ChatMessage[] = [systemPrompt, ...this.messages];

        const response = await this.env.AI.run(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            { messages }
        );

        const raw = typeof response === "object" && response !== null && "response" in response
            ? (response as { response: string }).response
            : "";

        try {
            const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned) as IntentAndResponse;

            return {
                params: {
                    destination: parsed.params?.destination ?? null,
                    startDate: parsed.params?.startDate ?? null,
                    endDate: parsed.params?.endDate ?? null,
                    budget: parsed.params?.budget !== null && parsed.params?.budget !== undefined
                        ? Number(parsed.params.budget)
                        : null,
                },
                reply: parsed.reply || "Could you tell me more about your travel plans?",
            };
        } catch {
            return {
                params: { destination: null, startDate: null, endDate: null, budget: null },
                reply: "I'd love to help you plan a trip! Where would you like to go, when, and what's your budget?",
            };
        }
    }

    // ── Casual chat: single LLM call with no intent parsing ──
    private async handleCasualChat(ws: WebSocket): Promise<void> {
        ws.send(JSON.stringify({ type: "status", content: "Thinking..." }));

        const systemPrompt: ChatMessage = {
            role: "system",
            content: [
                "You are a friendly and knowledgeable AI travel agent.",
                "Help users plan trips by researching destinations, recommending hotels, flights, and activities within their budget.",
                "Ask clarifying questions about their destination, travel dates, budget, and interests.",
                "Be concise but helpful. Use a warm, professional tone.",
            ].join(" "),
        };

        const response = await this.env.AI.run(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            { messages: [systemPrompt, ...this.messages] }
        );

        const aiText = typeof response === "object" && response !== null && "response" in response
            ? (response as { response: string }).response
            : "I'm sorry, I couldn't generate a response right now. Please try again.";

        this.messages.push({ role: "assistant", content: aiText });
        await this.saveHistory();

        ws.send(JSON.stringify({ type: "message", content: aiText }));
    }

    // ── Scenario B: Trigger the TravelAgentWorkflow ──────────
    // Generates a per-invocation callback token, stores it, and
    // passes it to the workflow so the callback can be verified.
    private async triggerWorkflow(ws: WebSocket, params: TravelSearchParams): Promise<void> {
        try {
            const sessionId = this.ctx.id.toString();
            const workflowId = `travel-${sessionId}-${Date.now()}`;

            // Generate a one-time callback token to authenticate the callback
            const tokenBytes = new Uint8Array(32);
            crypto.getRandomValues(tokenBytes);
            const callbackToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

            // Store the token so we can verify it when the callback arrives
            await this.ctx.storage.put("callbackToken", callbackToken);

            await this.env.TRAVEL_WORKFLOW.create({
                id: workflowId,
                params: {
                    ...params,
                    callbackSessionId: sessionId,
                    callbackToken,
                },
            });

            ws.send(JSON.stringify({
                type: "status",
                content: "⏳ Fetching data from travel APIs (this may take a moment)...",
            }));
        } catch (err) {
            const errorMsg = `Workflow error: ${err instanceof Error ? err.message : String(err)}`;
            this.messages.push({ role: "assistant", content: errorMsg });
            await this.saveHistory();
            ws.send(JSON.stringify({ type: "error", content: errorMsg }));
        }
    }

    // ── Workflow callback: POST /api/workflow-complete ────────
    // Verifies the callback token before processing results.
    private async handleWorkflowComplete(request: Request): Promise<Response> {
        // 1. Verify the callback token
        const incomingToken = request.headers.get("X-Callback-Token");
        const storedToken = await this.ctx.storage.get<string>("callbackToken");

        if (!incomingToken || !storedToken || incomingToken !== storedToken) {
            return new Response("Unauthorized: invalid callback token", { status: 403 });
        }

        // Clear the token — it's single-use
        await this.ctx.storage.delete("callbackToken");

        try {
            const researchData = await request.json();

            await this.loadHistory();

            // Phase 2: Synthesize a friendly itinerary from raw API data
            const aiResponse = await this.synthesizeResearchResponse(researchData);

            this.messages.push({ role: "assistant", content: aiResponse });
            await this.saveHistory();

            // Push the synthesized response to connected WebSocket clients
            this.broadcastToClients(JSON.stringify({ type: "message", content: aiResponse }));

            return new Response("OK", { status: 200 });
        } catch (err) {
            const errorMsg = `Synthesis error: ${err instanceof Error ? err.message : String(err)}`;
            this.broadcastToClients(JSON.stringify({ type: "error", content: errorMsg }));
            return new Response(errorMsg, { status: 500 });
        }
    }

    // ── Broadcast to all connected WebSocket clients ─────────
    private broadcastToClients(message: string): void {
        const sockets = this.ctx.getWebSockets();
        for (const ws of sockets) {
            try {
                ws.send(message);
            } catch {
                // Socket may have disconnected
            }
        }
    }

    // ── Phase 2: Synthesize research into a friendly response ─
    private async synthesizeResearchResponse(researchData: unknown): Promise<string> {
        const systemPrompt: ChatMessage = {
            role: "system",
            content: [
                "You are a friendly and knowledgeable AI travel agent.",
                "Help users plan trips by researching destinations, recommending hotels, flights, and activities within their budget.",
                "Be concise but helpful. Use a warm, professional tone.",
            ].join(" "),
        };

        const synthesisInstruction: ChatMessage = {
            role: "user",
            content: [
                "Based on this travel research data, provide a helpful summary for the user.",
                "Include weather, travel advisories, flight options, hotel options, and activities.",
                "Be friendly and concise. Format the information clearly.",
                `Research data: ${JSON.stringify(researchData)}`,
            ].join("\n"),
        };

        const synthesisMessages: ChatMessage[] = [
            systemPrompt,
            ...this.messages,
            synthesisInstruction,
        ];

        const response = await this.env.AI.run(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            { messages: synthesisMessages }
        );

        if (typeof response === "object" && response !== null && "response" in response) {
            return (response as { response: string }).response;
        }

        return "I received the travel research data but couldn't format a response. Please try again.";
    }
}
