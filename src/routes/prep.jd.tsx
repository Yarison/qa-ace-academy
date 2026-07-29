import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRight, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { analyzeJd, savePrep, loadPrep } from "@/lib/prep.functions";
import {
  getActiveRoadmapLocal,
  loadPrepDraftLocal,
  loadPrepLocal,
  savePrepDraftLocal,
  savePrepLocal,
  EMPTY_PREP,
  todayISO,
  daysBetween,
  type PrepState,
  type ExperienceLevel,
  type InterviewType,
  type PrepRoadmap,
} from "@/lib/prep-storage";
import type { AiUsageResult } from "@/lib/ai-usage.server";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/prep/jd")({
  head: () => ({
    meta: [
      { title: "Step 1 — Job & setup — AI Interview Coach" },
      {
        name: "description",
        content:
          "Paste the job description and tell us your timeline, hours, and experience level.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    new: typeof s.new === "string" ? s.new : "",
  }),
  component: JdStep,
});

const LEVELS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "New to this role or field" },
  { value: "intermediate", label: "Intermediate", hint: "Some relevant experience" },
  { value: "experienced", label: "Experienced", hint: "Senior / deep experience" },
];

type DateMode = "date" | "days";

function JdStep() {
  const navigate = useNavigate();
  const { new: createMode } = Route.useSearch();
  const isNewRoadmap = createMode === "1";
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [activeRoadmap, setActiveRoadmap] = useState<PrepRoadmap | null>(null);
  const [usage, setUsage] = useState<AiUsageResult | null>(null);
  const [jd, setJd] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("date");
  const [interviewDate, setInterviewDate] = useState("");
  const [daysUntil, setDaysUntil] = useState<number>(7);
  const [hoursPerDay, setHoursPerDay] = useState<number>(2);
  const [level, setLevel] = useState<ExperienceLevel>("intermediate");
  const [interviewType, setInterviewType] = useState<InterviewType>("general");
  const [running, setRunning] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (isNewRoadmap) {
      const draft = loadPrepDraftLocal() ?? EMPTY_PREP;
      setActiveRoadmap(null);
      setState(draft);
      setJd(draft.jobDescription ?? "");
      setInterviewDate(draft.preferences.interviewDate ?? "");
      if (draft.preferences.daysUntil) {
        setDaysUntil(draft.preferences.daysUntil);
        setDateMode("days");
      } else {
        setDateMode("date");
      }
      setHoursPerDay(draft.preferences.hoursPerDay);
      setLevel(draft.preferences.experienceLevel);
      setInterviewType(draft.preferences.interviewType ?? "general");

      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(!!data.session);
      });
      return;
    }

    const active = getActiveRoadmapLocal();
    setActiveRoadmap(active);
    const local = active.state ?? loadPrepLocal();
    setState(local);
    setJd(local.jobDescription ?? "");
    setInterviewDate(local.preferences.interviewDate ?? "");
    if (local.preferences.daysUntil) {
      setDaysUntil(local.preferences.daysUntil);
      setDateMode("days");
    }
    setHoursPerDay(local.preferences.hoursPerDay);
    setLevel(local.preferences.experienceLevel);
    setInterviewType(local.preferences.interviewType ?? "general");

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSignedIn(true);
        try {
          const remote = await loadPrep({ data: { roadmapId: active.id } });
          if (remote) {
            const merged: PrepState = {
              ...local,
              ...remote,
              preferences: {
                ...local.preferences,
                interviewDate: remote.interviewDate ?? local.preferences.interviewDate,
              },
            };
            setState(merged);
            savePrepLocal(merged);
            setJd(remote.jobDescription ?? "");
            if (remote.interviewDate) {
              setInterviewDate(remote.interviewDate);
              setDateMode("date");
            }
          }
        } catch {
          /* ignore */
        }
      }
    });
  }, [isNewRoadmap]);

  const setupValid = useMemo(() => {
    if (hoursPerDay < 1 || hoursPerDay > 12) return false;
    if (dateMode === "date") {
      if (!interviewDate) return false;
      return daysBetween(todayISO(), interviewDate) >= 1;
    }
    return daysUntil >= 1 && daysUntil <= 60;
  }, [dateMode, interviewDate, daysUntil, hoursPerDay]);

  async function persist(next: PrepState) {
    if (isNewRoadmap) {
      savePrepDraftLocal(next);
      setState(next);
      return;
    }

    savePrepLocal(next);
    setState(next);
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

  async function run() {
    if (jd.trim().length < 30) {
      toast.error("Paste the full job description (min ~30 chars)");
      return;
    }
    if (!setupValid) {
      toast.error("Fix the timeline / hours before continuing");
      return;
    }
    setRunning(true);
    try {
      const analysisResult = await analyzeJd({
        data: {
          resumeAnalysis: state.resumeAnalysis,
          jobDescription: jd.trim(),
        },
      });
      const { usage: analysisUsage, ...analysis } = analysisResult;
      setUsage(analysisUsage ?? null);
      const next: PrepState = {
        ...state,
        jobDescription: jd.trim(),
        jdAnalysis: analysis,
        preferences: {
          interviewDate: dateMode === "date" ? interviewDate : null,
          daysUntil: dateMode === "days" ? daysUntil : null,
          hoursPerDay,
          experienceLevel: level,
          interviewType,
        },
      };
      await persist(next);
      toast.success("Job description analyzed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  async function saveSetupAndContinue() {
    if (!setupValid) {
      toast.error("Fix the timeline / hours before continuing");
      return;
    }
    const next: PrepState = {
      ...state,
      jobDescription: jd.trim(),
      preferences: {
        interviewDate: dateMode === "date" ? interviewDate : null,
        daysUntil: dateMode === "days" ? daysUntil : null,
        hoursPerDay,
        experienceLevel: level,
        interviewType,
      },
    };
    await persist(next);
    navigate({ to: "/prep/resume", search: isNewRoadmap ? { new: "1" } : undefined });
  }

  const j = state.jdAnalysis;

  return (
    <div>
      <header>
        <p className="eyebrow">Step 1</p>
        <h1 className="display-2 mt-2">Where are you interviewing?</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Works for any role — engineering, marketing, healthcare, finance, design. Paste the JD,
          tell us how long you have, and we'll do the rest.
        </p>
      </header>

      <div className="surface mt-8 space-y-6 rounded-2xl border border-border p-6">
        <div>
          <label className="block text-sm font-medium">Job description</label>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description…"
            className="mt-2 min-h-[220px] w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Interview timing</label>
              <div className="inline-flex rounded-full border border-border bg-background p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDateMode("date")}
                  className={`rounded-full px-2 py-0.5 ${dateMode === "date" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  Date
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode("days")}
                  className={`rounded-full px-2 py-0.5 ${dateMode === "days" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  Days
                </button>
              </div>
            </div>
            {dateMode === "date" ? (
              <input
                type="date"
                min={todayISO()}
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-terminal/60"
              />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={daysUntil}
                  onChange={(e) =>
                    setDaysUntil(Math.max(1, Math.min(60, parseInt(e.target.value || "1", 10))))
                  }
                  className="w-24 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-terminal/60"
                />
                <span className="text-sm text-muted-foreground">days from today</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Hours per day to study</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="w-16 rounded-md border border-border bg-background px-2 py-1 text-center font-mono text-sm">
                {hoursPerDay}h
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Experience level</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLevel(l.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  level === l.value
                    ? "border-blue-500 bg-blue-100 dark:border-blue-400 dark:bg-blue-900"
                    : "border-border bg-background hover:border-foreground/40"
                }`}
              >
                {level === l.value && (
                  <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-blue-700 dark:text-blue-200" />
                )}
                <div className="text-sm font-medium">{l.label}</div>
                <div
                  className={`text-xs ${level === l.value ? "text-accent-foreground/80" : "text-muted-foreground"}`}
                >
                  {l.hint}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Interview type</label>
          <select
            value={interviewType}
            onChange={(e) => setInterviewType(e.target.value as InterviewType)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-terminal/60"
          >
            <option value="general">General</option>
            <option value="behavioral">Behavioral</option>
            <option value="technical">Technical / hard-skills</option>
            <option value="case">Case</option>
            <option value="panel">Panel</option>
            <option value="take-home">Take-home / assignment review</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {j ? "Re-analyze JD" : "Analyze job description"}
          </Button>
          {usage ? (
            <p className="text-sm text-muted-foreground">
              {usage.type === "signed-in"
                ? `${usage.remaining} points left today`
                : `${usage.remaining} free AI ${usage.remaining === 1 ? "try" : "tries"} left`}
            </p>
          ) : null}
          <button
            onClick={saveSetupAndContinue}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Skip analysis, continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {j && (
        <div className="surface mt-6 rounded-2xl border border-border p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Role breakdown</h2>
            {j.matchScore !== null && (
              <span className="font-mono text-sm">
                Match:{" "}
                <span
                  className={
                    j.matchScore >= 70
                      ? "text-terminal"
                      : j.matchScore >= 40
                        ? "text-amber"
                        : "text-destructive"
                  }
                >
                  {j.matchScore}%
                </span>
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{j.summary}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Category label="Technical skills" items={j.technicalSkills} color="text-terminal" />
            <Category label="Soft skills" items={j.softSkills} color="text-terminal" />
            <Category
              label="Tools & technologies"
              items={j.toolsAndTechnologies}
              color="text-terminal"
            />
            <Category
              label="Industry knowledge"
              items={j.industryKnowledge}
              color="text-terminal"
            />
            <Category
              label="Certifications & methodologies"
              items={j.certifications}
              color="text-amber"
            />
            <Category
              label="Keywords & competencies"
              items={j.keywordsAndCompetencies}
              color="text-muted-foreground"
            />
          </div>

          {j.likelyQuestions.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow">Likely interview questions</p>
              <ol className="mt-2 space-y-2 text-sm">
                {j.likelyQuestions.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}.
                    </span>{" "}
                    {q}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={saveSetupAndContinue}>
              Next: add resume <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Skip resume?{" "}
        <Link to="/prep/plan" className="underline hover:text-foreground">
          Jump straight to plan →
        </Link>
      </p>
    </div>
  );
}

function Category({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((s) => (
          <li key={s} className="flex gap-2">
            <span className={color}>•</span> {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
