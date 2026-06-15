import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Code2, Database, PlayCircle, MessageSquareCode } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "qa.repl — Interview prep for QA engineers" },
      { name: "description", content: "Practice API, SQL and Playwright questions. Run SQL in your browser. Take AI-powered mock interviews." },
    ],
  }),
  component: Home,
});

const tracks = [
  { to: "/practice/api", icon: Code2, name: "API testing", count: "REST, status codes, contracts, auth flows" },
  { to: "/practice/sql", icon: Database, name: "SQL", count: "Joins, window functions, optimization" },
  { to: "/practice/playwright", icon: PlayCircle, name: "Playwright", count: "Locators, network mocking, CI" },
] as const;

function Home() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-glow)" }} />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-terminal/30 bg-terminal/5 px-3 py-1 font-mono text-xs text-terminal">
            <span className="h-1.5 w-1.5 rounded-full bg-terminal" /> v1.0 — ready for review
          </div>
          <h1 className="font-mono text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            <span className="text-terminal">$</span> prep --role=qa
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-muted-foreground sm:text-lg">
            Sharpen your testing chops. Browse a curated bank of API, SQL and Playwright questions,
            run SQL against a live in-browser database, then drill with an AI mock interviewer.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 font-mono text-sm">
            <Link to="/practice" className="inline-flex items-center gap-2 rounded-md bg-terminal px-4 py-2 text-primary-foreground hover:opacity-90 glow">
              start practicing <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/mock" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 hover:border-terminal/40">
              <MessageSquareCode className="h-4 w-4" /> mock interview
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-mono text-sm text-muted-foreground prompt">tracks</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <Link key={t.to} to={t.to} className="group surface rounded-lg border border-border p-6 transition-all hover:border-terminal/40 hover:-translate-y-0.5">
              <t.icon className="h-6 w-6 text-terminal" />
              <h3 className="mt-4 font-mono text-lg font-medium">{t.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.count}</p>
              <span className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-terminal opacity-0 transition-opacity group-hover:opacity-100">
                open →
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Link to="/sql-playground" className="surface rounded-lg border border-border p-6 hover:border-terminal/40">
            <Database className="h-6 w-6 text-cyan" />
            <h3 className="mt-4 font-mono text-lg font-medium">SQL playground</h3>
            <p className="mt-1 text-sm text-muted-foreground">Run real SQLite queries against a seeded employees / orders / departments dataset — right in your browser.</p>
          </Link>
          <Link to="/mock" className="surface rounded-lg border border-border p-6 hover:border-terminal/40">
            <MessageSquareCode className="h-6 w-6 text-amber" />
            <h3 className="mt-4 font-mono text-lg font-medium">AI mock interviewer</h3>
            <p className="mt-1 text-sm text-muted-foreground">Pick a topic, get one question at a time, type your answer, receive instant feedback and a running score.</p>
          </Link>
        </div>
      </section>
    </main>
  );
}
