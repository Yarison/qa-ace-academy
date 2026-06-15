import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Code2, Database, PlayCircle, MessageSquareCode, Sparkles } from "lucide-react";

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
  {
    to: "/practice/api",
    icon: Code2,
    name: "API testing",
    blurb: "REST, status codes, contracts, auth flows, rate limiting.",
  },
  {
    to: "/practice/sql",
    icon: Database,
    name: "SQL",
    blurb: "Joins, aggregates, window functions, query optimization.",
  },
  {
    to: "/practice/playwright",
    icon: PlayCircle,
    name: "Playwright",
    blurb: "Locators, auto-wait, network mocking, parallel CI runs.",
  },
] as const;

function Home() {
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-glow" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-20 text-center sm:pt-32 sm:pb-28">
          <p className="eyebrow inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-terminal" /> Interview prep for testers
          </p>
          <h1 className="display-1 mt-5 text-foreground">
            Ace your next
            <br />
            QA interview.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            A curated bank of API, SQL and Playwright questions. A live in-browser
            SQL playground. An AI mock interviewer that drills you and scores every answer.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/practice"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Start practicing <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/mock"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Try mock interview
            </Link>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <span>18+ curated questions</span>
            <span className="hidden sm:inline">·</span>
            <span>Real SQLite in the browser</span>
            <span className="hidden sm:inline">·</span>
            <span>AI-graded mock interviews</span>
          </div>
        </div>
      </section>

      {/* TRACKS */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <p className="eyebrow">Three tracks</p>
            <h2 className="display-2 mt-2">Master the fundamentals.</h2>
          </div>
          <Link to="/practice" className="hidden text-sm font-medium text-terminal hover:underline sm:inline-flex">
            Browse all →
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {tracks.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="group surface relative overflow-hidden rounded-2xl border border-border p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elev)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <t.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">{t.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-terminal opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURE — SQL */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="surface-elev grid overflow-hidden rounded-3xl border border-border md:grid-cols-2">
          <div className="flex flex-col justify-center p-10 md:p-14">
            <p className="eyebrow"><Database className="mr-1.5 inline h-3 w-3 text-terminal" /> SQL Playground</p>
            <h3 className="display-2 mt-3">Write real SQL.<br/>No setup.</h3>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              A full SQLite engine runs in your browser against a seeded employees, departments
              and orders dataset. Practice joins, window functions and optimization with instant
              feedback.
            </p>
            <Link
              to="/sql-playground"
              className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
            >
              Open playground <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="border-t border-border bg-secondary/60 p-8 md:border-l md:border-t-0 md:p-10">
            <div className="rounded-xl border border-border bg-background p-5 font-mono text-[13px] leading-relaxed shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <pre className="overflow-x-auto text-foreground">{`SELECT name, dept_id, salary,
  RANK() OVER (
    PARTITION BY dept_id
    ORDER BY salary DESC
  ) AS rnk
FROM employees;`}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE — MOCK */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="surface-elev grid overflow-hidden rounded-3xl border border-border md:grid-cols-2">
          <div className="order-2 border-t border-border bg-secondary/60 p-8 md:order-1 md:border-r md:border-t-0 md:p-10">
            <div className="space-y-3">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-background p-4 text-sm shadow-sm">
                Walk me through how you'd test rate-limiting on a public REST API.
              </div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground p-4 text-sm text-background shadow-sm">
                I'd send bursts above the limit, assert 429 with a Retry-After header,
                verify client backoff, and check that the quota window resets correctly…
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-background p-4 text-sm shadow-sm">
                Strong answer. <span className="font-semibold text-terminal">Score: 8/10.</span> Next question…
              </div>
            </div>
          </div>
          <div className="order-1 flex flex-col justify-center p-10 md:order-2 md:p-14">
            <p className="eyebrow"><MessageSquareCode className="mr-1.5 inline h-3 w-3 text-terminal" /> Mock Interview</p>
            <h3 className="display-2 mt-3">An interviewer<br/>that never sleeps.</h3>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Pick a topic. Get five focused questions, each graded with feedback, plus a final
              report with strengths and gaps. Save sessions and revisit them anytime.
            </p>
            <Link
              to="/mock"
              className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
            >
              Start a mock <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h3 className="display-2">Ready when you are.</h3>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Free to practice. Sign in to save your mock-interview history.
          </p>
          <Link
            to="/practice"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
