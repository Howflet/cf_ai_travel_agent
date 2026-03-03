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

- [ ] Project scaffolding (Wrangler + Vite/React)
- [ ] Durable Object: WebSocket server & chat history storage
- [ ] Workflow: Amadeus flight search (`step.do()`)
- [ ] Workflow: Amadeus hotel search (`step.do()`)
- [ ] Workflow: Foursquare activity search (`step.do()`)
- [ ] Workflow: Travel Advisory lookup (`step.do()`)
- [ ] Workflow: OpenWeatherMap weather lookup (`step.do()`)
- [ ] Workers AI: Intent parsing (destination, budget, dates)
- [ ] Workers AI: Response synthesis
- [ ] Frontend: Chat UI with WebSocket connection
- [ ] Frontend: Loading/typing indicators
- [ ] End-to-end integration testing

---

## Completed Features

- [x] `tracker.md` created
- [x] `PROMPTS.md` created
- [x] `README.md` created

---

## Known Bugs

_None yet._
