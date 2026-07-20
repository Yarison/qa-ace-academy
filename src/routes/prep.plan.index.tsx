import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar as CalendarIcon, Check, ChevronRight, Loader2, MessageSquare, RotateCcw, Sparkles, Clock, Wand2 } from "lucide-react";
import { generatePlan, refinePlan, savePrep, loadPrep } from "@/lib/prep.functions";
import {
  loadPrepLocal,
  savePrepLocal,
  EMPTY_PREP,
  todayISO,
  daysBetween,
  resolveDaysUntil,
  type PrepState,
} from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";


export const Route = createFileRoute("/prep/plan/")({
  head: () => ({
    meta: [
      { title: "Step 3 — Your prep plan — AI Interview Coach" },
      { name: "description", content: "A personalized day-by-day study plan tailored to the job, your background, and your time budget." },
    ],
  }),
  component: PlanStep,
});

function PlanStep() {
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [signedIn, setSignedIn] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    const local = loadPrepLocal();
    setState(local);
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep();
          if (remote) setState((s) => ({ ...s, ...remote }));
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

  const days = useMemo(() => resolveDaysUntil(state.preferences), [state.preferences]);
  const canBuild = !!state.jobDescription && !!days;

  async function build() {
    if (!state.jobDescription || state.jobDescription.trim().length < 30) {
      toast.error("Add a job description in step 1 first");
      return;
    }
    if (!days) {
      toast.error("Set your interview date or days-until in step 1");
      return;
    }
    setBuilding(true);
    try {
      const plan = await generatePlan({
        data: {
          jobDescription: state.jobDescription,
          jdAnalysis: state.jdAnalysis,
          resumeAnalysis: state.resumeAnalysis,
          experienceLevel: state.preferences.experienceLevel,
          hoursPerDay: state.preferences.hoursPerDay,
          days,
          startDate: todayISO(),
        },
      });
      await persist({ ...state, plan, completed: [], answers: {} });
      toast.success(`Plan built — ${plan.length} days`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plan generation failed");
    } finally {
      setBuilding(false);
    }
  }

  const [refining, setRefining] = useState(false);
  async function refine() {
    if (!state.jobDescription) return;
    const today = todayISO();
    const remaining = state.plan.filter((d) => d.date >= today);
    const remainingDays = Math.max(1, remaining.length || days || 7);
    setRefining(true);
    try {
      const history = Object.values(state.answers ?? {}).flat().map((a) => ({
        question: a.question,
        score: a.score,
        weakAreas: a.weakAreas,
      }));
      const newPlan = await refinePlan({
        data: {
          jobDescription: state.jobDescription,
          jdAnalysis: state.jdAnalysis,
          resumeAnalysis: state.resumeAnalysis,
          experienceLevel: state.preferences.experienceLevel,
          hoursPerDay: state.preferences.hoursPerDay,
          startDate: today,
          remainingDays,
          currentPlan: remaining,
          answerHistory: history,
        },
      });
      const kept = state.plan.filter((d) => d.date < today);
      await persist({ ...state, plan: [...kept, ...newPlan] });
      toast.success("Plan re-personalized from your answers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refinement failed");
    } finally {
      setRefining(false);
    }
  }

  function toggleDay(date: string) {
    const has = state.completed.includes(date);
    const completed = has ? state.completed.filter((d) => d !== date) : [...state.completed, date];
    void persist({ ...state, completed });
  }

  function reset() {
    void persist({ ...state, plan: [], completed: [], answers: {} });
  }


  const progress = state.plan.length
    ? Math.round((state.completed.length / state.plan.length) * 100)
    : 0;

  const lastDate = state.plan[state.plan.length - 1]?.date ?? null;
  const daysLeft = lastDate ? daysBetween(todayISO(), lastDate) : null;

  return (
    <div>
      <header>
        <p className="eyebrow">Step 3</p>
        <h1 className="display-2 mt-2">Your personalized plan.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Built by AI from the job description, your background, and your time budget. Tick off each day as
          you go.
        </p>
      </header>

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={build} disabled={!canBuild || building}>
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {state.plan.length ? "Rebuild plan" : "Generate plan"}
          </Button>
          {state.plan.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> reset
            </Button>
          )}
          <Link to="/prep/jd" className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> edit setup
          </Link>
        </div>

        {!canBuild && (
          <p className="mt-4 text-sm text-muted-foreground">
            {!state.jobDescription
              ? <>You need to paste a job description first. <Link to="/prep/jd" className="text-terminal hover:underline">Go to step 1 →</Link></>
              : <>Set your interview date or days-until in <Link to="/prep/jd" className="text-terminal hover:underline">step 1</Link>.</>}
          </p>
        )}

        {canBuild && (
          <p className="mt-4 text-xs text-muted-foreground">
            {days} days · {state.preferences.hoursPerDay}h/day · {state.preferences.experienceLevel}
          </p>
        )}
      </div>

      {state.plan.length > 0 && (
        <>
          <div className="surface mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-6">
            <div>
              <p className="text-3xl font-semibold">
                {daysLeft ?? 0} <span className="text-base font-normal text-muted-foreground">days to go</span>
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
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-terminal">
                        {day.focusArea}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> ~{day.estimatedHours}h
                      </span>
                    </div>
                    {day.topics.length > 0 && (
                      <p className="mt-2 text-sm font-medium">
                        {day.topics.join(" · ")}
                      </p>
                    )}
                    {day.activities.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {day.activities.map((d, i) => (
                          <li key={i} className="flex gap-2"><span className="text-terminal">→</span> {d}</li>
                        ))}
                      </ul>
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
            Click <strong>Generate plan</strong> above and we'll build a day-by-day schedule tailored to the
            role, your background, and your time budget.
          </p>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
