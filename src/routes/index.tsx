import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Briefcase, Calendar, Sparkles, Code2, Database, PlayCircle, MessageSquareCode } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "qa.repl — Personalized QA interview prep" },
      { name: "description", content: "Upload your resume, paste the job description, get a personalized day-by-day study calendar until interview day." },
    ],
  }),
  component: Home,
});

const steps: readonly { n: string; icon: typeof FileText; title: string; body: string; optional?: boolean }[] = [
  {
    n: "01",
    icon: FileText,
    title: "Analyze your resume",
    body: "Upload a PDF or paste the text. We estimate your experience, extract skills, and flag weak spots.",
    optional: true,
  },
  {
    n: "02",
    icon: Briefcase,
    title: "Compare to the job",
    body: "Paste the JD. Get missing skills, likely interview questions, and the topics you need to review.",
  },
  {
    n: "03",
    icon: Calendar,
    title: "Follow your calendar",
    body: "Pick your interview date. We build a day-by-day plan tailored to your gaps and the JD.",
  },
];

const tools = [
  { to: "/practice/api", icon: Code2, name: "API testing" },
  { to: "/practice/sql", icon: Database, name: "SQL" },
  { to: "/practice/playwright", icon: PlayCircle, name: "Playwright" },
  { to: "/mock", icon: MessageSquareCode, name: "Mock interview" },
] as const;

function Home() {
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-glow" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center sm:pt-32">
          <p className="eyebrow inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-terminal" /> Personalized QA interview prep
          </p>
          <h1 className="display-1 mt-5 text-foreground">
            From resume to
            <br />
            interview day.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            Three steps. Upload your resume, paste the job description, and get a personalized
            day-by-day study plan built for the role you're chasing.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/prep/resume"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Start prep <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/practice"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Or browse practice
            </Link>
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12">
          <p className="eyebrow">The roadmap</p>
          <h2 className="display-2 mt-2">How it works.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="surface relative overflow-hidden rounded-2xl border border-border p-8">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                {s.optional && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">optional</span>}
              </div>
              <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            to="/prep/resume"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Build my plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* TOOLS */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-10">
          <p className="eyebrow">Along the way</p>
          <h2 className="display-2 mt-2">Drill with real tools.</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every day in your calendar links directly into curated question banks, a live SQL playground,
            and an AI mock interviewer that grades every answer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="group surface rounded-2xl border border-border p-6 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elev)]"
            >
              <t.icon className="h-5 w-5 text-terminal" />
              <h3 className="mt-4 font-semibold">{t.name}</h3>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-terminal opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
