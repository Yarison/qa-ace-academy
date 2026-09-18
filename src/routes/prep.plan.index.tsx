import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Circle,
  Clock,
  CopyPlus,
  Flag,
  Loader2,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { generateInterviewCheatsheet, generatePlan, refinePlan, savePrep, loadPrep } from "@/lib/prep.functions";
import type { InterviewCheatsheet } from "@/lib/prep.functions";
import type { AiUsageResult } from "@/lib/ai-usage.server";
import {
  clearPrepDraftLocal,
  createRoadmapLocal,
  deleteRoadmapLocal,
  getActiveRoadmapLocal,
  listPrepRoadmapsLocal,
  loadPrepDraftLocal,
  loadPrepLocal,
  savePrepDraftLocal,
  savePrepLocal,
  switchActiveRoadmapLocal,
  renameRoadmapLocal,
  EMPTY_PREP,
  todayISO,
  addDays,
  daysBetween,
  resolveDaysUntil,
  type PrepRoadmap,
  type RoadmapColor,
  type PrepState,
} from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/prep/plan/")({
  head: () => ({
    meta: [
      { title: "Step 3 — Your prep plan — AI Interview Coach" },
      {
        name: "description",
        content:
          "A personalized day-by-day study plan tailored to the job, your background, and your time budget.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    new: typeof s.new === "string" ? s.new : "",
  }),
  component: PlanStep,
});

function PlanStep() {
  const navigate = useNavigate();
  const { new: createMode } = Route.useSearch();
  const isNewRoadmap = createMode === "1";
  const [roadmaps, setRoadmaps] = useState<PrepRoadmap[]>([]);
  const [activeRoadmapId, setActiveRoadmapId] = useState<string>("roadmap-1");
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [signedIn, setSignedIn] = useState(false);
  const [building, setBuilding] = useState(false);
  const [refining, setRefining] = useState(false);
  const [generatingCheatsheet, setGeneratingCheatsheet] = useState(false);
  const [cheatsheet, setCheatsheet] = useState<InterviewCheatsheet | null>(null);
  const [usage, setUsage] = useState<AiUsageResult | null>(null);
  const buildInFlightRef = useRef(false);
  const cheatsheetInFlightRef = useRef(false);

  const activeRoadmap = useMemo(
    () => roadmaps.find((r) => r.id === activeRoadmapId) ?? null,
    [roadmaps, activeRoadmapId],
  );

  useEffect(() => {
    if (isNewRoadmap) {
      const active = getActiveRoadmapLocal();
      const draft = loadPrepDraftLocal() ?? EMPTY_PREP;
      setRoadmaps(listPrepRoadmapsLocal());
      setActiveRoadmapId(active.id);
      setState(draft);

      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(!!data.session);
      });
      return;
    }

    const active = getActiveRoadmapLocal();
    setRoadmaps(listPrepRoadmapsLocal());
    setActiveRoadmapId(active.id);
    setState(active.state ?? loadPrepLocal());

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep({ data: { roadmapId: active.id } });
          if (remote) {
            const merged: PrepState = {
              ...active.state,
              ...remote,
              preferences: {
                ...active.state.preferences,
                interviewDate: remote.interviewDate ?? active.state.preferences.interviewDate,
              },
            };
            savePrepLocal(merged);
            setRoadmaps(listPrepRoadmapsLocal());
            setState(merged);
          }
        } catch {
          /* ignore */
        }
      }
    });
  }, [isNewRoadmap]);

  async function persist(next: PrepState) {
    if (isNewRoadmap) {
      setState(next);
      savePrepDraftLocal(next);
      return;
    }

    setState(next);
    savePrepLocal(next);
    setRoadmaps(listPrepRoadmapsLocal());
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

  async function switchRoadmap(roadmapId: string) {
    const switched = switchActiveRoadmapLocal(roadmapId);
    if (!switched) return;
    setRoadmaps(listPrepRoadmapsLocal());
    setActiveRoadmapId(switched.id);
    setState(switched.state);
    setCheatsheet(null);

    if (signedIn) {
      try {
        const remote = await loadPrep({ data: { roadmapId: switched.id } });
        if (remote) {
          const merged: PrepState = {
            ...switched.state,
            ...remote,
            preferences: {
              ...switched.state.preferences,
              interviewDate: remote.interviewDate ?? switched.state.preferences.interviewDate,
            },
          };
          savePrepLocal(merged);
          setRoadmaps(listPrepRoadmapsLocal());
          setState(merged);
        }
      } catch {
        /* ignore */
      }
    }
  }

  function createRoadmap() {
    const created = createRoadmapLocal({
      sourceState: {
        ...EMPTY_PREP,
        preferences: {
          ...EMPTY_PREP.preferences,
          hoursPerDay: state.preferences.hoursPerDay,
          experienceLevel: state.preferences.experienceLevel,
          interviewType: state.preferences.interviewType,
        },
      },
    });
    setRoadmaps(listPrepRoadmapsLocal());
    setActiveRoadmapId(created.id);
    setState(created.state);
    setCheatsheet(null);
  }

  function renameRoadmap() {
    if (!activeRoadmap) return;
    const nextName = window.prompt("Rename roadmap", activeRoadmap.name);
    if (!nextName) return;
    const updated = renameRoadmapLocal(activeRoadmap.id, nextName);
    if (!updated) return;
    setRoadmaps(listPrepRoadmapsLocal());
  }

  function removeRoadmap() {
    if (!activeRoadmap) return;
    const ok = window.confirm(`Delete \"${activeRoadmap.name}\"? This cannot be undone.`);
    if (!ok) return;
    const nextActive = deleteRoadmapLocal(activeRoadmap.id);
    setRoadmaps(listPrepRoadmapsLocal());
    setActiveRoadmapId(nextActive.id);
    setState(nextActive.state);
    setCheatsheet(null);
  }

  const days = useMemo(() => resolveDaysUntil(state.preferences), [state.preferences]);
  const canBuild = !!state.jobDescription && !!days;

  async function build() {
    if (buildInFlightRef.current || building) return;
    if (!state.jobDescription || state.jobDescription.trim().length < 30) {
      toast.error("Add a job description in step 1 first");
      return;
    }
    if (!days) {
      toast.error("Set your interview date or days-until in step 1");
      return;
    }
    buildInFlightRef.current = true;
    setBuilding(true);
    try {
      const { plan, usage: buildUsage } = await generatePlan({
        data: {
          jobDescription: state.jobDescription,
          jdAnalysis: state.jdAnalysis,
          resumeAnalysis: state.resumeAnalysis,
          experienceLevel: state.preferences.experienceLevel,
          interviewType: state.preferences.interviewType,
          hoursPerDay: state.preferences.hoursPerDay,
          days,
          startDate: todayISO(),
        },
      });
      setUsage(buildUsage ?? null);

      const nextState: PrepState = { ...state, plan, completed: [], answers: {} };

      if (isNewRoadmap) {
        const created = createRoadmapLocal({ sourceState: nextState });
        switchActiveRoadmapLocal(created.id);
        setRoadmaps(listPrepRoadmapsLocal());
        setActiveRoadmapId(created.id);
        setState(created.state);
        clearPrepDraftLocal();

        if (signedIn) {
          try {
            await savePrep({
              data: {
                ...created.state,
                roadmapId: created.id,
                roadmapName: created.name,
                roadmapColor: created.color,
              },
            });
          } catch {
            /* ignore */
          }
        }

        navigate({ to: "/prep/plan" });
      } else {
        await persist(nextState);
      }

      setCheatsheet(null);

      toast.success(`Plan built — ${plan.length} days`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plan generation failed");
    } finally {
      setBuilding(false);
      buildInFlightRef.current = false;
    }
  }

  async function refine() {
    if (!state.jobDescription) return;
    const today = todayISO();
    const remaining = state.plan.filter((d) => d.date >= today);
    const remainingDays = Math.max(1, remaining.length || days || 7);
    setRefining(true);
    try {
      const history = Object.values(state.answers ?? {})
        .flat()
        .map((a) => ({
          question: a.question,
          score: a.score,
          weakAreas: a.weakAreas,
        }));
      const { plan: newPlan, usage: refineUsage } = await refinePlan({
        data: {
          jobDescription: state.jobDescription,
          jdAnalysis: state.jdAnalysis,
          resumeAnalysis: state.resumeAnalysis,
          experienceLevel: state.preferences.experienceLevel,
          interviewType: state.preferences.interviewType,
          hoursPerDay: state.preferences.hoursPerDay,
          startDate: today,
          remainingDays,
          currentPlan: remaining,
          answerHistory: history,
        },
      });
      setUsage(refineUsage ?? null);
      const kept = state.plan.filter((d) => d.date < today);
      await persist({ ...state, plan: [...kept, ...newPlan] });
      setCheatsheet(null);
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
    setCheatsheet(null);
    void persist({ ...state, plan: [], completed: [], answers: {} });
  }

  async function generateCheatsheet() {
    if (cheatsheetInFlightRef.current || generatingCheatsheet) return;
    if (state.plan.length === 0) {
      toast.error("Generate your prep roadmap first.");
      return;
    }

    cheatsheetInFlightRef.current = true;
    setGeneratingCheatsheet(true);
    try {
      const { cheatsheet: generated, usage: generatedUsage } = await generateInterviewCheatsheet({
        data: {
          resumeText: state.resumeText,
          resumeAnalysis: state.resumeAnalysis,
          jobDescription: state.jobDescription,
          jdAnalysis: state.jdAnalysis,
          plan: state.plan,
          answers: state.answers,
          targetRole: roadmapDetails.role,
        },
      });
      setCheatsheet(generated);
      setUsage(generatedUsage ?? null);
      toast.success("Interview cheatsheet ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate cheatsheet");
    } finally {
      setGeneratingCheatsheet(false);
      cheatsheetInFlightRef.current = false;
    }
  }

  const progress = state.plan.length
    ? Math.round((state.completed.length / state.plan.length) * 100)
    : 0;

  const roadmapDetails = useMemo(
    () => getRoadmapDetails(state.jobDescription, activeRoadmap?.name),
    [state.jobDescription, activeRoadmap?.name],
  );

  const phases = useMemo(() => buildPhases(state.plan, state.completed), [state.plan, state.completed]);

  const lastDate = state.plan[state.plan.length - 1]?.date ?? null;
  const milestoneDate = state.preferences.interviewDate ?? lastDate;
  const daysLeft = milestoneDate ? Math.max(0, daysBetween(todayISO(), milestoneDate)) : null;

  return (
    <div>
      <header>
        <p className="eyebrow">Roadmap detail</p>
        <h1 className="display-2 mt-2">Interview readiness timeline.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Here is everything you need to do to be ready for this specific interview.
        </p>
      </header>

      <div className="surface mt-6 rounded-2xl border border-border p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Company</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-terminal" /> {roadmapDetails.company}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Job title</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
              <Briefcase className="h-4 w-4 text-terminal" /> {roadmapDetails.role}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Interview date</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
              <CalendarIcon className="h-4 w-4 text-terminal" />
              {state.preferences.interviewDate ? formatDate(state.preferences.interviewDate) : "Not set"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Days remaining</p>
            <p className="mt-2 text-xl font-semibold">{daysLeft ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Interview type</p>
            <p className="mt-2 text-sm font-medium capitalize">{state.preferences.interviewType || "General"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall progress</p>
            <p className="mt-2 text-xl font-semibold">{progress}%</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-accent">
            <div className="h-full bg-terminal transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {state.completed.length} / {state.plan.length} tasks completed
          </p>
        </div>
      </div>

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        {!isNewRoadmap && (
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {roadmaps.map((roadmap) => {
                const color = colorClasses(roadmap.color);
                const active = roadmap.id === activeRoadmapId;
                return (
                  <button
                    key={roadmap.id}
                    type="button"
                    onClick={() => void switchRoadmap(roadmap.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? `${color.border} ${color.bg} ${color.text}`
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Circle className="h-2.5 w-2.5 fill-current" />
                    <span className="font-medium">{roadmap.name}</span>
                    {roadmap.state.preferences.interviewDate && (
                      <span className="font-mono text-[10px]">{roadmap.state.preferences.interviewDate}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={createRoadmap}>
                <CopyPlus className="h-3.5 w-3.5" /> New roadmap
              </Button>
              {activeRoadmap && (
                <Button variant="ghost" size="sm" onClick={renameRoadmap}>
                  Rename
                </Button>
              )}
              {roadmaps.length > 1 && activeRoadmap && (
                <Button variant="ghost" size="sm" onClick={removeRoadmap}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={build} disabled={!canBuild || building}>
            {building ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {state.plan.length ? "Rebuild plan" : "Generate plan"}
          </Button>
          {state.plan.length > 0 && Object.values(state.answers ?? {}).flat().length > 0 && (
            <Button variant="secondary" onClick={refine} disabled={refining}>
              {refining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Re-personalize from my answers
            </Button>
          )}
          {state.plan.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> reset
            </Button>
          )}
          <Link
            to="/prep/jd"
            search={isNewRoadmap ? { new: "1" } : undefined}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> edit setup
          </Link>
        </div>

        {!canBuild && (
          <p className="mt-4 text-sm text-muted-foreground">
            {!state.jobDescription ? (
              <>
                You need to paste a job description first. {" "}
                <Link to="/prep/jd" search={isNewRoadmap ? { new: "1" } : undefined} className="text-terminal hover:underline">
                  Go to step 1 →
                </Link>
              </>
            ) : (
              <>
                Set your interview date or days-until in {" "}
                <Link to="/prep/jd" search={isNewRoadmap ? { new: "1" } : undefined} className="text-terminal hover:underline">
                  step 1
                </Link>
                .
              </>
            )}
          </p>
        )}

        {canBuild && (
          <p className="mt-4 text-xs text-muted-foreground">
            {days} days · {state.preferences.hoursPerDay}h/day · {state.preferences.experienceLevel} · {state.preferences.interviewType}
            {usage ? (
              <span className="ml-3">
                · {" "}
                {usage.type === "signed-in"
                  ? `${usage.remaining} points left today`
                  : `${usage.remaining} free AI ${usage.remaining === 1 ? "try" : "tries"} left`}
              </span>
            ) : null}
          </p>
        )}
      </div>

      {state.plan.length > 0 && (
        <>
          <div className="surface mt-6 rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Interview Cheatsheet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate a concise final review using your roadmap questions, scored answers, resume, and JD.
                </p>
              </div>
              <Button onClick={generateCheatsheet} disabled={generatingCheatsheet}>
                {generatingCheatsheet ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Interview Cheatsheet
              </Button>
            </div>

            {cheatsheet && (
              <div className="mt-5 space-y-5">
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Most Likely Interview Questions
                  </h3>
                  <ol className="mt-2 space-y-1.5 text-sm">
                    {cheatsheet.mostLikelyQuestions.map((q, idx) => (
                      <li key={q} className="flex gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{idx + 1}.</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Your Best Answers
                  </h3>
                  <div className="mt-2 space-y-3">
                    {cheatsheet.bestAnswers.map((item) => (
                      <article key={item.question} className="rounded-xl border border-border bg-background/60 p-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.question}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${cheatsheetLabelClass(item.label)}`}>
                            {item.label}
                          </span>
                          {typeof item.score === "number" && (
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${scoreClass(item.score)}`}>
                              {item.score}/10
                            </span>
                          )}
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {item.talkingPoints.map((point) => (
                            <li key={point} className="flex gap-2">
                              <span className="text-terminal">•</span> {point}
                            </li>
                          ))}
                        </ul>
                        {item.note && <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>}
                      </article>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-xl border border-border bg-background/50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Key Stories / Examples to Remember
                    </h3>
                    <div className="mt-2 space-y-3">
                      {cheatsheet.keyStories.map((story) => (
                        <article key={story.title}>
                          <p className="text-sm font-medium">{story.title}</p>
                          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                            {story.points.map((point) => (
                              <li key={point} className="flex gap-2">
                                <span className="text-terminal">•</span> {point}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-background/50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Technical or Role-Specific Topics to Review
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {cheatsheet.topicsToReview.map((topic) => (
                        <li key={topic.topic}>
                          <p className="font-medium text-foreground">{topic.topic}</p>
                          <p>{topic.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Questions to Ask the Interviewer
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {cheatsheet.questionsToAsk.map((q) => (
                      <li key={q} className="flex gap-2">
                        <span className="text-terminal">?</span> {q}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>

          <div className="surface mt-6 rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Timeline calendar</h2>
              <span className="text-xs text-muted-foreground">Outlook-style daily schedule</span>
            </div>
            <TimelineCalendar
              plan={state.plan}
              completed={state.completed}
              interviewDate={state.preferences.interviewDate}
              color={activeRoadmap?.color ?? "terminal"}
            />
          </div>

          <div className="mt-6 space-y-4">
            {phases.map((phase, idx) => {
              const phaseProgress = phase.totalDays
                ? Math.round((phase.completedDays / phase.totalDays) * 100)
                : 0;
              return (
                <section key={phase.id} className="surface rounded-2xl border border-border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="eyebrow">Phase {idx + 1}</p>
                      <h3 className="mt-1 text-lg font-semibold">{phase.label}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(phase.startDate)}{phase.startDate !== phase.endDate ? ` - ${formatDate(phase.endDate)}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{phaseProgress}% complete</p>
                      <p className="text-xs text-muted-foreground">
                        {phase.completedDays}/{phase.totalDays} tasks done
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent">
                    <div className="h-full bg-terminal transition-all" style={{ width: `${phaseProgress}%` }} />
                  </div>

                  <ol className="mt-4 space-y-2">
                    {phase.days.map((day) => {
                      const done = state.completed.includes(day.date);
                      const isPast = day.date < todayISO();
                      const isToday = day.date === todayISO();
                      const dayAnswers = state.answers?.[day.date] ?? [];
                      const questionCount = day.questions?.length ?? 0;
                      return (
                        <li
                          key={day.date}
                          className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start ${
                            isToday
                              ? "border-foreground"
                              : done
                                ? "border-terminal/40 bg-terminal/5"
                                : "border-border"
                          }`}
                        >
                          <button
                            onClick={() => toggleDay(day.date)}
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                              done
                                ? "border-terminal bg-terminal text-primary-foreground"
                                : "border-border bg-background hover:border-terminal/60"
                            }`}
                            aria-label={done ? "Mark incomplete" : "Mark complete"}
                          >
                            {done && <Check className="h-3.5 w-3.5" />}
                          </button>

                          <Link
                            to="/prep/plan/$date"
                            params={{ date: day.date }}
                            className="group min-w-0 flex-1"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {formatDate(day.date)}
                              </span>
                              {isToday && (
                                <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                                  TODAY
                                </span>
                              )}
                              {isPast && !done && (
                                <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                                  missed
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-terminal">
                                {day.focusArea}
                              </span>
                              {(day.blockType ?? "study") !== "study" && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                    day.blockType === "job_search"
                                      ? "border-amber/40 bg-amber/10 text-amber"
                                      : "border-sky-500/40 bg-sky-500/10 text-sky-600"
                                  }`}
                                >
                                  {day.blockType === "job_search" ? "Job search" : "Skill practice"}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" /> ~{day.estimatedHours}h
                              </span>
                              {questionCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <MessageSquare className="h-3 w-3" /> {dayAnswers.length}/{questionCount} answered
                                </span>
                              )}
                              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            </div>
                            {day.topics.length > 0 && (
                              <p className="mt-2 text-sm font-medium">{day.topics.join(" · ")}</p>
                            )}
                            {day.activities.length > 0 && (
                              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                {day.activities.slice(0, 3).map((d, i) => (
                                  <li key={i} className="flex gap-2">
                                    <span className="text-terminal">→</span> {d}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>

          {milestoneDate && (
            <div className="surface mt-6 rounded-2xl border border-terminal/40 bg-terminal/10 p-5">
              <p className="eyebrow">Destination</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-terminal">Interview day milestone</p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(milestoneDate)}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-terminal/40 bg-background px-3 py-1 text-xs font-medium text-terminal">
                  <Flag className="h-3.5 w-3.5" /> Final destination
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {state.plan.length === 0 && (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-accent/40 p-5 text-sm text-muted-foreground">
          <CalendarIcon className="mt-0.5 h-4 w-4 text-terminal" />
          <p>
            Click <strong>Generate plan</strong> above and we'll build a day-by-day schedule
            tailored to the role, your background, and your time budget.
          </p>
        </div>
      )}
    </div>
  );
}

function TimelineCalendar({
  plan,
  completed,
  interviewDate,
  color,
}: {
  plan: PrepState["plan"];
  completed: string[];
  interviewDate: string | null;
  color: RoadmapColor;
}) {
  const calendar = buildCalendar(plan);
  const dayMap = new Map(plan.map((d) => [d.date, d]));
  const colorStyle = colorClasses(color);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-7 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="rounded-md bg-accent/30 px-2 py-1 text-center font-semibold">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {calendar.map((date) => {
            const planDay = dayMap.get(date);
            const isToday = date === todayISO();
            const isDone = completed.includes(date);
            const isInterview = interviewDate === date;
            const isMilestone = !!planDay && /mock|review|final|onsite|panel/i.test(planDay.focusArea);
            const normalizedBlockType = planDay?.blockType ?? "study";
            const blockStyle =
              normalizedBlockType === "job_search"
                ? { border: "border-amber/40", bg: "bg-amber/10", text: "text-amber" }
                : normalizedBlockType === "skill_practice"
                  ? { border: "border-sky-500/40", bg: "bg-sky-500/10", text: "text-sky-600" }
                  : colorStyle;
            return (
              <div
                key={date}
                className={`min-h-[122px] rounded-lg border p-2 ${
                  isToday ? "border-foreground" : "border-border"
                } ${isDone ? "opacity-75" : ""}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">{date.slice(8)}</span>
                  {isToday && (
                    <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold text-background">
                      today
                    </span>
                  )}
                </div>

                {isInterview && (
                  <div
                    className={`mb-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${colorStyle.border} ${colorStyle.bg} ${colorStyle.text}`}
                  >
                    <Flag className="h-3 w-3" /> Interview
                  </div>
                )}

                {planDay ? (
                  <div className="space-y-1 text-[10px]">
                    <div className={`rounded-md border px-1.5 py-1 ${blockStyle.border} ${blockStyle.bg}`}>
                      <p className={`line-clamp-1 font-semibold ${blockStyle.text}`}>{planDay.focusArea}</p>
                      <p className="mt-0.5 text-muted-foreground">{planDay.activities.length} prep tasks</p>
                    </div>
                    {(planDay.questions?.length ?? 0) > 0 && (
                      <div className="rounded-md border border-border bg-background px-1.5 py-1 text-muted-foreground">
                        Practice session: {planDay.questions?.length}
                      </div>
                    )}
                    {normalizedBlockType === "job_search" && (
                      <div className="rounded-md border border-amber/40 bg-amber/10 px-1.5 py-1 text-amber">
                        Job search day
                      </div>
                    )}
                    {normalizedBlockType === "skill_practice" && (
                      <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-1 text-sky-600">
                        Skill practice
                      </div>
                    )}
                    {isMilestone && (
                      <div className="rounded-md border border-terminal/30 bg-terminal/10 px-1.5 py-1 text-terminal">
                        Milestone day
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">No scheduled prep</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type PlanPhase = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  days: PrepState["plan"];
  completedDays: number;
  totalDays: number;
};

function buildPhases(plan: PrepState["plan"], completed: string[]): PlanPhase[] {
  if (plan.length === 0) return [];
  const ordered = [...plan].sort((a, b) => a.date.localeCompare(b.date));

  // Keep short windows compact and realistic.
  if (ordered.length <= 2) {
    return [
      {
        id: "phase-priority",
        label: "Priority Preparation",
        startDate: ordered[0].date,
        endDate: ordered[ordered.length - 1].date,
        days: ordered,
        completedDays: ordered.filter((d) => completed.includes(d.date)).length,
        totalDays: ordered.length,
      },
    ];
  }

  const phases: PlanPhase[] = [];
  let current: { label: string; days: PrepState["plan"] } | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const day = ordered[i];
    const label = inferPhaseLabel(day, i, ordered.length);

    if (!current || current.label !== label) {
      if (current && current.days.length > 0) {
        phases.push(toPhase(current.label, current.days, completed, phases.length + 1));
      }
      current = { label, days: [day] };
    } else {
      current.days.push(day);
    }
  }

  if (current && current.days.length > 0) {
    phases.push(toPhase(current.label, current.days, completed, phases.length + 1));
  }

  return phases;
}

function toPhase(
  label: string,
  days: PrepState["plan"],
  completed: string[],
  idx: number,
): PlanPhase {
  const startDate = days[0]?.date ?? todayISO();
  const endDate = days[days.length - 1]?.date ?? startDate;
  const completedDays = days.filter((d) => completed.includes(d.date)).length;
  return {
    id: `phase-${idx}-${startDate}`,
    label,
    startDate,
    endDate,
    days,
    completedDays,
    totalDays: days.length,
  };
}

function inferPhaseLabel(day: PrepState["plan"][number], idx: number, total: number): string {
  const text = [day.focusArea, ...(day.topics ?? []), ...(day.activities ?? [])].join(" ").toLowerCase();

  if (/final|rest|review|checklist|light/i.test(text) || idx >= total - 1) return "Final Review";
  if (/mock|rehears|simulation|dry run|interview practice|panel/i.test(text)) return "Interview Rehearsal";
  if (/behavior|star|story|communication|leadership|conflict|teamwork/i.test(text)) {
    return "Behavioral Preparation";
  }
  if (/company|role|research|mission|team|org|stakeholder/i.test(text)) {
    return "Company & Role Research";
  }
  if (/technical|coding|sql|api|system|architecture|debug|algorithm|query|test automation|tools/i.test(text)) {
    return "Technical Preparation";
  }
  if (/foundation|fundamental|basics|core/i.test(text) || idx === 0) return "Foundation";
  return "Role-Specific Preparation";
}

function getRoadmapDetails(
  jobDescription: string,
  fallbackName?: string,
): { company: string; role: string } {
  const jd = jobDescription?.trim() ?? "";
  const lines = jd
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 14);

  const explicitCompany =
    lines.find((line) => /^company\s*[:\-]/i.test(line))?.replace(/^company\s*[:\-]\s*/i, "") ?? null;
  const firstWithAt = lines.find((line) => /\sat\s/i.test(line)) ?? null;
  const companyFromAt = firstWithAt
    ? firstWithAt.split(/\sat\s/i)[1]?.split(/[,.|]/)[0]?.trim() ?? null
    : null;

  const fallbackCompany = fallbackName?.trim() || "Company not specified";
  const company = explicitCompany || companyFromAt || fallbackCompany;

  const likelyRoleLine =
    lines.find((line) => /engineer|manager|specialist|analyst|designer|consultant|lead|director|coordinator|officer|developer|architect|associate|administrator/i.test(line)) ??
    lines[0] ??
    "Role not specified";

  const role =
    likelyRoleLine.length > 110 ? `${likelyRoleLine.slice(0, 107).trimEnd()}...` : likelyRoleLine;

  return { company, role };
}

function buildCalendar(plan: PrepState["plan"]): string[] {
  if (plan.length === 0) {
    const today = todayISO();
    return [today];
  }
  const ordered = [...plan].sort((a, b) => a.date.localeCompare(b.date));
  const start = startOfWeek(ordered[0].date);
  const end = endOfWeek(ordered[ordered.length - 1].date);
  const days = Math.max(1, daysBetween(start, end) + 1);
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

function startOfWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function endOfWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + (6 - d.getDay()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function colorClasses(color: RoadmapColor): { border: string; bg: string; text: string } {
  switch (color) {
    case "amber":
      return { border: "border-amber/40", bg: "bg-amber/10", text: "text-amber" };
    case "sky":
      return { border: "border-sky-500/40", bg: "bg-sky-500/10", text: "text-sky-600" };
    case "rose":
      return { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-600" };
    case "emerald":
      return { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-600" };
    case "indigo":
      return { border: "border-indigo-500/40", bg: "bg-indigo-500/10", text: "text-indigo-600" };
    case "terminal":
    default:
      return { border: "border-terminal/40", bg: "bg-terminal/10", text: "text-terminal" };
  }
}

function cheatsheetLabelClass(label: "Your Answer" | "Improve This" | "Suggested Answer"): string {
  if (label === "Your Answer") return "border-terminal/40 bg-terminal/10 text-terminal";
  if (label === "Improve This") return "border-amber/40 bg-amber/10 text-amber";
  return "border-sky-500/40 bg-sky-500/10 text-sky-600";
}

function scoreClass(score: number): string {
  if (score >= 8) return "border-terminal/40 bg-terminal/10 text-terminal";
  if (score >= 6) return "border-border bg-accent text-foreground";
  return "border-amber/40 bg-amber/10 text-amber";
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
