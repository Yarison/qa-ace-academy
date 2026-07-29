import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Loader2, Sparkles, Send, RotateCcw } from "lucide-react";
import { evaluateAnswer, loadPrep, savePrep } from "@/lib/prep.functions";
import type { AiUsageResult } from "@/lib/ai-usage.server";
import {
  getActiveRoadmapLocal,
  loadPrepLocal,
  savePrepLocal,
  EMPTY_PREP,
  type PrepRoadmap,
  type PrepState,
  type TaskAnswer,
} from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { VoiceInput } from "@/components/VoiceInput";

export const Route = createFileRoute("/prep/plan/$date")({
  head: ({ params }) => ({
    meta: [
      { title: `Practice — ${params.date} — AI Interview Coach` },
      {
        name: "description",
        content:
          "Answer role-tailored interview questions, get AI scoring, feedback, and follow-ups.",
      },
    ],
  }),
  component: DayDetail,
  notFoundComponent: () => (
    <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
      That day isn't in your plan.{" "}
      <Link to="/prep/plan" className="text-terminal hover:underline">
        Back to plan
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
      Something went wrong: {error.message}
    </div>
  ),
});

function DayDetail() {
  const { date } = Route.useParams();
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [activeRoadmap, setActiveRoadmap] = useState<PrepRoadmap | null>(null);
  const [usage, setUsage] = useState<AiUsageResult | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const active = getActiveRoadmapLocal();
    setActiveRoadmap(active);
    setState(active.state ?? loadPrepLocal());
    setHydrated(true);
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep({ data: { roadmapId: active.id } });
          if (remote) setState((s) => ({ ...s, ...remote }));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  const day = useMemo(() => state.plan.find((d) => d.date === date), [state.plan, date]);

  async function persist(next: PrepState) {
    setState(next);
    savePrepLocal(next);
    setActiveRoadmap((prev) => (prev ? { ...prev, state: next } : prev));
    if (signedIn) {
      try {
        await savePrep({
          data: {
            ...next,
            roadmapId: activeRoadmap?.id,
            roadmapName: activeRoadmap?.name,
            roadmapColor: activeRoadmap?.color,
          },
        });
      } catch {
        /* ignore */
      }
    }
  }

  if (!hydrated) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!day) {
    throw notFound();
  }

  const dayAnswers = state.answers?.[date] ?? [];
  const questions = day.questions ?? [];
  const extraFollowUps = dayAnswers
    .flatMap((a) => a.followUpQuestions)
    .filter((q) => !questions.includes(q));
  const allQuestions = [...questions, ...extraFollowUps];

  async function submitAnswer(question: string, answer: string) {
    const trimmed = answer.trim();
    if (trimmed.length < 5) {
      toast.error("Write a longer answer first");
      return;
    }
    try {
      const result = await evaluateAnswer({
        data: {
          question,
          answer: trimmed,
          focusArea: day?.focusArea,
          jobDescription: state.jobDescription || undefined,
          jdAnalysis: state.jdAnalysis,
          resumeAnalysis: state.resumeAnalysis,
        },
      });
      setUsage(result.usage ?? null);
      const entry: TaskAnswer = {
        question,
        answer: trimmed,
        score: result.score,
        feedback: result.feedback,
        weakAreas: result.weakAreas,
        followUpQuestions: result.followUpQuestions,
        exampleAnswer: result.exampleAnswer,
        answeredAt: new Date().toISOString(),
      };
      const existing = state.answers?.[date] ?? [];
      // replace any prior answer to the same question
      const filtered = existing.filter((a) => a.question !== question);
      const nextAnswers = { ...(state.answers ?? {}), [date]: [...filtered, entry] };
      await persist({ ...state, answers: nextAnswers });
      toast.success(`Scored ${result.score}/10`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evaluation failed");
    }
  }

  async function clearAnswer(question: string) {
    const existing = state.answers?.[date] ?? [];
    const nextAnswers = {
      ...(state.answers ?? {}),
      [date]: existing.filter((a) => a.question !== question),
    };
    await persist({ ...state, answers: nextAnswers });
  }

  const done = state.completed.includes(date);
  async function toggleDone() {
    const completed = done ? state.completed.filter((d) => d !== date) : [...state.completed, date];
    await persist({ ...state, completed });
  }

  return (
    <div>
      <Link
        to="/prep/plan"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to plan
      </Link>

      <header className="mt-4">
        <p className="eyebrow">{formatDate(date)}</p>
        <h1 className="display-2 mt-2">{day.focusArea}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> ~{day.estimatedHours}h
          </span>
          {day.topics.length > 0 && <span>· {day.topics.join(" · ")}</span>}
        </div>
      </header>

      {day.activities.length > 0 && (
        <div className="surface mt-6 rounded-2xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today's activities
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {day.activities.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-terminal">→</span> {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Practice questions</h2>
            <p className="text-sm text-muted-foreground">
              Answer each one — AI will score, highlight weak areas, and generate follow-ups.
            </p>
            {usage ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {usage.type === "signed-in"
                  ? `${usage.remaining} points left today`
                  : `${usage.remaining} free AI ${usage.remaining === 1 ? "try" : "tries"} left`}
              </p>
            ) : null}
          </div>
          <Button size="sm" variant={done ? "secondary" : "default"} onClick={toggleDone}>
            <Check className="h-3.5 w-3.5" /> {done ? "Marked complete" : "Mark day complete"}
          </Button>
        </div>

        {allQuestions.length === 0 && (
          <p className="mt-4 rounded-xl border border-border bg-accent/30 p-5 text-sm text-muted-foreground">
            No questions were generated for this day. Rebuild the plan on the previous screen to
            include practice questions.
          </p>
        )}

        <ol className="mt-6 space-y-4">
          {allQuestions.map((q, idx) => {
            const answered = dayAnswers.find((a) => a.question === q);
            const isFollowUp = idx >= questions.length;
            return (
              <QuestionCard
                key={q}
                index={idx + 1}
                question={q}
                isFollowUp={isFollowUp}
                answered={answered}
                onSubmit={(a) => submitAnswer(q, a)}
                onClear={() => clearAnswer(q)}
              />
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  answered,
  isFollowUp,
  onSubmit,
  onClear,
}: {
  index: number;
  question: string;
  answered?: TaskAnswer;
  isFollowUp: boolean;
  onSubmit: (answer: string) => Promise<void>;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(draft || answered?.answer || "");
      setDraft("");
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  const scoreColor = !answered
    ? ""
    : answered.score >= 8
      ? "text-terminal border-terminal/40 bg-terminal/10"
      : answered.score >= 5
        ? "text-foreground border-border bg-accent"
        : "text-destructive border-destructive/40 bg-destructive/10";

  return (
    <li className="surface rounded-xl border border-border p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-xs text-muted-foreground">Q{index}</span>
        <div className="flex-1">
          {isFollowUp && (
            <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-border bg-accent/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Follow-up
            </span>
          )}
          <p className="font-medium">{question}</p>
        </div>
        {answered && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor}`}
          >
            {answered.score}/10
          </span>
        )}
      </div>

      {answered && !editing ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border bg-background p-3 text-sm whitespace-pre-wrap">
            {answered.answer}
          </div>
          <div className="rounded-lg border border-border bg-accent/40 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Feedback
            </p>
            <p className="mt-1">{answered.feedback}</p>
            {answered.weakAreas.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Weak areas
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {answered.weakAreas.map((w) => (
                    <span
                      key={w}
                      className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {answered.followUpQuestions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Follow-ups added below
                </p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {answered.followUpQuestions.map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-terminal">↳</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {answered.exampleAnswer && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Example answer
                </p>
                <p className="mt-1 text-sm italic">{answered.exampleAnswer}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(answered.answer);
                setEditing(true);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear}>
              <RotateCcw className="h-3.5 w-3.5" /> clear
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <VoiceInput
            value={draft}
            onChange={setDraft}
            placeholder="Type your answer. Be specific — use the STAR format for behavioral questions."
            rows={6}
          />
          <div className="flex justify-end gap-2">
            {editing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft("");
                }}
              >
                cancel
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || draft.trim().length < 5}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Score my answer
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
