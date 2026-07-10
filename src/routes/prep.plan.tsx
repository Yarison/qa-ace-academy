import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar as CalendarIcon, Check, RotateCcw, Sparkles, MessageSquareCode, Code2, Database, PlayCircle, BookOpen } from "lucide-react";
import { savePrep, loadPrep } from "@/lib/prep.functions";
import { loadPrepLocal, savePrepLocal, EMPTY_PREP, todayISO, daysBetween, addDays, type PrepState, type PlanDay, type TopicId } from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/prep/plan")({
  head: () => ({
    meta: [
      { title: "Step 3 — Your interview calendar — qa.repl" },
      { name: "description", content: "A personalized day-by-day study plan running up to your interview date." },
    ],
  }),
  component: PlanStep,
});

const TOPIC_META: Record<TopicId, { label: string; icon: typeof Code2; to?: string; color: string }> = {
  api: { label: "API testing", icon: Code2, to: "/practice/api", color: "text-terminal" },
  sql: { label: "SQL", icon: Database, to: "/practice/sql", color: "text-terminal" },
  playwright: { label: "Playwright", icon: PlayCircle, to: "/practice/playwright", color: "text-terminal" },
  mock: { label: "Mock interview", icon: MessageSquareCode, to: "/mock", color: "text-amber" },
  review: { label: "Review & rest", icon: BookOpen, color: "text-muted-foreground" },
};

function PlanStep() {
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [signedIn, setSignedIn] = useState(false);
  const [dateInput, setDateInput] = useState("");

  useEffect(() => {
    const local = loadPrepLocal();
    setState(local);
    setDateInput(local.interviewDate ?? "");
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep();
          if (remote) {
            setState((s) => ({ ...s, ...remote }));
            setDateInput(remote.interviewDate ?? "");
          }
        } catch { /* ignore */ }
      }
    });
  }, []);

  async function persist(next: PrepState) {
    setState(next);
    savePrepLocal(next);
    if (signedIn) {
      try { await savePrep({ data: next }); } catch { /* ignore */ }
    }
  }

  function generate() {
    if (!dateInput) { toast.error("Pick your interview date"); return; }
    const today = todayISO();
    const days = daysBetween(today, dateInput);
    if (days < 1) { toast.error("Interview date must be in the future"); return; }

    const plan = buildPlan(today, dateInput, state);
    void persist({ ...state, interviewDate: dateInput, plan, completed: [] });
    toast.success(`Plan built — ${plan.length} days`);
  }

  function toggleDay(date: string) {
    const has = state.completed.includes(date);
    const completed = has ? state.completed.filter((d) => d !== date) : [...state.completed, date];
    void persist({ ...state, completed });
  }

  function reset() {
    void persist({ ...state, interviewDate: null, plan: [], completed: [] });
    setDateInput("");
  }

  const progress = useMemo(() => {
    if (!state.plan.length) return 0;
    return Math.round((state.completed.length / state.plan.length) * 100);
  }, [state.plan.length, state.completed.length]);

  const daysLeft = state.interviewDate ? daysBetween(todayISO(), state.interviewDate) : null;

  return (
    <div>
      <header>
        <p className="eyebrow">Step 3</p>
        <h1 className="display-2 mt-2">Your countdown.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Pick the interview date and we'll generate a day-by-day study plan tailored to your gaps and topics to review.
        </p>
      </header>

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        <label className="block text-sm font-medium">Interview date</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            type="date"
            min={todayISO()}
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-terminal/60"
          />
          <Button onClick={generate}>
            <Sparkles className="h-4 w-4" />
            {state.plan.length ? "Rebuild plan" : "Build my plan"}
          </Button>
          {state.plan.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> reset
            </Button>
          )}
          <Link to="/prep/jd" className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> back to JD
          </Link>
        </div>
      </div>

      {state.plan.length > 0 && daysLeft !== null && (
        <>
          <div className="surface mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-6">
            <div>
              <p className="text-3xl font-semibold">
                {daysLeft} <span className="text-base font-normal text-muted-foreground">days to go</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.completed.length} / {state.plan.length} complete
              </p>
            </div>
            <div className="w-full max-w-xs">
              <div className="h-2 overflow-hidden rounded-full bg-accent">
                <div className="h-full bg-terminal transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">{progress}%</p>
            </div>
          </div>

          <ol className="mt-6 space-y-3">
            {state.plan.map((day) => {
              const done = state.completed.includes(day.date);
              const meta = TOPIC_META[day.topic];
              const Icon = meta.icon;
              const isPast = day.date < todayISO();
              const isToday = day.date === todayISO();
              return (
                <li
                  key={day.date}
                  className={`surface flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${
                    isToday ? "border-foreground" : done ? "border-terminal/40 opacity-70" : "border-border"
                  }`}
                >
                  <button
                    onClick={() => toggleDay(day.date)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      done ? "border-terminal bg-terminal text-primary-foreground" : "border-border bg-background hover:border-terminal/60"
                    }`}
                    aria-label={done ? "Mark incomplete" : "Mark complete"}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </button>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDate(day.date)}
                      </span>
                      {isToday && <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">TODAY</span>}
                      {isPast && !done && <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">missed</span>}
                      <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{day.focus}</p>
                    {day.drills.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {day.drills.map((d, i) => (
                          <li key={i} className="flex gap-2"><span className="text-terminal">→</span> {d}</li>
                        ))}
                      </ul>
                    )}
                    {meta.to && (
                      <Link to={meta.to} className="mt-2 inline-block text-xs font-medium text-terminal hover:underline">
                        Open {meta.label} →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {state.plan.length === 0 && (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-accent/40 p-5 text-sm text-muted-foreground">
          <CalendarIcon className="mt-0.5 h-4 w-4 text-terminal" />
          <p>
            Pick a date above to generate your plan. If you completed steps 1 and 2, the schedule will
            prioritize your missing skills and topics to review.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Plan generator ----------

function buildPlan(fromISO: string, toISO: string, state: PrepState): PlanDay[] {
  const total = daysBetween(fromISO, toISO);
  const days = Math.max(1, total);

  // Priority topics come from JD analysis when available, else weak areas, else defaults.
  const priorities = state.jdAnalysis?.topicsToReview?.length
    ? state.jdAnalysis.topicsToReview
    : state.resumeAnalysis?.weakAreas ?? [];

  const rotation: TopicId[] = deriveRotation(priorities, state);

  const plan: PlanDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromISO, i);
    const isLast = i === days - 1;
    const isSecondLast = i === days - 2;
    let topic: TopicId;
    if (isLast) topic = "review";
    else if (isSecondLast && days >= 3) topic = "mock";
    else topic = rotation[i % rotation.length];

    plan.push({
      date,
      topic,
      focus: focusFor(topic, i, days, state),
      drills: drillsFor(topic, i, state),
    });
  }
  return plan;
}

function deriveRotation(priorities: string[], state: PrepState): TopicId[] {
  const lowered = priorities.map((p) => p.toLowerCase()).join(" ");
  const weights: Record<Exclude<TopicId, "review" | "mock">, number> = { api: 1, sql: 1, playwright: 1 };
  if (/\b(api|rest|graphql|postman|http)\b/.test(lowered)) weights.api += 2;
  if (/\b(sql|database|query|joins?|postgres|mysql)\b/.test(lowered)) weights.sql += 2;
  if (/\b(playwright|selenium|cypress|e2e|ui automation)\b/.test(lowered)) weights.playwright += 2;

  // Also boost by missing skills
  const missing = state.jdAnalysis?.missingSkills?.join(" ").toLowerCase() ?? "";
  if (/\b(api|rest|http)\b/.test(missing)) weights.api += 1;
  if (/\bsql|database\b/.test(missing)) weights.sql += 1;
  if (/\bplaywright|selenium|cypress\b/.test(missing)) weights.playwright += 1;

  const order: TopicId[] = [];
  const cats: (keyof typeof weights)[] = ["api", "sql", "playwright"];
  const maxWeight = Math.max(...cats.map((c) => weights[c]));
  for (let w = maxWeight; w > 0; w--) {
    for (const c of cats) if (weights[c] >= w && !order.includes(c)) order.push(c);
  }
  return order.length ? order : ["api", "sql", "playwright"];
}

function focusFor(topic: TopicId, dayIdx: number, total: number, state: PrepState): string {
  if (topic === "mock") return "Full mock interview run-through.";
  if (topic === "review") return "Rest, re-read notes, review your strongest and weakest answers.";
  const priorities = state.jdAnalysis?.topicsToReview ?? [];
  const hit = priorities.find((p) => p.toLowerCase().includes(topic));
  if (hit) return hit;
  const base: Record<Exclude<TopicId, "review" | "mock">, string> = {
    api: dayIdx < total / 2 ? "REST fundamentals: methods, status codes, auth." : "Advanced API: contracts, rate limits, negative testing.",
    sql: dayIdx < total / 2 ? "SQL basics: SELECT, JOINs, aggregations." : "Window functions, indexes, query optimization.",
    playwright: dayIdx < total / 2 ? "Locators, auto-wait, fixtures." : "Network mocking, parallelism, CI setup.",
  };
  return base[topic];
}

function drillsFor(topic: TopicId, dayIdx: number, state: PrepState): string[] {
  if (topic === "mock") return ["Run a full mock interview on your weakest topic", "Save the session and review the feedback"];
  if (topic === "review") return ["Re-read your saved mock feedback", "Sleep well ☕"];
  const jdQs = state.jdAnalysis?.likelyQuestions ?? [];
  const q = jdQs[dayIdx % Math.max(1, jdQs.length)];
  const out: string[] = [];
  out.push(`Complete 4-6 ${topic.toUpperCase()} practice questions`);
  if (q) out.push(`Draft an answer to: "${q}"`);
  if (topic === "sql") out.push("Solve 2 problems in the SQL playground");
  if (topic === "playwright") out.push("Write a short spec from scratch");
  return out;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
