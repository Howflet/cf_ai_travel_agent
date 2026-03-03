import { useState, useEffect, useRef, useCallback } from "react";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface UseChatReturn {
    messages: ChatMessage[];
    input: string;
    setInput: (value: string) => void;
    status: string;
    isConnected: boolean;
    sendMessage: () => void;
}

// ── Exponential backoff config ─────────────────────────────
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const BACKOFF_FACTOR = 2;

export function useChat(): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [status, setStatus] = useState("");
    const [isConnected, setIsConnected] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const retriesRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Get or create a session ID persisted across refreshes ─
    const getSessionId = useCallback((): string => {
        let id = sessionStorage.getItem("chatSessionId");
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem("chatSessionId", id);
        }
        return id;
    }, []);

    // ── Connect to the WebSocket ─────────────────────────────
    const connect = useCallback(() => {
        // Clean up any existing connection
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const sessionId = getSessionId();
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/chat?session=${sessionId}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            retriesRef.current = 0; // Reset backoff on successful connect
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as {
                    type: string;
                    content: string | ChatMessage[];
                };

                switch (data.type) {
                    case "message":
                        setMessages((prev) => [
                            ...prev,
                            { role: "assistant", content: data.content as string },
                        ]);
                        setStatus(""); // Clear any loading status
                        break;

                    case "status":
                        setStatus(data.content as string);
                        break;

                    case "history":
                        // Server sends existing chat history on reconnect
                        setMessages(data.content as ChatMessage[]);
                        break;

                    case "error":
                        setMessages((prev) => [
                            ...prev,
                            {
                                role: "assistant",
                                content: `⚠️ ${data.content as string}`,
                            },
                        ]);
                        setStatus("");
                        break;
                }
            } catch {
                // Non-JSON message — ignore
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            wsRef.current = null;

            // Exponential backoff reconnect
            const delay = Math.min(
                BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, retriesRef.current),
                MAX_DELAY_MS
            );
            retriesRef.current += 1;

            reconnectTimerRef.current = setTimeout(() => {
                connect();
            }, delay);
        };

        ws.onerror = () => {
            // onclose will fire after onerror, so reconnect logic is there
        };
    }, [getSessionId]);

    // ── Lifecycle: connect on mount, cleanup on unmount ───────
    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);

    // ── Send a message ───────────────────────────────────────
    const sendMessage = useCallback(() => {
        const text = input.trim();
        if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }

        // Optimistically add the user message to local state
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInput("");

        // Send to the server
        wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    }, [input]);

    return { messages, input, setInput, status, isConnected, sendMessage };
}
