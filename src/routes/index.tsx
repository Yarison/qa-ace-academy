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
    <main>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-glow" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center sm:pt-32">
          <p className="eyebrow inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-terminal" /> AI Interview Coach · any profession
          </p>
          <h1 className="display-1 mt-5 text-foreground">
            Paste the job.
            <br />
            Get your plan.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            A personalized interview preparation roadmap for any role — built from the exact job description,
            your background, and the hours you have to prepare.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/prep/jd"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Start prep <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {highlights.map((h) => (
            <div key={h.label} className="surface rounded-2xl border border-border p-6">
              <h.icon className="h-5 w-5 text-terminal" />
              <h3 className="mt-4 font-semibold">{h.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-12">
          <p className="eyebrow">The roadmap</p>
          <h2 className="display-2 mt-2">How it works.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="surface relative overflow-hidden rounded-2xl border border-border p-8">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                {"optional" in s && s.optional && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">optional</span>}
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
