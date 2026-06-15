import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, Database, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/practice/")({
  head: () => ({
    meta: [
      { title: "Practice — qa.repl" },
      { name: "description", content: "Pick a track: API, SQL or Playwright." },
    ],
  }),
  component: PracticeIndex,
});

const tracks = [
  { to: "/practice/api", icon: Code2, name: "api", desc: "REST, status codes, auth, contracts, rate limits" },
  { to: "/practice/sql", icon: Database, name: "sql", desc: "Joins, aggregates, window functions, optimization" },
  { to: "/practice/playwright", icon: PlayCircle, name: "playwright", desc: "Locators, auto-wait, network mocking, parallelism" },
] as const;

function PracticeIndex() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-mono text-2xl font-bold prompt">ls ./tracks</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((t) => (
          <Link key={t.to} to={t.to} className="surface rounded-lg border border-border p-6 hover:border-terminal/40 hover:-translate-y-0.5 transition">
            <t.icon className="h-6 w-6 text-terminal" />
            <h2 className="mt-4 font-mono text-lg">/{t.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
