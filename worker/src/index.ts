import { DurableObject } from "cloudflare:workers";

export interface Env {
    AI: Ai;
    CHAT_SESSION: DurableObjectNamespace;
    TRAVEL_RESEARCH_WORKFLOW: Workflow;
    AMADEUS_API_KEY: string;
    AMADEUS_API_SECRET: string;
    FOURSQUARE_API_KEY: string;
    OPENWEATHERMAP_API_KEY: string;
}

// ── Durable Object: ChatSession ────────────────────────────
export class ChatSession extends DurableObject<Env> {
    async fetch(request: Request): Promise<Response> {
        // TODO: Upgrade to WebSocket, manage chat history, orchestrate Workflows + AI
        return new Response("ChatSession stub", { status: 200 });
    }
}

// ── Worker entry point ─────────────────────────────────────
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Route WebSocket / chat requests to the Durable Object
        if (url.pathname.startsWith("/api/chat")) {
            const sessionId = url.searchParams.get("session") ?? "default";
            const id = env.CHAT_SESSION.idFromName(sessionId);
            const stub = env.CHAT_SESSION.get(id);
            return stub.fetch(request);
        }

        return new Response("CF AI Travel Agent — Worker", { status: 200 });
    },
} satisfies ExportedHandler<Env>;
