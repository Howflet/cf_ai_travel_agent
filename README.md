# CF AI Travel Agent

> A real-time, stateful AI-powered travel agent chatbot built on Cloudflare's developer platform.

---

## Project Description

CF AI Travel Agent is a conversational chatbot that helps users plan trips. It can:

- **Research destinations** — weather, travel advisories, and local activities.
- **Recommend flights & hotels** — via Amadeus API, filtered by budget.
- **Suggest activities** — via Foursquare Places API.
- **Chat naturally** — powered by Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`).

All interactions happen in real time over WebSockets.

---

## Architecture

```
┌─────────────┐  WebSocket  ┌─────────────────────┐
│  React/Vite │◄───────────►│  Durable Object     │
│  (Pages)    │             │  (Session Manager)  │
└─────────────┘             └────────┬────────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                 ┌─────────────────┐   ┌──────────────┐
                 │  Workflows      │   │  Workers AI  │
                 │  (API Fetcher)  │   │  (LLM)       │
                 └─────────────────┘   └──────────────┘
```

| Component | Technology | Responsibility |
|---|---|---|
| Frontend | Cloudflare Pages + React/Vite | Chat UI, WebSocket client |
| Session Manager | Durable Objects | WebSocket server, chat history, orchestration |
| API Fetcher | Workflows | External API calls (Amadeus, Foursquare, Weather, Advisories) |
| Intelligence | Workers AI | Intent parsing, response synthesis |

---

## Local Running Instructions

_Instructions will be added after project scaffolding is complete._

### Prerequisites

- Node.js ≥ 18
- npm or pnpm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account (for Workers AI and deployment)

### Development

```bash
# Install dependencies
npm install

# Run the backend (Worker + DO + Workflows)
cd worker
npx wrangler dev

# Run the frontend
cd frontend
npm run dev
```

### Deployment

```bash
# Deploy the Worker
cd worker
npx wrangler deploy

# Deploy the frontend to Pages
cd frontend
npm run build
npx wrangler pages deploy dist
```

---

## External APIs

| API | Purpose |
|---|---|
| [Amadeus](https://developers.amadeus.com/) | Flight & hotel search |
| [Foursquare Places](https://developer.foursquare.com/) | Activity recommendations |
| [OpenWeatherMap](https://openweathermap.org/api) | Weather forecasts |
| [Travel Advisory API](https://www.travel-advisory.info/) | Country-level travel advisories |
