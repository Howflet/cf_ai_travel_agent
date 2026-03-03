// Re-export the Durable Object and Workflow classes so Wrangler can discover them
export { ChatSession } from "./ChatSession";
export { TravelAgentWorkflow } from "./workflow";

export interface Env {
    AI: Ai;
    CHAT_SESSION: DurableObjectNamespace;
    TRAVEL_WORKFLOW: Workflow;
    WORKER_BASE_URL: string;
    AMADEUS_API_KEY: string;
    AMADEUS_API_SECRET: string;
    FOURSQUARE_API_KEY: string;
    OPENWEATHERMAP_API_KEY: string;
}

// ── Worker entry point ─────────────────────────────────────
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Route: POST /api/workflow-complete → callback from Workflow to DO
        if (request.method === "POST" && url.pathname === "/api/workflow-complete") {
            const sessionId = url.searchParams.get("session") ?? "default";
            const id = env.CHAT_SESSION.idFromName(sessionId);
            const stub = env.CHAT_SESSION.get(id);
            return stub.fetch(request);
        }

        // Route: WebSocket / chat requests → Durable Object
        if (url.pathname.startsWith("/api/chat")) {
            const sessionId = url.searchParams.get("session") ?? "default";
            const id = env.CHAT_SESSION.idFromName(sessionId);
            const stub = env.CHAT_SESSION.get(id);
            return stub.fetch(request);
        }

        return new Response("CF AI Travel Agent — Worker", { status: 200 });
    },
} satisfies ExportedHandler<Env>;
