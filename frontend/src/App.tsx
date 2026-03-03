import { useRef, useEffect } from "react";
import { Send, Plane, Bot, User, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useChat } from "./hooks/useChat";

function App() {
  const { messages, input, setInput, status, isConnected, sendMessage } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auto-scroll to bottom on new messages ────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // ── Handle Enter key ─────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = isConnected && input.trim().length > 0;

  return (
    <div className="flex flex-col h-dvh bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <Plane className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">
              AI Travel Agent
            </h1>
            <p className="text-xs text-slate-400">
              Powered by Cloudflare Workers AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 animate-pulse">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reconnecting…</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Message Area ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4" id="message-area">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-in fade-in">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20">
              <Plane className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">
                Where to next?
              </h2>
              <p className="text-sm text-slate-400 max-w-sm">
                Tell me your dream destination, travel dates, and budget — I'll
                research flights, hotels, weather, and activities for you.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {["🗼 Paris in April", "🏖️ Bali on $3000", "🗻 Tokyo next month"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-200 cursor-pointer"
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""
              }`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg ${msg.role === "user"
                  ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                  : "bg-gradient-to-br from-slate-600 to-slate-700"
                }`}
            >
              {msg.role === "user" ? (
                <User className="w-4 h-4 text-white" />
              ) : (
                <Bot className="w-4 h-4 text-white" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[80%] sm:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user"
                  ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-md"
                  : "bg-white/8 text-slate-200 border border-white/10 rounded-tl-md"
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* ── Status indicator ──────────────────────────────── */}
        {status && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-md bg-white/5 border border-white/10 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>{status}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* ── Input Area ──────────────────────────────────────── */}
      <footer className="px-4 sm:px-6 py-4 border-t border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            id="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isConnected
                ? "Plan a trip to Paris in April with a $2000 budget…"
                : "Connecting…"
            }
            disabled={!isConnected}
            className="flex-1 px-4 py-3 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 disabled:opacity-50"
          />
          <button
            id="send-button"
            onClick={sendMessage}
            disabled={!canSend}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all duration-200 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
