import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Calendar, CheckCircle2, Sparkles, Target } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PrepPilotX — Interview prep calendar and multi-interview roadmaps" },
      { name: "description", content: "Build personalized interview prep roadmaps from job descriptions, organize multiple interviews on one calendar, and focus on what to prepare today." },
    ],
  }),
  component: Home,
});

const valueProps = [
  {
    icon: Sparkles,
    title: "Plan",
    body: "Create a personalized prep roadmap from any job description, regardless of profession or role.",
  },
  {
    icon: Calendar,
    title: "Organize",
    body: "Manage multiple interviews and overlapping preparation timelines in one visual calendar.",
  },
  {
    icon: Target,
    title: "Focus",
    body: "See what you should prepare today based on your upcoming interviews, available time, and roadmap progress.",
  },
] as const;

const roadmapLegend = [
  { name: "Senior QA Engineer", date: "Aug 5", color: "bg-violet-500", soft: "bg-violet-50 text-violet-700 border-violet-200" },
  { name: "SDET", date: "Aug 12", color: "bg-blue-500", soft: "bg-blue-50 text-blue-700 border-blue-200" },
  { name: "Product Manager", date: "Aug 20", color: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700 border-emerald-200" },
] as const;

const calendarDays = [
  { day: "Aug 1", tasks: [{ label: "QA: Test strategy", tone: "bg-violet-100 text-violet-700" }] },
  { day: "Aug 2", tasks: [{ label: "SDET: API tests", tone: "bg-blue-100 text-blue-700" }] },
  { day: "Aug 3", tasks: [{ label: "QA: SQL drills", tone: "bg-violet-100 text-violet-700" }, { label: "PM: Product sense", tone: "bg-emerald-100 text-emerald-700" }] },
  { day: "Aug 4", tasks: [{ label: "SDET: Automation", tone: "bg-blue-100 text-blue-700" }] },
  { day: "Aug 5", tasks: [{ label: "Interview: Senior QA", tone: "bg-violet-200 text-violet-800 font-semibold" }] },
  { day: "Aug 6", tasks: [{ label: "PM: Behavioral", tone: "bg-emerald-100 text-emerald-700" }] },
  { day: "Aug 7", tasks: [{ label: "QA + SDET: Debugging", tone: "bg-slate-100 text-slate-700" }] },
  { day: "Aug 8", tasks: [{ label: "SDET: Mock round", tone: "bg-blue-100 text-blue-700" }] },
  { day: "Aug 9", tasks: [{ label: "PM: Case prep", tone: "bg-emerald-100 text-emerald-700" }] },
  { day: "Aug 10", tasks: [{ label: "SDET: System design", tone: "bg-blue-100 text-blue-700" }, { label: "PM: Metrics", tone: "bg-emerald-100 text-emerald-700" }] },
  { day: "Aug 11", tasks: [{ label: "SDET: Final review", tone: "bg-blue-100 text-blue-700" }] },
  { day: "Aug 12", tasks: [{ label: "Interview: SDET", tone: "bg-blue-200 text-blue-800 font-semibold" }] },
] as const;

function Home() {
  return (
    <main className="page-shell">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-glow" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pt-20 pb-14 sm:pt-28 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="page-eyebrow inline-flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-[var(--text-secondary)]" /> Interview Preparation, Organized
            </p>
            <h1 className="display-1 mt-4 text-[var(--text-primary)]">
              Prepare for every interview.
              <br />
              See the whole journey.
            </h1>
            <p className="mt-5 max-w-2xl text-balance text-lg text-[var(--text-secondary)] sm:text-xl">
              Build personalized prep roadmaps from your job descriptions, organize multiple interviews on one calendar,
              and always know what to focus on next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/prep/jd"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Create Your Prep Roadmap <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-base)]"
              >
                See How It Works
              </a>
            </div>
          </div>

          <div className="preview-browser overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--bg-base)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
              </div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">PrepPilotX Calendar</p>
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {roadmapLegend.map((roadmap) => (
                      <div key={roadmap.name} className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ${roadmap.soft}`}>
                        <span className={`h-2 w-2 rounded-full ${roadmap.color}`} />
                        {roadmap.name} - {roadmap.date}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {calendarDays.map((entry) => (
                      <div key={entry.day} className="rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{entry.day}</p>
                        <div className="mt-2 space-y-1.5">
                          {entry.tasks.map((task) => (
                            <p key={task.label} className={`rounded px-2 py-1 text-[11px] leading-tight ${task.tone}`}>
                              {task.label}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="page-card p-3.5">
                    <p className="page-eyebrow">Today's Focus</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">3 tasks · 75 minutes</p>
                    <ul className="mt-2 space-y-1.5 text-xs text-[var(--text-secondary)]">
                      <li>Review API Testing · 30 min</li>
                      <li>Practice Behavioral · 20 min</li>
                      <li>Review Weak Areas · 25 min</li>
                    </ul>
                  </div>
                  <div className="page-card p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Next Milestone</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Senior QA Engineer Interview</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Aug 5 · 9:30 AM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto mt-8 max-w-6xl px-6 py-6">
        <div className="mb-7">
          <p className="page-eyebrow">Core experience</p>
          <h2 className="display-2 mt-2 text-[var(--text-primary)]">Plan, organize, and focus.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {valueProps.map((item) => (
            <div key={item.title} className="page-card p-6">
              <item.icon className="h-5 w-5 text-[var(--text-secondary)]" />
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-[var(--text-primary)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <p className="page-eyebrow">Multi-interview prep</p>
            <h2 className="display-2 mt-2 text-[var(--text-primary)]">One calendar. Every interview.</h2>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)]">
              Job searching often means preparing for multiple interviews at the same time. PrepPilotX helps you organize each interview into its own roadmap while keeping everything visible in one place.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--text-primary)]" />Create multiple prep roadmaps</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--text-primary)]" />Assign each interview its own color</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--text-primary)]" />See overlapping preparation timelines</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--text-primary)]" />Switch between individual roadmaps</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--text-primary)]" />View all upcoming interviews together</li>
            </ul>
          </div>

          <div className="page-card p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Roadmap overlap</p>
            <div className="mt-4 space-y-3">
              {[
                { label: "Senior QA Engineer", color: "bg-violet-500", start: "w-[72%]" },
                { label: "SDET", color: "bg-blue-500", start: "w-[64%]" },
                { label: "Product Manager", color: "bg-emerald-500", start: "w-[80%]" },
              ].map((line) => (
                <div key={line.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <p className="font-medium text-[var(--text-primary)]">{line.label}</p>
                    <p>Aug timeline</p>
                  </div>
                  <div className="h-3.5 rounded-full bg-[var(--bg-base)]">
                    <div className={`h-3.5 rounded-full ${line.color} ${line.start} opacity-80`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center">
          <div>
            <p className="page-eyebrow">Shared preparation</p>
            <h2 className="display-2 mt-2 text-[var(--text-primary)]">Prepare once. Apply it everywhere.</h2>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)]">
              When multiple interviews require similar skills or topics, PrepPilotX helps you see where your preparation overlaps so your time goes further.
            </p>
          </div>

          <div className="page-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Shared topics</p>
            <div className="mt-3 space-y-2.5">
              {[
                { topic: "API Testing", count: "3 interviews" },
                { topic: "Automation", count: "2 interviews" },
                { topic: "Behavioral", count: "3 interviews" },
              ].map((item) => (
                <div key={item.topic} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.topic}</p>
                  <p className="rounded-full bg-[var(--card-bg)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center">
          <div>
            <p className="page-eyebrow">Daily prep</p>
            <h2 className="display-2 mt-2 text-[var(--text-primary)]">Know what to prepare today.</h2>
            <p className="mt-4 max-w-2xl text-[var(--text-secondary)]">
              Your calendar shows the big picture. Today's Prep helps you focus on the next step.
            </p>
            <div className="mt-6">
              <Link
                to="/prep/today"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Start Today's Prep <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="page-card p-5">
            <p className="page-eyebrow">Today's Prep</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">3 tasks · 75 minutes</p>
            <div className="mt-4 space-y-2.5">
              {[
                "Review API Testing — 30 min",
                "Practice Behavioral Questions — 20 min",
                "Review Weak Areas — 25 min",
              ].map((task) => (
                <div key={task} className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />
                  <p>{task}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <div className="page-card p-8 text-center sm:p-10">
          <h2 className="display-2 text-[var(--text-primary)]">
            Your next interview is coming.
            <br />
            Be ready for it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
            Create your personalized interview preparation roadmap and organize your entire job search in one place.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/prep/jd"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Create Your Prep Roadmap <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
