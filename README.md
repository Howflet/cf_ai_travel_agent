# AI Travel Agent — README

> A real-time, stateful AI-powered travel agent chatbot built entirely on Cloudflare's developer platform.

---

## Project Description

This application is an AI travel assistant that helps users plan trips through natural conversation. Tell it where you want to go, when, and your budget — it will research flights, hotels, weather forecasts, travel advisories, and local activities, then present a synthesized itinerary.

### Cloudflare Technologies Used

| Technology | Role |
|---|---|
| **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) | Intent parsing (extracting destination/dates/budget from conversation) and response synthesis (turning raw API data into a friendly itinerary) |
| **Durable Objects** (Hibernation API) | Stateful WebSocket session management, persistent chat history via durable storage, workflow orchestration |
| **Workflows** (`step.do()`) | Durable, multi-step external API calls — geocoding, weather, travel advisories, Amadeus flights/hotels, Foursquare activities |
| **Pages** (Vite + React) | Thin-client chat UI — zero business logic, pure presentation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Cloudflare Pages)                                │
│  React + Vite + Tailwind CSS                                │
│  WebSocket client · Chat UI · Zero business logic           │
└──────────────┬──────────────────────────────────────────────┘
               │ WebSocket (wss://)
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Worker Entry Point (index.ts)                              │
│  Routes: /api/chat → DO  |  /api/workflow-complete → DO     │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  ChatSession Durable Object (ChatSession.ts)                │
│  • WebSocket upgrade + Hibernation API handlers             │
│  • Persistent chat history (ctx.storage)                    │
│  • Phase 1: Intent parsing (single LLM call)                │
│  • Phase 2: Response synthesis (LLM call on callback)       │
│  • Keyword gating to avoid unnecessary LLM calls            │
│  • Per-invocation callback token authentication             │
└──────────────┬──────────────────────────────────────────────┘
               │ Workflow.create()
               ▼
┌─────────────────────────────────────────────────────────────┐
│  TravelAgentWorkflow (workflow.ts)                          │
│  8 durable steps (step.do):                                 │
│  1. Geocoding (OpenWeatherMap)                              │
│  2. 5-day weather forecast (OpenWeatherMap)                 │
│  3. Travel advisories (travel-advisory.info)                │
│  4. Amadeus OAuth token                                     │
│  5. IATA code lookup (Amadeus city/airport search)          │
│  6. Flight search (Amadeus)                                 │
│  7. Hotel search (Amadeus)                                  │
│  8. Activities (Foursquare)                                 │
│  + Final callback step → POST to /api/workflow-complete     │
└─────────────────────────────────────────────────────────────┘
```

### Separation of Concerns

1. **Pages (Frontend)** — Pure presentation. Manages a WebSocket connection, renders chat messages, and sends user text. Contains zero business logic.
2. **Durable Objects (Session Manager)** — The "brain." Handles WebSocket lifecycle via the Hibernation API, persists conversation history in durable storage, runs LLM inference for intent extraction and response synthesis, and orchestrates Workflow execution.
3. **Workflows (Action Engine)** — Durable, multi-step API orchestration. Each `step.do()` is independently retryable. Graceful error handling means the workflow completes even if individual APIs fail, returning partial data.
4. **Workers AI (Intelligence)** — Two-phase LLM usage: (a) extract structured travel parameters from natural conversation, (b) synthesize raw API JSON into a friendly, readable itinerary.

---

## Local Setup & Running Instructions

### Prerequisites

- **Node.js** ≥ 18.0 (includes `npm`)
- A **Cloudflare account** (free tier works) — required for `wrangler dev` to access Workers AI
- *(Optional)* API keys for full external data (see Step 3)

### Step 1: Clone the Repository

```bash
git clone https://github.com/<your-username>/cf_ai_travel_agent.git
cd cf_ai_travel_agent
```

> **Note:** The repository is named `cf_ai_travel_agent` per the assignment requirements.

### Step 2: Install Dependencies

```bash
# Backend (Cloudflare Worker)
cd worker
npm install

# Frontend (React/Vite)
cd ../frontend
npm install
```

### Step 3: Configure Environment Variables

Create a `.dev.vars` file in the **`worker/`** directory. This file is gitignored and will never be committed.

```bash
# worker/.dev.vars
AMADEUS_API_KEY=your_amadeus_api_key
AMADEUS_API_SECRET=your_amadeus_api_secret
FOURSQUARE_API_KEY=your_foursquare_api_key
OPENWEATHERMAP_API_KEY=your_openweathermap_api_key
WORKER_BASE_URL=http://localhost:8787
```

#### Where to Get Free API Keys

| Service | Sign Up | Free Tier |
|---|---|---|
| **OpenWeatherMap** | [openweathermap.org/api](https://openweathermap.org/api) | 1,000 calls/day (free) |
| **Amadeus** (test env) | [developers.amadeus.com](https://developers.amadeus.com) | 500 calls/month (free test) |
| **Foursquare** | [location.foursquare.com/developer](https://location.foursquare.com/developer/) | Free tier available |

> **Without API keys:** The chatbot will still work for conversation — Workers AI intent parsing and response generation function without external keys. External API steps in the Workflow will return graceful error objects instead of crashing.

### Step 4: Start the Backend

```bash
cd worker
npx wrangler dev
```

This starts the Cloudflare Worker locally on `http://localhost:8787`. You will be prompted to authenticate with your Cloudflare account on first run (required for Workers AI access).

### Step 5: Start the Frontend

In a **separate terminal**:

```bash
cd frontend
npm run dev
```

This starts the Vite dev server (usually `http://localhost:5173`). The Vite proxy automatically forwards `/api/*` requests and WebSocket connections to the Worker at `localhost:8787`.

### Step 6: Open the App

Navigate to **http://localhost:5173** in your browser. You should see the chat interface. Try:

- `"Hello"` — casual chat (single LLM call)
- `"I want to plan a trip to Paris in April with a $2000 budget"` — triggers intent parsing → workflow → synthesis
- `"I want to visit Tokyo"` → `"Next month"` → `"$3000"` — multi-turn parameter collection

---

## Project Structure

```
cf_ai_travel_agent/
├── worker/                     # Cloudflare Worker backend
│   ├── src/
│   │   ├── index.ts            # Worker entry point & routing
│   │   ├── ChatSession.ts      # Durable Object (session manager)
│   │   └── workflow.ts         # Cloudflare Workflow (API orchestration)
│   ├── wrangler.toml           # Wrangler config (bindings, DO, Workflows)
│   └── package.json
├── frontend/                   # React/Vite frontend (Cloudflare Pages)
│   ├── src/
│   │   ├── App.tsx             # Chat UI component
│   │   ├── hooks/useChat.ts    # WebSocket hook (connection, state)
│   │   ├── main.tsx            # Entry point
│   │   └── index.css           # Tailwind CSS import
│   ├── vite.config.ts          # Vite config (Tailwind plugin, API proxy)
│   └── package.json
├── PROMPTS.md                  # All AI prompts used during development
├── tracker.md                  # Project status tracker
└── README.md                   # This file
```

---

## AI Prompts

All AI prompts used during the development of this project are documented in [`PROMPTS.md`](./PROMPTS.md).
