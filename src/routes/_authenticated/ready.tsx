import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowDown, ArrowUp, CalendarIcon, CheckCircle2, Circle, Loader2, RotateCcw, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ready")({
  head: () => ({
    meta: [
      { title: "Ready? — qa.repl" },
      { name: "description", content: "Pick your interview date and follow a daily study plan." },
    ],
  }),
  component: Ready,
});

type Plan = {
  interview_date: string;
  completed: string[];
};

// Rotating daily focus
const ROTATION = [
  { id: "api", topic: "API testing", href: "/practice/api", tasks: ["Review 3 API questions", "Write one example request/response"] },
  { id: "sql", topic: "SQL", href: "/practice/sql", tasks: ["Review 3 SQL questions", "Solve 1 query in the playground"] },
  { id: "playwright", topic: "Playwright", href: "/practice/playwright", tasks: ["Review 3 Playwright questions", "Sketch a locator strategy"] },
  { id: "mock", topic: "Mock interview", href: "/mock", tasks: ["Run a 5-question mock", "Review feedback & note one gap"] },
] as const;

type TopicId = (typeof ROTATION)[number]["id"];
const DEFAULT_ORDER: TopicId[] = ["api", "sql", "playwright", "mock"];
const ROTATION_STORAGE_KEY = "qa.repl.rotation.v1";

function loadRotation(): TopicId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem(ROTATION_STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as TopicId[];
    const valid = parsed.filter((id) => (DEFAULT_ORDER as string[]).includes(id)) as TopicId[];
    return valid.length ? valid : DEFAULT_ORDER;
  } catch {
    return DEFAULT_ORDER;
  }
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function daysBetween(a: Date, b: Date) {
  const ms = parseISODate(toISODate(b)).getTime() - parseISODate(toISODate(a)).getTime();
  return Math.round(ms / 86400000);
}

type FocusItem = { id: string; topic: string; href: string; tasks: readonly string[] | string[] };
type Day = { date: Date; iso: string; focus: FocusItem; isReview?: boolean };

function buildSchedule(interview: Date, order: TopicId[]): Day[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const total = daysBetween(today, interview);
  if (total <= 0) return [];
  const rotation: FocusItem[] = (order.length ? order : DEFAULT_ORDER)
    .map((id) => ROTATION.find((r) => r.id === id))
    .filter((r): r is (typeof ROTATION)[number] => Boolean(r));
  const mock = ROTATION.find((r) => r.id === "mock")!;
  const days: Day[] = [];
  for (let i = 0; i < total; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const daysLeft = total - i;
    const focus: FocusItem =
      daysLeft <= 1
        ? mock
        : daysLeft === 2
          ? { id: "review", topic: "Final review", href: mock.href, tasks: ["Skim weak topics", "Run a full mock interview"] }
          : rotation[i % rotation.length] ?? mock;
    days.push({ date, iso: toISODate(date), focus, isReview: daysLeft <= 2 });
  }
  return days;
}

function Ready() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [picking, setPicking] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<TopicId[]>(DEFAULT_ORDER);
  const [showCustomize, setShowCustomize] = useState(false);

  useEffect(() => {
    setOrder(loadRotation());
    (async () => {
      const { data } = await supabase
        .from("study_plans")
        .select("interview_date, completed")
        .maybeSingle();
      if (data) setPlan({ interview_date: data.interview_date, completed: (data.completed as string[]) ?? [] });
      setLoading(false);
    })();
  }, []);

  function updateOrder(next: TopicId[]) {
    const safe = next.length ? next : DEFAULT_ORDER;
    setOrder(safe);
    try { localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify(safe)); } catch {}
  }
  function toggleTopic(id: TopicId) {
    updateOrder(order.includes(id) ? order.filter((x) => x !== id) : [...order, id]);
  }
  function moveTopic(id: TopicId, dir: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    updateOrder(next);
  }

  const schedule = useMemo(() => (plan ? buildSchedule(parseISODate(plan.interview_date), order) : []), [plan, order]);
  const completedSet = useMemo(() => new Set(plan?.completed ?? []), [plan]);
  const totalTasks = schedule.reduce((n, d) => n + d.focus.tasks.length, 0);
  const doneTasks = schedule.reduce(
    (n, d) => n + d.focus.tasks.filter((_, i) => completedSet.has(`${d.iso}#${i}`)).length,
    0,
  );
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  async function savePlan(date: Date) {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const iso = toISODate(date);
    const { error } = await supabase
      .from("study_plans")
      .upsert({ user_id: u.user.id, interview_date: iso, completed: [], updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setPlan({ interview_date: iso, completed: [] });
    toast.success("Schedule created");
  }

  async function toggle(key: string) {
    if (!plan) return;
    const next = completedSet.has(key)
      ? plan.completed.filter((k) => k !== key)
      : [...plan.completed, key];
    setPlan({ ...plan, completed: next });
    const { error } = await supabase
      .from("study_plans")
      .update({ completed: next, updated_at: new Date().toISOString() })
      .eq("interview_date", plan.interview_date);
    if (error) toast.error(error.message);
  }

  async function reset() {
    if (!confirm("Clear your current study plan?")) return;
    await supabase.from("study_plans").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setPlan(null);
    setPicking(undefined);
  }

  if (loading) {
    return <div className="p-10 text-center"><Loader2 className="inline h-4 w-4 animate-spin text-terminal" /></div>;
  }

  // --- Setup: no plan yet ---
  if (!plan) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="eyebrow inline-flex items-center gap-2"><Sparkles className="h-3 w-3 text-terminal" /> Interview countdown</p>
        <h1 className="display-1 mt-4">When's the big day?</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Tell us your interview date and we'll build a daily battle plan — API, SQL, Playwright, and mock interviews until you're unstoppable.
        </p>
        <div className="surface mt-10 inline-flex flex-col items-center gap-4 rounded-2xl border border-border p-6">
          <Calendar
            mode="single"
            selected={picking}
            onSelect={setPicking}
            disabled={(d) => d < tomorrow}
            className="pointer-events-auto"
          />
          <Button
            disabled={!picking || saving}
            onClick={() => picking && savePlan(picking)}
            className="w-full"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Build my battle plan"}
          </Button>
        </div>
      </main>
    );
  }

  // --- Plan exists ---
  const interview = parseISODate(plan.interview_date);
  const daysLeft = daysBetween(new Date(), interview);
  const todayIso = toISODate(new Date());
  const completedDays = new Set(
    schedule.filter((d) => d.focus.tasks.every((_, i) => completedSet.has(`${d.iso}#${i}`))).map((d) => d.iso),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow inline-flex items-center gap-2"><CalendarIcon className="h-3 w-3 text-terminal" /> Interview countdown</p>
          <h1 className="display-2 mt-2">
            {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} until interview` : "Interview day"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Target date: {interview.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset plan
        </Button>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{doneTasks} of {totalTasks} tasks complete</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="mt-2" />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[auto_1fr]">
        <div className="surface rounded-2xl border border-border p-4">
          <Calendar
            mode="single"
            selected={interview}
            month={new Date()}
            modifiers={{
              done: Array.from(completedDays).map(parseISODate),
              today: [parseISODate(todayIso)],
              interview: [interview],
            }}
            modifiersClassNames={{
              done: "bg-terminal/20 text-foreground rounded-md",
              interview: "ring-2 ring-terminal rounded-md",
            }}
            className="pointer-events-auto"
            disabled
          />
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-terminal/30" /> Completed day</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm ring-2 ring-terminal" /> Interview day</div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Daily plan</h2>
            <Button variant="outline" size="sm" onClick={() => setShowCustomize((s) => !s)}>
              <Settings2 className="h-3.5 w-3.5" /> Customize rotation
            </Button>
          </div>
          {showCustomize && (
            <div className="surface mb-4 rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">
                Toggle topics on/off and reorder them. Changes update your plan instantly. (Final 2 days are always review + mock.)
              </p>
              <ul className="mt-3 space-y-2">
                {DEFAULT_ORDER.map((id) => {
                  const item = ROTATION.find((r) => r.id === id)!;
                  const enabled = order.includes(id);
                  const idx = order.indexOf(id);
                  return (
                    <li key={id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleTopic(id)}
                        className="h-4 w-4 accent-[hsl(var(--terminal))]"
                        aria-label={`Include ${item.topic}`}
                      />
                      <span className={`flex-1 text-sm ${enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                        {item.topic}
                      </span>
                      {enabled && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">#{idx + 1}</span>
                          <Button variant="ghost" size="sm" disabled={idx <= 0} onClick={() => moveTopic(id, -1)} aria-label="Move up">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" disabled={idx === order.length - 1} onClick={() => moveTopic(id, 1)} aria-label="Move down">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => updateOrder(DEFAULT_ORDER)}>Reset to default</Button>
              </div>
            </div>
          )}

          <ol className="space-y-3">
          {schedule.map((d, idx) => {
            const isToday = d.iso === todayIso;
            const isPast = d.date < parseISODate(todayIso);
            return (
              <li
                key={d.iso}
                className={`surface rounded-xl border p-5 transition-colors ${
                  isToday ? "border-terminal/60 shadow-[var(--shadow-card)]" : "border-border"
                } ${isPast ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Day {idx + 1} · {d.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {isToday && <span className="ml-2 rounded-full bg-terminal/15 px-2 py-0.5 text-[10px] font-semibold text-terminal">Today</span>}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight">{d.focus.topic}</h3>
                  </div>
                  <a href={d.focus.href} className="text-xs font-medium text-terminal hover:underline">Open →</a>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {d.focus.tasks.map((t, i) => {
                    const key = `${d.iso}#${i}`;
                    const done = completedSet.has(key);
                    return (
                      <li key={key}>
                        <button
                          onClick={() => toggle(key)}
                          className="group flex w-full items-start gap-2 text-left text-sm"
                        >
                          {done ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-terminal" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                          )}
                          <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>{t}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
        </div>
      </div>

    </main>
  );
}
