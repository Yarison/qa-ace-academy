import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, FileText, Calendar, Sparkles, Target, Clock, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Interview Coach — Personalized prep for any job" },
      { name: "description", content: "Paste any job description, share your background, and get a day-by-day study plan tailored to your interview — for any profession." },
    ],
  }),
  component: Home,
});

const steps = [
  {
    n: "01",
    icon: Briefcase,
    title: "Paste the job description",
    body: "Any role, any industry. We extract technical + soft skills, tools, industry knowledge, certifications, and the keywords the employer emphasizes.",
  },
  {
    n: "02",
    icon: FileText,
    title: "Share your background (optional)",
    body: "Upload a resume or paste it in. We compare your profile against the JD and pinpoint the gaps to close.",
    optional: true,
  },
  {
    n: "03",
    icon: Calendar,
    title: "Get your day-by-day plan",
    body: "Tell us your interview date and daily study hours. We build a personalized schedule that fits your time.",
  },
] as const;

const highlights = [
  { icon: Target, label: "Any profession", body: "Engineering, marketing, healthcare, finance, design, sales — the plan adapts to the JD." },
  { icon: Clock, label: "Fits your time", body: "Choose 1–8 hours per day. Every task respects your budget." },
  { icon: Zap, label: "AI-personalized", body: "Prioritizes your gaps and the employer's exact keywords." },
];

function Home() {
  return (
    <main className="page-shell">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-glow" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center sm:pt-32">
          <p className="page-eyebrow inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-[var(--text-secondary)]" /> AI Interview Coach · any profession
          </p>
          <h1 className="display-1 mt-4 text-[var(--text-primary)]">
            Paste the job.
            <br />
            Get your plan.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-[var(--text-secondary)] sm:text-xl">
            A personalized interview preparation roadmap for any role — built from the exact job description,
            your background, and the hours you have to prepare.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/prep/jd"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Start prep <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-6 max-w-6xl px-6">
        <div className="preview-browser overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--card-border)] bg-[var(--bg-base)] px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <p className="page-eyebrow">Prep preview</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Senior QA Engineer · 14 days</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  A realistic roadmap that mirrors the Prep experience: foundation work first, then role-specific drill practice, then interview rehearsal.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { title: "Foundation", range: "Days 1–4", body: "Review product flows, test strategy, and defect writing.", icon: Target },
                  { title: "Deep dive", range: "Days 5–10", body: "Practice API, SQL, and debugging scenarios tied to the JD.", icon: FileText },
                  { title: "Mock rounds", range: "Days 11–14", body: "Rehearse behavioral answers and refine weak spots.", icon: Calendar },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="page-card p-4 text-left">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-base)] text-[var(--text-primary)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">{item.range}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-6 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {highlights.map((h) => (
            <div key={h.label} className="page-card p-6">
              <h.icon className="h-5 w-5 text-[var(--text-secondary)]" />
              <h3 className="mt-4 font-semibold text-[var(--text-primary)]">{h.label}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-12 mt-16">
          <p className="page-eyebrow">The roadmap</p>
          <h2 className="display-2 mt-2 text-[var(--text-primary)]">How it works.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="page-card relative overflow-hidden p-8">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">{s.n}</span>
                {"optional" in s && s.optional && <span className="rounded-full border border-[var(--card-border)] px-2 py-0.5 text-[10px] uppercase text-[var(--text-secondary)]">optional</span>}
              </div>
              <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--text-primary)] text-background">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            to="/prep/jd"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Build my plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
