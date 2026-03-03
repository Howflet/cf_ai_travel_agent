# CF AI Travel Agent — Project Tracker

> Single source of truth for project status and requirements.

---

## Project Requirements

- Build a real-time, stateful AI-powered travel agent chatbot.
- Research destinations, recommend hotels/flights/activities within a user's budget.
- Check travel advisories and weather.
- Repository must be named `cf_ai_travel_agent`.
- Track all AI prompts used during development in `PROMPTS.md`.

---

## Architecture Stack

| Layer | Technology | Role |
|---|---|---|
| **Frontend (Chat UI)** | Cloudflare Pages + React/Vite | Pure presentation & WebSocket client. Zero business logic. |
| **Brain (Session Manager)** | Cloudflare Durable Objects | WebSocket upgrade, chat history (durable storage), orchestration between user ↔ LLM ↔ Workflows. |
| **Action Engine (API Fetcher)** | Cloudflare Workflows (`step.do()`) | Durable, multi-step external API calls: Amadeus (flights/hotels), Travel Advisory, Foursquare (activities), OpenWeatherMap. |
| **Voice (Intelligence)** | Workers AI — `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Intent parsing (extract destination/budget) and synthesis (raw JSON → friendly response). |

### Component Boundaries

1. **Frontend** → sends text over WebSocket, renders messages/loading states. No logic.
2. **Durable Object** → upgrades HTTP→WS, stores conversation history, dispatches Workflow runs, feeds results + history to LLM.
3. **Workflows** → fetches external APIs via `step.do()`, returns aggregated JSON to the DO.
4. **Workers AI** → parses user intent, generates natural-language responses from API data.

---

## To-Do Features

- [x] Project scaffolding (Wrangler + Vite/React)
- [x] Durable Object: WebSocket server & chat history storage
- [x] Workflow: Amadeus flight search (`step.do()`)
- [x] Workflow: Amadeus hotel search (`step.do()`)
- [x] Workflow: Foursquare activity search (`step.do()`)
- [x] Workflow: Travel Advisory lookup (`step.do()`)
- [x] Workflow: OpenWeatherMap weather lookup (`step.do()`)
- [x] Workers AI: Intent parsing (destination, budget, dates)
- [x] Workers AI: Response synthesis
- [x] Frontend: Chat UI with WebSocket connection
- [x] Frontend: Loading/typing indicators
- [x] End-to-end integration testing
- [x] Documentation finalization (README, PROMPTS, .gitignore)

---

## Completed Features

- [x] `tracker.md` created
- [x] `PROMPTS.md` created (9 prompts logged)
- [x] `README.md` — comprehensive setup instructions & architecture
- [x] `.gitignore` — `.dev.vars` + node_modules excluded
- [x] Project scaffolding (Wrangler Worker + Vite/React frontend)
- [x] Durable Object: ChatSession with Hibernation API, durable history, Workers AI
- [x] TravelAgentWorkflow: 8-step multi-API orchestration + callback
- [x] Workers AI: Single combined intent+response call with keyword gating
- [x] Workers AI: Response synthesis (`synthesizeResearchResponse`)
- [x] Frontend: Chat UI (React/Vite, Tailwind, lucide-react, `useChat` hook)

---

## Known Bugs

_None._
