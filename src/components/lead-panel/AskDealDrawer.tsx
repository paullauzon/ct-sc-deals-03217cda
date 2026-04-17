import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Lead } from "@/types/lead";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatMessage { role: "user" | "assistant"; content: string }

interface AskDealDrawerProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SUGGESTED: { label: string; prompt: string }[] = [
  { label: "What's the #1 risk?", prompt: "What is the single biggest risk on this deal right now, and what should I do about it this week?" },
  { label: "Draft a re-engage email", prompt: "Draft a short re-engagement email for this lead. Reference what's actually happened on the deal. Under 80 words. No filler." },
  { label: "Where do they stand?", prompt: "Give me a 4-bullet summary of where this prospect stands: intent, biggest concern, who matters most internally, what's blocking yes." },
  { label: "What objection should I prep for?", prompt: "Based on the deal so far, what is the most likely objection in our next conversation and how should I handle it?" },
];

const STORAGE_KEY_PREFIX = "ask-deal-chat:";

export function AskDealDrawer({ lead, open, onOpenChange }: AskDealDrawerProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${lead.id}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Persist per-lead
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30))); } catch {}
  }, [messages, storageKey]);

  // Reload thread when lead changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      setMessages(raw ? JSON.parse(raw) : []);
    } catch { setMessages([]); }
  }, [storageKey]);

  // Auto-scroll on new tokens
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Cancel any in-flight request when drawer closes
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setStreaming(false);
    }
  }, [open]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-deal`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ leadId: lead.id, messages: next }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("Rate limit hit, try again in a moment.");
        else if (resp.status === 402) toast.error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
        else toast.error("Couldn't reach the AI. Try again.");
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) upsert(c);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("ask-deal stream error", e);
        toast.error("AI chat failed. Try again.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, streaming, lead.id]);

  const clear = () => {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch {}
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Ask about {lead.name}
            </span>
            {messages.length > 0 && (
              <button
                onClick={clear}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Clear thread"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            )}
          </SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                I have full context on this deal — meetings, stakeholders, emails, objections, intelligence. Ask anything.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED.map(s => (
                  <button
                    key={s.label}
                    onClick={() => send(s.prompt)}
                    className="text-[11px] px-2 py-1 rounded border border-border bg-secondary/40 hover:bg-secondary text-foreground/80 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-foreground text-background ml-6"
                  : "bg-secondary/60 text-foreground mr-6",
              )}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm">
                  <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.role === "user" && (
            <div className="bg-secondary/60 rounded-lg px-3 py-2 text-sm text-muted-foreground mr-6 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about this deal…"
              rows={2}
              disabled={streaming}
              className="text-sm resize-none min-h-[44px]"
            />
            <Button
              size="sm"
              onClick={() => send(input)}
              disabled={!input.trim() || streaming}
              className="h-9 w-9 p-0 shrink-0"
            >
              {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">⏎ to send · Shift+⏎ for newline</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
