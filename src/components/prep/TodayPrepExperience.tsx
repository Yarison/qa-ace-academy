import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Calendar, CheckCircle2, Clock3, Layers, Play, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadPrep } from "@/lib/prep.functions";
import {
  daysBetween,
  getActiveRoadmapLocal,
  listPrepRoadmapsLocal,
  savePrepWorkspaceLocal,
  switchActiveRoadmapLocal,
  todayISO,
  type PrepRoadmap,
  type RoadmapColor,
} from "@/lib/prep-storage";
import { Button } from "@/components/ui/button";

type TodayTask = {
  roadmapId: string;
  roadmapName: string;
  roadmapColor: RoadmapColor;
  company: string;
  role: string;
  date: string;
  focusArea: string;
  activities: string[];
  questionsCount: number;
  estimatedHours: number;
  done: boolean;
  interviewDate: string | null;
  daysToInterview: number | null;
  sharedKey: string;
};

type TodayTaskGroup = {
  roadmapId: string;
  roadmap: PrepRoadmap | null;
  tasks: TodayTask[];
};

export function TodayPrepExperience() {
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState<PrepRoadmap[]>([]);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const localRoadmaps = listPrepRoadmapsLocal();
    setRoadmaps(localRoadmaps);

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;

      const profileResult = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      const metadataName =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : null;

      setUserName(profileResult.data?.display_name ?? metadataName);

      const synced = await Promise.all(
        localRoadmaps.map(async (roadmap) => {
          try {
            const remote = await loadPrep({ data: { roadmapId: roadmap.id } });
            if (!remote) return roadmap;
            return {
              ...roadmap,
              state: {
                ...roadmap.state,
                ...remote,
                preferences: {
                  ...roadmap.state.preferences,
                  interviewDate: remote.interviewDate ?? roadmap.state.preferences.interviewDate,
                },
              },
            } satisfies PrepRoadmap;
          } catch {
            return roadmap;
          }
        }),
      );

      const changed = JSON.stringify(synced) !== JSON.stringify(localRoadmaps);
      if (changed && synced.length > 0) {
        const activeRoadmapId = getActiveRoadmapLocal().id;
        savePrepWorkspaceLocal({ activeRoadmapId, roadmaps: synced });
        setRoadmaps(synced);
      }
    });
  }, []);

  const todayTasks = useMemo<TodayTask[]>(() => {
    const today = todayISO();
    const detailsByRoadmap = new Map(roadmaps.map((r) => [r.id, getRoadmapDetails(r)]));
    return roadmaps
      .map((roadmap) => {
        const day = roadmap.state.plan.find((d) => d.date === today);
        if (!day) return null;
        const details = detailsByRoadmap.get(roadmap.id) ?? {
          company: "Company not specified",
          role: "Role not specified",
        };
        const interviewDate = roadmap.state.preferences.interviewDate ?? null;
        const daysToInterview = interviewDate ? Math.max(0, daysBetween(today, interviewDate)) : null;
        return {
          roadmapId: roadmap.id,
          roadmapName: roadmap.name,
          roadmapColor: roadmap.color,
          company: details.company,
          role: details.role,
          date: day.date,
          focusArea: day.focusArea,
          activities: day.activities,
          questionsCount: day.questions?.length ?? 0,
          estimatedHours: day.estimatedHours,
          done: roadmap.state.completed.includes(day.date),
          interviewDate,
          daysToInterview,
          sharedKey: normalizeSharedKey(day.focusArea),
        } satisfies TodayTask;
      })
      .filter((task): task is TodayTask => !!task);
  }, [roadmaps]);

  const prioritizedTodayTasks = useMemo(() => {
    return [...todayTasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aDays = a.daysToInterview ?? 10_000;
      const bDays = b.daysToInterview ?? 10_000;
      if (aDays !== bDays) return aDays - bDays;
      if (a.estimatedHours !== b.estimatedHours) return b.estimatedHours - a.estimatedHours;
      return a.roadmapName.localeCompare(b.roadmapName);
    });
  }, [todayTasks]);

  const grouped = useMemo<TodayTaskGroup[]>(() => {
    const map = new Map<string, TodayTask[]>();
    for (const task of prioritizedTodayTasks) {
      const list = map.get(task.roadmapId) ?? [];
      list.push(task);
      map.set(task.roadmapId, list);
    }
    return Array.from(map.entries()).map(([roadmapId, tasks]) => ({
      roadmapId,
      roadmap: roadmaps.find((r) => r.id === roadmapId) ?? null,
      tasks,
    }));
  }, [prioritizedTodayTasks, roadmaps]);

  const totals = useMemo(() => {
    const totalTasks = todayTasks.length;
    const completedTasks = todayTasks.filter((t) => t.done).length;
    const remainingTasks = totalTasks - completedTasks;
    const totalHours = todayTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    return { totalTasks, completedTasks, remainingTasks, totalHours };
  }, [todayTasks]);

  const activeRoadmap = useMemo(() => {
    return roadmaps.find((r) => r.id === getActiveRoadmapLocal().id) ?? roadmaps[0] ?? null;
  }, [roadmaps]);

  function openRoadmap(roadmapId: string) {
    switchActiveRoadmapLocal(roadmapId);
    navigate({ to: "/prep/plan" });
  }

  function startTask(task: TodayTask) {
    switchActiveRoadmapLocal(task.roadmapId);
    navigate({ to: "/prep/plan/$date", params: { date: task.date } });
  }

  function startToday() {
    const nextTask = prioritizedTodayTasks.find((task) => !task.done) ?? prioritizedTodayTasks[0];
    if (!nextTask) return;
    startTask(nextTask);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="surface rounded-2xl border border-border p-6">
        <p className="eyebrow">Today's Prep</p>
        <h1 className="display-2 mt-2">{userName ? `Good morning, ${userName}` : "Good morning"}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Your focused daily prep workspace. Start here to continue today's preparation.
        </p>
      </header>

      <section className="mt-6 surface rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Today's Prep</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One combined daily view across all active interviews
            </p>
          </div>
          <Button onClick={startToday} disabled={prioritizedTodayTasks.length === 0}>
            <Play className="h-4 w-4" /> Start Today's Prep
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Tasks today" value={String(totals.totalTasks)} />
          <Metric label="Estimated time" value={`~${formatHours(totals.totalHours)}h`} />
          <Metric label="Completed" value={String(totals.completedTasks)} />
          <Metric label="Remaining" value={String(totals.remainingTasks)} />
        </div>

        {todayTasks.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-accent/30 p-5 text-sm text-muted-foreground">
            <p>No tasks scheduled for today. You can still review your timeline or open a roadmap.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/prep" })}>
                View calendar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => activeRoadmap && openRoadmap(activeRoadmap.id)}>
                Open roadmap
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {grouped.length === 1 ? (
              <p className="text-xs text-muted-foreground">
                Focus interview today: {grouped[0]?.tasks[0]?.company ?? grouped[0]?.tasks[0]?.roadmapName}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tasks grouped by roadmap to coordinate multiple interviews in one daily workflow
              </p>
            )}

            {grouped.map((group) => {
              const baseTask = group.tasks[0];
              const color = baseTask ? colorClasses(baseTask.roadmapColor) : colorClasses("terminal");
              return (
                <article key={group.roadmapId} className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${color.border} ${color.bg} ${color.text}`}>
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {baseTask?.roadmapName ?? "Roadmap"}
                      </span>
                      <span className="text-xs text-muted-foreground">{baseTask?.company ?? "Company not specified"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openRoadmap(group.roadmapId)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open roadmap →
                    </button>
                  </div>

                  <ol className="mt-3 space-y-2">
                    {group.tasks.map((task) => {
                      const shared = group.tasks.length > 1 || task.sharedKey.length > 0;
                      return (
                        <li key={`${task.roadmapId}-${task.date}`}>
                          <button
                            type="button"
                            onClick={() => startTask(task)}
                            className={`w-full rounded-lg border p-3 text-left transition-colors hover:border-foreground/30 ${
                              task.done ? "border-terminal/30 bg-terminal/5" : "border-border bg-background"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{task.focusArea}</span>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock3 className="h-3 w-3" /> ~{task.estimatedHours}h
                              </span>
                              {task.questionsCount > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {task.questionsCount} practice {task.questionsCount === 1 ? "question" : "questions"}
                                </span>
                              )}
                              {shared && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-terminal/40 bg-terminal/10 px-2 py-0.5 text-[10px] text-terminal">
                                  <Layers className="h-3 w-3" /> today focus
                                </span>
                              )}
                              <span
                                className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                                  task.done
                                    ? "border border-terminal/40 bg-terminal/10 text-terminal"
                                    : "border border-border bg-background text-muted-foreground"
                                }`}
                              >
                                <CheckCircle2 className="h-3 w-3" /> {task.done ? "Completed" : "Remaining"}
                              </span>
                            </div>
                            {task.activities.length > 0 && (
                              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                {task.activities.slice(0, 2).join(" · ")}
                              </p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function getRoadmapDetails(roadmap: PrepRoadmap): { company: string; role: string } {
  const jd = roadmap.state.jobDescription?.trim() ?? "";
  const lines = jd
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  const explicitCompany =
    lines.find((line) => /^company\s*[:\-]/i.test(line))?.replace(/^company\s*[:\-]\s*/i, "") ?? null;
  const firstWithAt = lines.find((line) => /\sat\s/i.test(line)) ?? null;
  const companyFromAt = firstWithAt
    ? firstWithAt.split(/\sat\s/i)[1]?.split(/[,.|]/)[0]?.trim() ?? null
    : null;

  const company = explicitCompany || companyFromAt || roadmap.name || "Company not specified";

  const likelyRoleLine =
    lines.find((line) => /engineer|manager|specialist|analyst|designer|consultant|lead|director|coordinator|officer|developer|architect/i.test(line)) ??
    lines[0] ??
    "Role not specified";

  const role =
    likelyRoleLine.length > 100 ? `${likelyRoleLine.slice(0, 97).trimEnd()}...` : likelyRoleLine;

  return { company, role };
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

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function normalizeSharedKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
