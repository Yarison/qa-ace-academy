import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trash2 } from "lucide-react";

type Row = {
  id: string;
  topic: string;
  created_at: string;
  transcript: { role: string; content: string }[];
};

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — qa.repl" }] }),
  component: History,
});

function History() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("mock_sessions")
      .select("id, topic, created_at, transcript")
      .order("created_at", { ascending: false });
    if (!error) setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);

  async function del(id: string) {
    await supabase.from("mock_sessions").delete().eq("id", id);
    load();
  }

  if (rows === null) return <div className="p-10 text-center"><Loader2 className="inline h-4 w-4 animate-spin text-terminal" /></div>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-mono text-2xl font-bold prompt">ls ~/.sessions</h1>
      {rows.length === 0 ? (
        <p className="mt-8 font-mono text-sm text-muted-foreground">
          No saved sessions yet. <Link to="/mock" className="text-terminal hover:underline">Run a mock interview →</Link>
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="surface rounded-lg border border-border">
              <div className="flex items-start gap-3 p-4">
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex-1 text-left">
                  <div className="font-mono text-sm text-terminal">{r.topic}</div>
                  <div className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.transcript.length} messages</div>
                </button>
                <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {open === r.id && (
                <div className="space-y-2 border-t border-border bg-background/50 p-4">
                  {r.transcript.map((m, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">{m.role}</span>
                      <p className="whitespace-pre-wrap text-foreground">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
