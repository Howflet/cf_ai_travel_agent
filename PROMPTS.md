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
