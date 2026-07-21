import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VoiceInput } from "@/components/VoiceInput";

export const Route = createFileRoute("/mock")({
  head: () => ({
    meta: [
      { title: "Mock interview — qa.repl" },
      { name: "description", content: "AI-powered mock interviews for QA engineers. Pick a topic, get drilled, receive instant feedback." },
    ],
  }),
  component: MockPage,
});

const TOPICS = [
  { id: "general", label: "General QA (API + SQL + Playwright)" },
  { id: "api", label: "API testing" },
  { id: "sql", label: "SQL" },
  { id: "playwright", label: "Playwright" },
  { id: "manual", label: "Manual testing & test strategy" },
];

function MockPage() {
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      tokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        topic: TOPICS.find((t) => t.id === topic)?.label ?? topic,
        jobDescription: (typeof window !== "undefined" ? localStorage.getItem("qa.repl.jd.v1") : null) ?? undefined,
      }),
      headers: (): Record<string, string> => {
        const token = tokenRef.current;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function start() {
    setStarted(true);
    setMessages([]);
    setTimeout(() => sendMessage({ text: "Please start the interview." }), 50);
  }

  async function saveSession() {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.error("Sign in to save sessions");
      return;
    }
    const transcript = messages.map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    }));
    const { error: err } = await supabase.from("mock_sessions").insert({
      user_id: sess.session.user.id,
      topic: TOPICS.find((t) => t.id === topic)?.label ?? topic,
      transcript,
    });
    if (err) toast.error(err.message);
    else toast.success("Saved to history");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-6">
      <header className="mb-4">
        <h1 className="font-mono text-2xl font-bold prompt">interview --topic</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              onClick={() => !started && setTopic(t.id)}
              disabled={started}
              className={`rounded border px-2.5 py-1 font-mono text-xs transition ${
                topic === t.id
                  ? "border-terminal/60 bg-terminal/15 text-terminal"
                  : "border-border bg-card text-muted-foreground hover:border-terminal/30"
              } ${started ? "opacity-60" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {!started ? (
        <div className="surface flex flex-1 flex-col items-center justify-center rounded-lg border border-border p-10 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            Pick a topic above. The AI interviewer will ask 5 questions, score each answer, and give a final report.
          </p>
          <button onClick={start} className="mt-6 rounded bg-terminal px-5 py-2 font-mono text-sm text-primary-foreground hover:opacity-90 glow">
            $ ./start-interview
          </button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="surface flex-1 space-y-4 overflow-y-auto rounded-lg border border-border p-4">
            {messages.map((m) => {
              const text = m.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("");
              return (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-terminal/15 border border-terminal/30 text-foreground"
                      : "bg-background border border-border"
                  }`}>
                    <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
                      {m.role === "user" ? "you" : "interviewer"}
                    </div>
                    <div className="prose prose-sm max-w-none prose-pre:bg-card prose-pre:border prose-pre:border-border prose-code:text-terminal">
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}
            {status === "streaming" && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                  <Loader2 className="inline h-3 w-3 animate-spin" /> thinking…
                </div>
              </div>
            )}
            {error && <div className="rounded border border-destructive/40 bg-destructive/10 p-2 font-mono text-xs text-destructive">{error.message}</div>}
          </div>

          <form onSubmit={submit} className="mt-3 flex gap-2">
            <div className="flex-1">
              <VoiceInput
                value={input}
                onChange={setInput}
                placeholder="Type your answer…"
                multiline={false}
                className="flex-1 rounded border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus:border-terminal/60"
                containerClassName="w-full"
                inputProps={{ className: "flex-1 rounded border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus:border-terminal/60" }}
              />
            </div>
            <button type="submit" disabled={status === "streaming"} className="inline-flex items-center gap-1.5 rounded bg-terminal px-3 py-2 font-mono text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> send
            </button>
            <button type="button" onClick={saveSession} className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 font-mono text-sm hover:border-terminal/40">
              <Save className="h-3.5 w-3.5" /> save
            </button>
          </form>
        </>
      )}
    </main>
  );
}
