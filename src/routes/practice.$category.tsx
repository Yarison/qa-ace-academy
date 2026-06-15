import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listQuestions } from "@/lib/questions.functions";
import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";

const VALID = ["api", "sql", "playwright"] as const;
type Cat = (typeof VALID)[number];

const qOpts = (category: Cat) =>
  queryOptions({
    queryKey: ["questions", category],
    queryFn: () => listQuestions({ data: { category } }),
  });

export const Route = createFileRoute("/practice/$category")({
  params: {
    parse: (raw) => {
      const c = raw.category;
      if (!VALID.includes(c as Cat)) throw notFound();
      return { category: c as Cat };
    },
    stringify: (p) => ({ category: p.category }),
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.category.toUpperCase()} interview questions — qa.repl` },
      { name: "description", content: `Curated ${params.category} interview questions for QA engineers, with model answers.` },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(qOpts(params.category)),
  component: CategoryPage,
});

const diffColor: Record<string, string> = {
  easy: "text-terminal border-terminal/30 bg-terminal/10",
  medium: "text-amber border-amber/40 bg-amber/10",
  hard: "text-destructive border-destructive/40 bg-destructive/10",
};

function CategoryPage() {
  const { category } = Route.useParams();
  const { data } = useSuspenseQuery(qOpts(category));
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link to="/practice" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-terminal">
        <ArrowLeft className="h-3 w-3" /> back
      </Link>
      <h1 className="mt-4 font-mono text-2xl font-bold prompt">cat ./{category}.md</h1>
      <p className="mt-2 text-sm text-muted-foreground">{data.length} questions · click any to reveal the answer.</p>

      <ul className="mt-8 space-y-3">
        {data.map((q) => {
          const isOpen = !!open[q.id];
          return (
            <li key={q.id} className="surface overflow-hidden rounded-lg border border-border">
              <button
                onClick={() => setOpen((s) => ({ ...s, [q.id]: !s[q.id] }))}
                className="flex w-full items-start gap-3 p-4 text-left hover:bg-accent/40"
              >
                {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 text-terminal shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${diffColor[q.difficulty]}`}>{q.difficulty}</span>
                    {q.tags.slice(0, 3).map((t) => (
                      <span key={t} className="font-mono text-[10px] text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                  <p className="mt-2 text-foreground">{q.question}</p>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border bg-background/50 p-4 pl-11">
                  <p className="font-mono text-xs text-terminal-dim">// answer</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{q.answer}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
