import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

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

    // ── WebSocket upgrade (fetch) ────────────────────────────
    async fetch(request: Request): Promise<Response> {
        // Only accept WebSocket upgrades
        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
            return new Response("Expected WebSocket upgrade", { status: 426 });
        }

        // Load chat history from durable storage
        await this.loadHistory();

        // Create the WebSocket pair
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // Accept the server side via Hibernation API
        this.ctx.acceptWebSocket(server);

        // Send existing chat history to the reconnecting client
        if (this.messages.length > 0) {
            server.send(
                JSON.stringify({
                    type: "history",
                    content: this.messages,
                })
            );
        }

        // Return the client socket to the caller
        // Message handling is done via webSocketMessage() below
        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    // ── Hibernation API: message handler ─────────────────────
    // Called by the runtime when a message arrives, even after hibernation.
    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

        try {
            // Rehydrate history — the DO may have been evicted since fetch()
            await this.loadHistory();

            let parsed: { type?: string; content?: string };
            try {
                parsed = JSON.parse(raw);
            } catch {
                // Treat plain strings as user messages
                parsed = { type: "message", content: raw };
            }

            const userText = parsed.content?.trim();
            if (!userText) return;

            // 1. Append user message to history & persist
            this.messages.push({ role: "user", content: userText });
            await this.saveHistory();

            // 2. Send "thinking" status to the client
            ws.send(JSON.stringify({ type: "status", content: "Thinking..." }));

            // 3. Call Workers AI with the full conversation history
            const aiResponse = await this.callWorkersAI();

            // 4. Append assistant response to history & persist
            this.messages.push({ role: "assistant", content: aiResponse });
            await this.saveHistory();

            // 5. Send the AI response to the client
            ws.send(JSON.stringify({ type: "message", content: aiResponse }));
        } catch (err) {
            const errorMsg =
                err instanceof Error ? err.message : "Unknown error occurred";
            ws.send(JSON.stringify({ type: "error", content: errorMsg }));
        }
    }

    // ── Hibernation API: close handler ───────────────────────
    async webSocketClose(
        ws: WebSocket,
        code: number,
        reason: string,
        wasClean: boolean
    ): Promise<void> {
        ws.close(code, "Durable Object is closing WebSocket");
    }

    // ── Hibernation API: error handler ───────────────────────
    async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
        console.error("WebSocket error:", error);
        ws.close(1011, "WebSocket error");
    }

    // ── Workers AI integration ───────────────────────────────
    private async callWorkersAI(): Promise<string> {
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
            {
                messages: [systemPrompt, ...this.messages],
            }
        );

        // Workers AI returns { response: string } for text generation
        if (typeof response === "object" && response !== null && "response" in response) {
            return (response as { response: string }).response;
        }

        return "I'm sorry, I couldn't generate a response right now. Please try again.";
    }
}
