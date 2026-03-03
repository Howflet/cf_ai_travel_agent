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

---

## Prompt 3 — Hibernation API Refactor (2026-03-03)

**Purpose:** Refactor ChatSession to use the correct Cloudflare Hibernation API pattern.

<details>
<summary>Full prompt</summary>

With Cloudflare's Hibernation API acceptWebSocket, the recommended pattern is to use the webSocketMessage() handler method on the class instead.

</details>

**Result:** Replaced `addEventListener` with class-level `webSocketMessage()`, `webSocketClose()`, and `webSocketError()` handlers. Added history rehydration inside `webSocketMessage()` for post-hibernation wake-up.

---

## Prompt 4 — Workflow Action Engine (2026-03-03)

**Purpose:** Implement the TravelAgentWorkflow for multi-step external API orchestration.

<details>
<summary>Full prompt</summary>

Review `tracker.md`. We are now going to implement "The Action Engine" of our chatbot: The Cloudflare Workflow that fetches external API data. Update `PROMPTS.md` with this prompt and move "API Orchestration (Workflows)" to "In Progress".

1. **Define the Workflow (`src/workflow.ts`):**
   - Create a class `TravelAgentWorkflow` that extends `WorkflowEntrypoint<Env, TravelParams>`.
   - Define the `TravelParams` interface: `{ destination: string, startDate: string, endDate: string, budget: number }`.
   - In the `run(event, step)` method, implement the following steps using `await step.do()`:
     - **Step 1: Geocoding:** Fetch lat/lon for the destination (OpenWeatherMap geocoding endpoint).
     - **Step 2: Weather:** Fetch 5-day forecast using coordinates from Step 1.
     - **Step 3: Advisories:** Fetch travel advisories from `https://www.travel-advisory.info/api`.
     - **Step 4: Amadeus Auth:** Fetch bearer token using `env.AMADEUS_API_KEY` and `env.AMADEUS_API_SECRET`.
     - **Step 5: Flights & Hotels:** Use the token to fetch flight offers and hotel listings.
     - **Step 6: Activities:** Fetch top POIs using Foursquare API and coordinates from Step 1.
   - Return a single aggregated JSON object.

2. **Update the Durable Object (`src/ChatSession.ts`):**
   - If the message includes the word "plan", trigger the workflow.
   - Trigger: `await this.env.TRAVEL_WORKFLOW.create({ id: sessionId, params: mockTravelParams })`.
   - Send status updates via WebSocket during workflow execution.

3. **Wrangler Configuration:**
   - Update `wrangler.toml` with `[[workflows]]` binding named `TRAVEL_WORKFLOW`, class `TravelAgentWorkflow`.
   - Declare API env vars with blank placeholders in `[vars]`.

</details>

**Result:** Created `workflow.ts` with `TravelAgentWorkflow` (6 durable steps with graceful error handling). Updated `ChatSession.ts` to detect "plan" and trigger workflow. Updated `wrangler.toml` with `TRAVEL_WORKFLOW` binding and `[vars]` placeholders.

---

## Prompt 5 — Critical Bug Fixes (2026-03-03)

**Purpose:** Fix 4 architectural and correctness issues identified during code review.

<details>
<summary>Full prompt</summary>

1. Polling with setTimeout inside a Durable Object (ChatSession.ts:124): holds execution context open for up to 60 seconds, defeating Hibernation API and risking CPU limits. Fix: use alarms.
2. History corruption on synthesis (ChatSession.ts:143–146): push/pop pattern on this.messages is fragile. Fix: separate messages array for synthesis.
3. API keys exposed in workflow step results (workflow.ts:31, 50): OPENWEATHERMAP_API_KEY embedded in URL strings could leak via workflow logs. Fix: sanitize.
4. Broken IATA code derivation (workflow.ts:136): destination.substring(0,3).toUpperCase() is wrong for most cities. Fix: Amadeus city/airport search API.

</details>

**Result:** (1) Replaced setTimeout polling with `alarm()` + `ctx.storage.setAlarm()` — DO returns immediately, checks status every 2s via alarms. (2) `synthesizeResearchResponse()` builds standalone messages array without modifying `this.messages`. (3) URLs built with `URLSearchParams`, error messages sanitized with regex to strip `appid=` values. (4) Added Step 4b (`resolve-iata-code`) using Amadeus `/v1/reference-data/locations` endpoint.

---

## Prompt 6 — LLM Intent Parsing & Workflow Callback (2026-03-03)

**Purpose:** Replace hardcoded "plan" keyword detection with intelligent LLM-based intent parsing and implement a non-blocking workflow callback mechanism.

<details>
<summary>Full prompt</summary>

Review `tracker.md`. We are now going to implement "The Voice: Intent Parsing" to make our chatbot conversational. Update `PROMPTS.md` with this prompt and move "LLM Intent Parsing" to "In Progress".

1. **Implement the Intent Parser Function:**
   - Create a helper method `parseUserIntent(userMessage: string)` inside `ChatSession`.
   - Call Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
   - Use this exact System Prompt: "You are a travel parameter extractor. Extract the destination, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), and budget (integer USD) from the user's input. The current date is March 2026. Respond ONLY with a raw JSON object containing these exact keys: 'destination', 'startDate', 'endDate', 'budget'. If any piece of information is missing, set its value to null. Do not include markdown formatting or extra text."
   - Parse the resulting string into a TypeScript object/interface.

2. **Update the Message Handling Logic:**
   - Pass the full chat history to `parseUserIntent`.
   - **Scenario A (Missing Data):** If any required field is null, call Workers AI to ask the user for the missing details conversationally.
   - **Scenario B (Complete Data):** Trigger the Workflow with the parsed parameters.

3. **Handle Workflow Completion (The Callback):**
   - Add a new `fetch` route to the DO (POST `/api/workflow-complete`).
   - Instruct the `TravelAgentWorkflow` to make a fetch request to this endpoint when finished, passing the aggregated JSON as payload.
   - When the DO receives this payload, it runs Phase 2: Synthesis to summarize the itinerary and push it to the user over WebSocket.

</details>

**Result:** (1) Added `parseUserIntent()` using the exact system prompt — sends full conversation history to LLM, parses JSON with markdown fence stripping. (2) Scenario A: `askForMissingDetails()` generates natural follow-up questions. Scenario B: `triggerWorkflow()` starts workflow with parsed params. (3) Removed alarm-based polling; workflow now POSTs results to `/api/workflow-complete` via a final `callback-to-session` step. Added `callbackSessionId` to `TravelParams`. Updated `index.ts` routing for the callback endpoint.

---

## Prompt 7 — Security, Performance & Type-Safety Fixes (2026-03-03)

**Purpose:** Fix 4 issues: unauthenticated callback, hardcoded hostname, double LLM calls, and TravelParams type mismatch.

<details>
<summary>Full prompt</summary>

1. Unauthenticated /api/workflow-complete: Anyone can POST fabricated results. Fix: shared secret per invocation.
2. Hardcoded "https://cf-ai-travel-agent.workers.dev": Won't work in local dev. Fix: WORKER_BASE_URL env var.
3. Every message triggers 2 LLM calls (parseUserIntent then askForMissingDetails). Fix: single combined call or keyword gate.
4. TravelParams type mismatch: DO spreads callbackSessionId into a type that doesn't include it. Fix: proper interface hierarchy.

</details>

**Result:** (1) Per-invocation `callbackToken` generated via `crypto.getRandomValues()`, stored in DO storage, sent in `X-Callback-Token` header, verified + cleared on receipt. (2) `WORKER_BASE_URL` added to `Env` and `wrangler.toml [vars]` (defaults to `http://localhost:8787`). (3) `TRAVEL_KEYWORDS` regex gates intent parsing; `parseIntentAndRespond()` returns both params + reply in one call. (4) Split into `TravelSearchParams` (user-facing) and `TravelParams extends TravelSearchParams` (adds `callbackSessionId` + `callbackToken`).

---

## Prompt 8 — Frontend Chat UI (2026-03-03)

**Purpose:** Implement the final component: a React/Vite chat frontend hosted on Cloudflare Pages as a pure presentation layer.

<details>
<summary>Full prompt</summary>

1. Frontend Setup: Vite React app in `frontend/`, install `lucide-react` for icons and `tailwindcss` for styling.
2. WebSocket State Management (`useChat.ts`): Random sessionId (persisted in sessionStorage), WebSocket connection with exponential backoff, state for messages/input/status/isConnected.
3. Message Handling: Parse incoming JSON (message/status/history/error types), auto-scroll on new messages.
4. UI Layout: Mobile-responsive chat container, user vs assistant bubbles, status bar with spinner, disabled send when disconnected or empty.
5. Local Dev Config: Vite proxy for `/api/*` to `localhost:8787`.

</details>

**Result:** (1) `useChat.ts` custom hook — WebSocket lifecycle with `crypto.randomUUID()` session IDs, exponential backoff (1s–30s), handles message/status/history/error types. (2) `App.tsx` — dark gradient UI with glassmorphism, Plane/Bot/User/Send icons, message bubbles (right-aligned blue for user, left-aligned translucent for assistant), animated spinner status, suggestion chips, connection indicator. (3) `vite.config.ts` — `@tailwindcss/vite` plugin + `/api` proxy with `ws: true`. (4) Inter font via Google Fonts, SEO meta tags.
