# AI Prompts Log

> All AI prompts used during the development of `cf_ai_travel_agent`.

---

## Prompt 1 — Project Initialization (2026-03-03)

**Purpose:** Define the system architecture and initialize the workspace.

<details>
<summary>Full prompt</summary>

You are an expert full-stack developer specializing in Cloudflare's developer platform (Workers, Pages, Workflows, Durable Objects, and Workers AI).

We are building a real-time, stateful AI-powered travel agent chatbot for a Cloudflare engineering assignment. The application will research destinations, recommend hotels/flights/activities within a user's budget, and check travel advisories.

To meet the strict assignment requirements, the repository must be named `cf_ai_travel_agent`.

### System Architecture & Boundaries
Our application consists of four distinct components. You must adhere to these strict boundaries:

1. **Frontend: The Chat UI (Cloudflare Pages + React/Vite)**
   - Role: Pure presentation and user input. Maintains a WebSocket connection to the backend.
   - Constraint: Contains zero business logic. It only sends text over the WebSocket and renders incoming messages or loading states.

2. **The Brain: Session Manager (Cloudflare Durable Objects)**
   - Role: State management and real-time communication.
   - Responsibility: Upgrades HTTP requests to WebSockets, maintains conversational history in durable storage, and orchestrates requests between the user, the LLM, and Workflows.

3. **The Action Engine: Async API Fetcher (Cloudflare Workflows)**
   - Role: Durable, multi-step API coordination (`step.do()`).
   - Responsibility: Executes slow external API calls (Amadeus for flights/hotels, Travel Advisory API, Foursquare for activities, OpenWeatherMap). Returns aggregated JSON data back to the Durable Object.

4. **The Voice: Intelligence (Workers AI - `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)**
   - Role: Intent parsing (extracting destination/budget from user text) and Synthesis (turning raw API JSON + chat history into a friendly response).

### Initialization Instructions
Before writing any core application code, you must initialize the workspace methodically. Execute the following steps in exact order:

1. Create a `tracker.md` file in the root directory. This is our single source of truth. Set it up with sections: "Project Requirements", "Architecture Stack", "To-Do Features", "Completed Features", and "Known Bugs". Populate the architecture and requirements based on the details above.
2. Create a `PROMPTS.md` file. Add an initial entry documenting this exact prompt, as the assignment requires tracking all AI prompts used during development.
3. Create a `README.md` file with placeholder sections for "Project Description", "Architecture", and "Local Running Instructions".
4. Initialize the base Cloudflare project using Wrangler, setting up the directories for the React/Vite frontend and the Worker/Workflows/Durable Objects backend.

Do not proceed to building the actual logic until these files are created and the `tracker.md` is fully populated. Ask me for confirmation to proceed once Step 4 is complete.

</details>

**Result:** Created `tracker.md`, `PROMPTS.md`, `README.md`, and initialized the Cloudflare project.

---

## Prompt 2 — Durable Object Session Manager (2026-03-03)

**Purpose:** Implement the real-time WebSocket "Brain" of the chatbot using Cloudflare Durable Objects.

<details>
<summary>Full prompt</summary>

Review `tracker.md`. We are now going to implement "The Brain" of our chatbot: The Durable Object Session Manager. Update `PROMPTS.md` with this prompt and move "Session Manager (Durable Objects)" to "In Progress".

In the backend Worker directory, implement the following to establish our real-time WebSocket architecture:

1. **Worker Routing (`src/index.ts`):** - Export a default fetch handler.
   - Route requests matching `/api/chat/:sessionId` to the `ChatSession` Durable Object. Use the `sessionId` to generate the Durable Object ID.

2. **Durable Object Class (`src/ChatSession.ts`):**
   - Create a class `ChatSession` that extends `DurableObject`.
   - In its `fetch` method, handle the WebSocket upgrade. Use `new WebSocketPair()`, return the client socket in the Response, and call `accept()` on the server socket.
   - Use `this.ctx.storage` to persist a `messages` array (the chat history). Load this history from storage when the object wakes up.
   - Set up an event listener for `message` on the WebSocket.

3. **Temporary Message Handling (Mocking the AI):**
   - When a user text message arrives, append `{ role: "user", content: text }` to the history and save to storage.
   - Immediately send a status update via WebSocket: `JSON.stringify({ type: "status", content: "Thinking..." })`.
   - For now, before we hook up Workflows, just make a direct call to Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) using the chat history to get a basic response.
   - Append the AI's response to the history as `{ role: "assistant" }`, save to storage, and send it to the client: `JSON.stringify({ type: "message", content: aiResponse })`.

4. **Wrangler Configuration:**
   - Update `wrangler.toml` to include the `[durable_objects]` binding (e.g., `binding = "CHAT_SESSION"`) and the necessary migration configurations.
   - Ensure the Workers AI binding is also present.

Stop and ask for my review once the Durable Object is implemented and `wrangler.toml` is correctly configured. Do not build the frontend yet.

</details>

**Result:** Implemented `ChatSession.ts` with WebSocket upgrade, durable chat history, and Workers AI integration. Updated `index.ts` routing and verified `wrangler.toml` bindings.
