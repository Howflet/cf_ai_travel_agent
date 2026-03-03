// Re-export the Durable Object and Workflow classes so Wrangler can find them
export { ChatSession } from "./ChatSession";
export { TravelResearchWorkflow } from "./workflows";

export interface Env {
    AI: Ai;
    CHAT_SESSION: DurableObjectNamespace;
    TRAVEL_RESEARCH_WORKFLOW: Workflow;
    AMADEUS_API_KEY: string;
    AMADEUS_API_SECRET: string;
    FOURSQUARE_API_KEY: string;
    OPENWEATHERMAP_API_KEY: string;
}

// ── Worker entry point ─────────────────────────────────────
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Route: /api/chat/:sessionId → Durable Object
        const chatMatch = url.pathname.match(/^\/api\/chat\/([^/]+)$/);
        if (chatMatch) {
            const sessionId = chatMatch[1];
            const id = env.CHAT_SESSION.idFromName(sessionId);
            const stub = env.CHAT_SESSION.get(id);
            return stub.fetch(request);
        }

        // Health check / root
        return new Response("CF AI Travel Agent — Worker is running", {
            status: 200,
        });
    },
} satisfies ExportedHandler<Env>;
