import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import type { Env } from "./index";

// ── User-facing travel search params (what the DO extracts) ─
export interface TravelSearchParams {
    destination: string;
    startDate: string;
    endDate: string;
    budget: number;
}

// ── Full workflow params (includes callback metadata) ───────
export interface TravelParams extends TravelSearchParams {
    callbackSessionId: string;
    callbackToken: string;
}

// ── Aggregated result returned to the Durable Object ───────
export interface TravelResearchResult {
    geocoding: { lat: number; lon: number; name: string } | { error: string };
    weather: unknown;
    advisories: unknown;
    iataCode: { code: string } | { error: string };
    flights: unknown;
    hotels: unknown;
    activities: unknown;
}

export class TravelAgentWorkflow extends WorkflowEntrypoint<Env, TravelParams> {
    async run(event: WorkflowEvent<TravelParams>, step: WorkflowStep): Promise<TravelResearchResult> {
        const { destination, startDate, endDate, budget, callbackSessionId, callbackToken } = event.payload;

        // ──────────────────────────────────────────────────────
        // Step 1: Geocoding — resolve destination to lat/lon
        // API key is kept out of step output to avoid leaking
        // into workflow execution logs.
        // ──────────────────────────────────────────────────────
        const geocoding = await step.do("geocode-destination", async () => {
            try {
                const apiKey = this.env.OPENWEATHERMAP_API_KEY;
                const params = new URLSearchParams({
                    q: destination,
                    limit: "1",
                    appid: apiKey,
                });
                const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?${params}`);
                if (!res.ok) return { error: `Geocoding failed with status ${res.status}` };

                const data = (await res.json()) as Array<{ lat: number; lon: number; name: string; country: string }>;
                if (!data.length) return { error: `Could not find location: ${destination}` };

                return { lat: data[0].lat, lon: data[0].lon, name: `${data[0].name}, ${data[0].country}` };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // Sanitize: strip any URL fragments that might contain keys
                return { error: `Geocoding error: ${msg.replace(/appid=[^&\s]+/g, "appid=***")}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Step 2: Weather — 5-day forecast using coordinates
        // ──────────────────────────────────────────────────────
        const weather = await step.do("fetch-weather", async () => {
            if ("error" in geocoding) return { error: geocoding.error };
            try {
                const apiKey = this.env.OPENWEATHERMAP_API_KEY;
                const params = new URLSearchParams({
                    lat: String(geocoding.lat),
                    lon: String(geocoding.lon),
                    units: "metric",
                    cnt: "40",
                    appid: apiKey,
                });
                const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?${params}`);
                if (!res.ok) return { error: `Weather API failed with status ${res.status}` };

                const data = (await res.json()) as {
                    list: Array<{
                        dt_txt: string;
                        main: { temp: number; humidity: number };
                        weather: Array<{ description: string }>;
                    }>;
                };
                return data.list.map((entry) => ({
                    datetime: entry.dt_txt,
                    temp_c: entry.main.temp,
                    humidity: entry.main.humidity,
                    description: entry.weather[0]?.description ?? "N/A",
                }));
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return { error: `Weather error: ${msg.replace(/appid=[^&\s]+/g, "appid=***")}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Step 3: Travel Advisories
        // ──────────────────────────────────────────────────────
        const advisories = await step.do("fetch-advisories", async () => {
            try {
                const res = await fetch("https://www.travel-advisory.info/api");
                if (!res.ok) return { error: `Advisory API failed with status ${res.status}` };

                const data = (await res.json()) as {
                    data: Record<string, { name: string; advisory: { score: number; message: string } }>;
                };

                const countryName =
                    "error" in geocoding
                        ? destination
                        : geocoding.name.split(", ").pop() ?? destination;

                const match = Object.values(data.data).find(
                    (c) =>
                        c.name.toLowerCase().includes(countryName.toLowerCase()) ||
                        countryName.toLowerCase().includes(c.name.toLowerCase())
                );

                if (match) {
                    return { country: match.name, score: match.advisory.score, message: match.advisory.message };
                }
                return { message: `No advisory data found for ${countryName}` };
            } catch (err) {
                return { error: `Advisory error: ${err instanceof Error ? err.message : String(err)}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Step 4: Amadeus Auth — get bearer token
        // ──────────────────────────────────────────────────────
        const amadeusToken = await step.do("amadeus-auth", async () => {
            try {
                const res = await fetch("https://test.api.amadeus.com/v1/security/oauth2/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        grant_type: "client_credentials",
                        client_id: this.env.AMADEUS_API_KEY,
                        client_secret: this.env.AMADEUS_API_SECRET,
                    }),
                });
                if (!res.ok) return { error: `Amadeus auth failed with status ${res.status}` };

                const data = (await res.json()) as { access_token: string };
                return { token: data.access_token };
            } catch (err) {
                return { error: `Amadeus auth error: ${err instanceof Error ? err.message : String(err)}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Step 4b: IATA Code Lookup — resolve city name to proper
        // IATA airport code via Amadeus city/airport search
        // ──────────────────────────────────────────────────────
        const iataCode = await step.do("resolve-iata-code", async () => {
            if ("error" in amadeusToken) return { error: amadeusToken.error ?? "Amadeus auth failed" };
            try {
                const url = new URL("https://test.api.amadeus.com/v1/reference-data/locations");
                url.searchParams.set("keyword", destination);
                url.searchParams.set("subType", "CITY,AIRPORT");
                url.searchParams.set("page[limit]", "1");

                const res = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${amadeusToken.token}` },
                });
                if (!res.ok) {
                    return { error: `IATA lookup failed with status ${res.status}` };
                }

                const data = (await res.json()) as {
                    data: Array<{ iataCode: string; name: string; subType: string }>;
                };

                if (!data.data?.length) {
                    return { error: `No IATA code found for: ${destination}` };
                }

                return { code: data.data[0].iataCode };
            } catch (err) {
                return { error: `IATA lookup error: ${err instanceof Error ? err.message : String(err)}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Step 5: Flights & Hotels (Amadeus) — graceful errors
        // Uses the resolved IATA code instead of naive substring
        // ──────────────────────────────────────────────────────
        const flights = await step.do("search-flights", async () => {
            if ("error" in amadeusToken) return { error: amadeusToken.error ?? "Amadeus auth failed" };
            if ("error" in iataCode) return { error: iataCode.error ?? "IATA lookup failed" };
            try {
                const url = new URL("https://test.api.amadeus.com/v2/shopping/flight-offers");
                url.searchParams.set("originLocationCode", "NYC"); // placeholder — LLM-parsed origin coming later
                url.searchParams.set("destinationLocationCode", iataCode.code);
                url.searchParams.set("departureDate", startDate);
                url.searchParams.set("returnDate", endDate);
                url.searchParams.set("adults", "1");
                url.searchParams.set("max", "5");
                url.searchParams.set("maxPrice", String(budget));

                const res = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${amadeusToken.token}` },
                });
                if (!res.ok) {
                    const text = await res.text();
                    return { error: `Flights API failed (${res.status}): ${text.substring(0, 200)}` };
                }

                const data = (await res.json()) as { data: Array<{ type: string; id: string;[key: string]: string }> };
                return data.data ?? [];
            } catch (err) {
                return { error: `Flights error: ${err instanceof Error ? err.message : String(err)}` };
            }
        });

        const hotels = await step.do("search-hotels", async () => {
            if ("error" in amadeusToken || "error" in geocoding) {
                return {
                    error: "error" in amadeusToken
                        ? (amadeusToken.error ?? "Amadeus auth failed")
                        : ((geocoding as { error: string }).error ?? "Geocoding failed"),
                };
            }
            try {
                const url = new URL("https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-geocode");
                url.searchParams.set("latitude", String(geocoding.lat));
                url.searchParams.set("longitude", String(geocoding.lon));
                url.searchParams.set("radius", "30");
                url.searchParams.set("radiusUnit", "KM");

                const res = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${amadeusToken.token}` },
                });
                if (!res.ok) {
                    const text = await res.text();
                    return { error: `Hotels API failed (${res.status}): ${text.substring(0, 200)}` };
                }

                const data = (await res.json()) as { data: Array<{ name: string; hotelId: string;[key: string]: string }> };
                return (data.data ?? []).slice(0, 10);
            } catch (err) {
                return { error: `Hotels error: ${err instanceof Error ? err.message : String(err)}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Step 6: Activities (Foursquare)
        // ──────────────────────────────────────────────────────
        const activities = await step.do("search-activities", async () => {
            if ("error" in geocoding) return { error: geocoding.error };
            try {
                const url = new URL("https://api.foursquare.com/v3/places/search");
                url.searchParams.set("ll", `${geocoding.lat},${geocoding.lon}`);
                url.searchParams.set("radius", "10000");
                url.searchParams.set("categories", "16000"); // Landmarks & Outdoors
                url.searchParams.set("limit", "10");
                url.searchParams.set("sort", "RELEVANCE");

                const res = await fetch(url.toString(), {
                    headers: {
                        Authorization: this.env.FOURSQUARE_API_KEY,
                        Accept: "application/json",
                    },
                });
                if (!res.ok) {
                    const text = await res.text();
                    return { error: `Activities API failed (${res.status}): ${text.substring(0, 200)}` };
                }

                const data = (await res.json()) as {
                    results: Array<{
                        name: string;
                        location: { formatted_address: string };
                        categories: Array<{ name: string }>;
                    }>;
                };
                return data.results.map((place) => ({
                    name: place.name,
                    address: place.location?.formatted_address ?? "N/A",
                    category: place.categories?.[0]?.name ?? "N/A",
                }));
            } catch (err) {
                return { error: `Activities error: ${err instanceof Error ? err.message : String(err)}` };
            }
        });

        // ──────────────────────────────────────────────────────
        // Return the aggregated result
        // ──────────────────────────────────────────────────────
        const result: TravelResearchResult = { geocoding, weather, advisories, iataCode, flights, hotels, activities };

        // ──────────────────────────────────────────────────────
        // Final step: Callback to the Durable Object
        // POST the aggregated results to the ChatSession so it
        // can run Phase 2 synthesis and push to the client.
        // Uses WORKER_BASE_URL env var (not hardcoded hostname)
        // and X-Callback-Token header for authentication.
        // ──────────────────────────────────────────────────────
        await step.do("callback-to-session", async () => {
            const baseUrl = this.env.WORKER_BASE_URL;
            const callbackUrl = new URL("/api/workflow-complete", baseUrl);
            callbackUrl.searchParams.set("session", callbackSessionId);

            const res = await fetch(callbackUrl.toString(), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Callback-Token": callbackToken,
                },
                body: JSON.stringify(result),
            });

            if (!res.ok) {
                return { error: `Callback failed with status ${res.status}` };
            }
            return { success: true };
        });

        return result;
    }
}
