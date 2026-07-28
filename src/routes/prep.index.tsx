import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock3,
  Layers,
  Plus,
  Play,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadPrep } from "@/lib/prep.functions";
import {
  createRoadmapLocal,
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

export const Route = createFileRoute("/prep/")({
  head: () => ({
    meta: [
      { title: "My Prep — PrepPilotX" },
      {
        name: "description",
        content:
          "Your interview preparation dashboard with upcoming interviews, today's tasks, active prep roadmaps, and a multi-interview calendar.",
      },
    ],
  }),
  component: MyPrepDashboard,
});

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

type CalendarEvent = {
  id: string;
  date: string;
  roadmapId: string;
  roadmapName: string;
  roadmapColor: RoadmapColor;
  company: string;
  title: string;
  done: boolean;
  type: "task" | "interview";
};

type CalendarView = "month" | "week";

type SharedTopicTask = {
  roadmapId: string;
  roadmapName: string;
  roadmapColor: RoadmapColor;
  company: string;
  date: string;
  title: string;
  done: boolean;
};

type SharedTopicItem = {
  key: string;
  label: string;
  roadmapIds: string[];
  tasks: SharedTopicTask[];
};

type FocusTask = {
  roadmapId: string;
  roadmapName: string;
  roadmapColor: RoadmapColor;
  company: string;
  date: string;
  title: string;
  estimatedHours: number;
  sharedRoadmapCount: number;
};

type FocusModeData = {
  roadmapId: string;
  roadmapName: string;
  roadmapColor: RoadmapColor;
  company: string;
  daysToInterview: number | null;
  progress: number;
  availableHoursPerDay: number;
  reasons: string[];
  recommended: FocusTask[];
  totalEstimatedHours: number;
};

function MyPrepDashboard() {
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState<PrepRoadmap[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [cursorDate, setCursorDate] = useState<Date>(new Date(todayISO() + "T00:00:00"));
  const [selectedRoadmapIds, setSelectedRoadmapIds] = useState<string[]>([]);
  const [includeInterviews, setIncludeInterviews] = useState(true);

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

  useEffect(() => {
    const allIds = roadmaps.map((r) => r.id);
    if (selectedRoadmapIds.length === 0 && allIds.length > 0) {
      setSelectedRoadmapIds(allIds);
      return;
    }
    if (selectedRoadmapIds.length > 0) {
      const next = selectedRoadmapIds.filter((id) => allIds.includes(id));
      if (next.length !== selectedRoadmapIds.length) {
        setSelectedRoadmapIds(next.length > 0 ? next : allIds);
      }
    }
  }, [roadmaps, selectedRoadmapIds]);

  const roadmapDetailsById = useMemo(() => {
    return new Map(roadmaps.map((r) => [r.id, getRoadmapDetails(r)]));
  }, [roadmaps]);

  const upcomingInterviews = useMemo(() => {
    const today = todayISO();
    return roadmaps
      .filter((r) => !!r.state.preferences.interviewDate)
      .map((r) => ({
        roadmap: r,
        interviewDate: r.state.preferences.interviewDate as string,
      }))
      .filter((entry) => entry.interviewDate >= today)
      .sort((a, b) => a.interviewDate.localeCompare(b.interviewDate));
  }, [roadmaps]);

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
        const sharedKey = normalizeSharedKey(day.focusArea);
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
          sharedKey,
        } satisfies TodayTask;
      })
      .filter((task): task is TodayTask => !!task);
  }, [roadmaps]);

  const sharedTaskKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of todayTasks) {
      if (!task.sharedKey) continue;
      counts.set(task.sharedKey, (counts.get(task.sharedKey) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  }, [todayTasks]);

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

  const todayTasksByRoadmap = useMemo(() => {
    const grouped = new Map<string, TodayTask[]>();
    for (const task of prioritizedTodayTasks) {
      const list = grouped.get(task.roadmapId) ?? [];
      list.push(task);
      grouped.set(task.roadmapId, list);
    }
    return Array.from(grouped.entries()).map(([roadmapId, tasks]) => ({
      roadmapId,
      tasks,
      roadmap: roadmaps.find((r) => r.id === roadmapId) ?? null,
    }));
  }, [prioritizedTodayTasks, roadmaps]);

  const todayTotals = useMemo(() => {
    const totalTasks = todayTasks.length;
    const completedTasks = todayTasks.filter((t) => t.done).length;
    const remainingTasks = totalTasks - completedTasks;
    const totalHours = todayTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    return { totalTasks, completedTasks, remainingTasks, totalHours };
  }, [todayTasks]);

  const sharedTopicRoadmapMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const roadmap of roadmaps) {
      for (const day of roadmap.state.plan) {
        if (roadmap.state.completed.includes(day.date)) continue;
        const topics = extractCanonicalTopics(day.focusArea, day.topics);
        for (const topic of topics) {
          const set = map.get(topic) ?? new Set<string>();
          set.add(roadmap.id);
          map.set(topic, set);
        }
      }
    }
    return map;
  }, [roadmaps]);

  const sharedPreparation = useMemo<SharedTopicItem[]>(() => {
    const byKey = new Map<
      string,
      {
        label: string;
        roadmapIds: Set<string>;
        tasks: SharedTopicTask[];
      }
    >();

    for (const roadmap of roadmaps) {
      const details = roadmapDetailsById.get(roadmap.id) ?? {
        company: "Company not specified",
        role: "Role not specified",
      };

      for (const day of roadmap.state.plan) {
        const rawTopics = day.topics.length > 0 ? day.topics : [day.focusArea];
        for (const raw of rawTopics) {
          const canonical = normalizeSharedTopic(raw);
          if (!canonical) continue;

          const existing = byKey.get(canonical) ?? {
            label: formatSharedTopic(canonical),
            roadmapIds: new Set<string>(),
            tasks: [],
          };

          existing.roadmapIds.add(roadmap.id);
          existing.tasks.push({
            roadmapId: roadmap.id,
            roadmapName: roadmap.name,
            roadmapColor: roadmap.color,
            company: details.company,
            date: day.date,
            title: day.focusArea,
            done: roadmap.state.completed.includes(day.date),
          });
          byKey.set(canonical, existing);
        }
      }
    }

    return Array.from(byKey.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        roadmapIds: Array.from(value.roadmapIds),
        tasks: dedupeSharedTasks(value.tasks),
      }))
      .filter((item) => item.roadmapIds.length >= 2)
      .sort((a, b) => {
        if (a.roadmapIds.length !== b.roadmapIds.length) {
          return b.roadmapIds.length - a.roadmapIds.length;
        }
        return a.label.localeCompare(b.label);
      });
  }, [roadmapDetailsById, roadmaps]);

  const todaysFocus = useMemo<FocusModeData | null>(() => {
    const today = todayISO();

    const candidates = roadmaps
      .map((roadmap) => {
        const incompleteDays = roadmap.state.plan
          .filter((day) => !roadmap.state.completed.includes(day.date))
          .sort((a, b) => a.date.localeCompare(b.date));

        if (incompleteDays.length === 0) return null;

        const overdueCount = incompleteDays.filter((day) => day.date < today).length;
        const dueTodayCount = incompleteDays.filter((day) => day.date === today).length;
        const interviewDate = roadmap.state.preferences.interviewDate;
        const daysToInterview = interviewDate ? Math.max(0, daysBetween(today, interviewDate)) : null;
        const progress = calcProgress(roadmap);
        const details = roadmapDetailsById.get(roadmap.id) ?? {
          company: "Company not specified",
          role: "Role not specified",
        };

        const sharedOpportunityCount = incompleteDays.reduce((count, day) => {
          const topics = extractCanonicalTopics(day.focusArea, day.topics);
          const hasShared = topics.some((topic) => (sharedTopicRoadmapMap.get(topic)?.size ?? 0) >= 2);
          return hasShared ? count + 1 : count;
        }, 0);

        return {
          roadmap,
          incompleteDays,
          overdueCount,
          dueTodayCount,
          daysToInterview,
          progress,
          details,
          sharedOpportunityCount,
        };
      })
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => {
        if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
        if (a.dueTodayCount !== b.dueTodayCount) return b.dueTodayCount - a.dueTodayCount;
        const aDays = a.daysToInterview ?? 10_000;
        const bDays = b.daysToInterview ?? 10_000;
        if (aDays !== bDays) return aDays - bDays;
        if (a.sharedOpportunityCount !== b.sharedOpportunityCount) {
          return b.sharedOpportunityCount - a.sharedOpportunityCount;
        }
        if (a.progress !== b.progress) return a.progress - b.progress;
        return b.incompleteDays.length - a.incompleteDays.length;
      });

    const top = candidates[0];
    if (!top) return null;

    const orderedTasks = [...top.incompleteDays].sort((a, b) => {
      const aRank = a.date < today ? 0 : a.date === today ? 1 : 2;
      const bRank = b.date < today ? 0 : b.date === today ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return a.date.localeCompare(b.date);
    });

    const budget = Math.max(1, top.roadmap.state.preferences.hoursPerDay || 1);
    const recommended: FocusTask[] = [];
    let running = 0;
    for (const day of orderedTasks) {
      const topics = extractCanonicalTopics(day.focusArea, day.topics);
      const sharedRoadmapCount = Math.max(
        0,
        ...topics.map((topic) => sharedTopicRoadmapMap.get(topic)?.size ?? 0),
      );
      const hours = day.estimatedHours > 0 ? day.estimatedHours : 1;
      if (recommended.length > 0 && running >= budget) break;
      recommended.push({
        roadmapId: top.roadmap.id,
        roadmapName: top.roadmap.name,
        roadmapColor: top.roadmap.color,
        company: top.details.company,
        date: day.date,
        title: day.focusArea,
        estimatedHours: hours,
        sharedRoadmapCount,
      });
      running += hours;
      if (recommended.length >= 4) break;
    }

    const reasons: string[] = [];
    if (top.overdueCount > 0) {
      reasons.push(`${top.overdueCount} overdue ${top.overdueCount === 1 ? "task" : "tasks"}`);
    }
    if (top.dueTodayCount > 0) {
      reasons.push(`${top.dueTodayCount} due today`);
    }
    if (top.daysToInterview !== null) {
      reasons.push(`Interview in ${top.daysToInterview} days`);
    }
    reasons.push(`Roadmap is ${top.progress}% complete`);

    return {
      roadmapId: top.roadmap.id,
      roadmapName: top.roadmap.name,
      roadmapColor: top.roadmap.color,
      company: top.details.company,
      daysToInterview: top.daysToInterview,
      progress: top.progress,
      availableHoursPerDay: budget,
      reasons,
      recommended,
      totalEstimatedHours: Math.round(recommended.reduce((sum, t) => sum + t.estimatedHours, 0) * 10) / 10,
    };
  }, [roadmapDetailsById, roadmaps, sharedTopicRoadmapMap]);

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    return roadmaps
      .flatMap((roadmap) => {
        const details = roadmapDetailsById.get(roadmap.id) ?? {
          company: "Company not specified",
          role: "Role not specified",
        };
        const taskEvents: CalendarEvent[] = roadmap.state.plan.map((day) => ({
          id: `${roadmap.id}:task:${day.date}`,
          date: day.date,
          roadmapId: roadmap.id,
          roadmapName: roadmap.name,
          roadmapColor: roadmap.color,
          company: details.company,
          title: day.focusArea,
          done: roadmap.state.completed.includes(day.date),
          type: "task",
        }));

        const interviewDate = roadmap.state.preferences.interviewDate;
        const interviewEvents: CalendarEvent[] = interviewDate
          ? [
              {
                id: `${roadmap.id}:interview:${interviewDate}`,
                date: interviewDate,
                roadmapId: roadmap.id,
                roadmapName: roadmap.name,
                roadmapColor: roadmap.color,
                company: details.company,
                title: "Interview",
                done: false,
                type: "interview",
              },
            ]
          : [];

        return [...taskEvents, ...interviewEvents];
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.type !== b.type) return a.type === "interview" ? -1 : 1;
        return a.roadmapName.localeCompare(b.roadmapName);
      });
  }, [roadmapDetailsById, roadmaps]);

  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((event) => {
      if (!selectedRoadmapIds.includes(event.roadmapId)) return false;
      if (event.type === "interview" && !includeInterviews) return false;
      return true;
    });
  }, [calendarEvents, includeInterviews, selectedRoadmapIds]);

  const visibleDays = useMemo(() => {
    return calendarView === "month"
      ? monthGridDates(cursorDate)
      : weekDates(startOfWeekDate(cursorDate));
  }, [calendarView, cursorDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [filteredEvents]);

  const summaryText =
    upcomingInterviews.length > 0
      ? `You have ${upcomingInterviews.length} upcoming ${upcomingInterviews.length === 1 ? "interview" : "interviews"}`
      : "No upcoming interviews yet";

  function openRoadmap(roadmapId: string) {
    switchActiveRoadmapLocal(roadmapId);
    navigate({ to: "/prep/plan" });
  }

  function startTask(task: TodayTask) {
    switchActiveRoadmapLocal(task.roadmapId);
    navigate({ to: "/prep/plan/$date", params: { date: task.date } });
  }

  function startTodaysPrep() {
    const nextTask = prioritizedTodayTasks.find((task) => !task.done) ?? prioritizedTodayTasks[0];
    if (!nextTask) return;
    startTask(nextTask);
  }

  function openCalendarEvent(event: CalendarEvent) {
    switchActiveRoadmapLocal(event.roadmapId);
    if (event.type === "interview") {
      navigate({ to: "/prep/plan" });
      return;
    }
    navigate({ to: "/prep/plan/$date", params: { date: event.date } });
  }

  function createNewPrepRoadmap() {
    const created = createRoadmapLocal();
    switchActiveRoadmapLocal(created.id);
    setRoadmaps(listPrepRoadmapsLocal());
    navigate({ to: "/prep/jd" });
  }

  function goToToday() {
    setCursorDate(new Date(todayISO() + "T00:00:00"));
  }

  function goPrev() {
    setCursorDate((prev) =>
      calendarView === "month" ? addMonthsDate(prev, -1) : addDaysDate(prev, -7),
    );
  }

  function goNext() {
    setCursorDate((prev) =>
      calendarView === "month" ? addMonthsDate(prev, 1) : addDaysDate(prev, 7),
    );
  }

  function toggleRoadmapFilter(roadmapId: string) {
    setSelectedRoadmapIds((prev) => {
      if (prev.includes(roadmapId)) {
        const next = prev.filter((id) => id !== roadmapId);
        return next.length > 0 ? next : prev;
      }
      return [...prev, roadmapId];
    });
  }

  function showAllRoadmaps() {
    setSelectedRoadmapIds(roadmaps.map((r) => r.id));
  }

  function viewCalendar() {
    goToToday();
    document.getElementById("prep-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openAnyRoadmap() {
    const first = roadmaps[0];
    if (!first) return;
    openRoadmap(first.id);
  }

  function startFocusSession() {
    const first = todaysFocus?.recommended[0];
    if (!first) return;
    switchActiveRoadmapLocal(first.roadmapId);
    navigate({ to: "/prep/plan/$date", params: { date: first.date } });
  }

  function viewSharedPreparation(item: SharedTopicItem) {
    const today = todayISO();
    const sorted = [...item.tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aDate = a.date >= today ? a.date : `9999-${a.date}`;
      const bDate = b.date >= today ? b.date : `9999-${b.date}`;
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.roadmapName.localeCompare(b.roadmapName);
    });
    const target = sorted[0];
    if (!target) return;
    switchActiveRoadmapLocal(target.roadmapId);
    navigate({ to: "/prep/plan/$date", params: { date: target.date } });
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="surface rounded-2xl border border-border p-6">
        <p className="eyebrow">My Prep</p>
        <h1 className="display-2 mt-2">
          {userName ? `Good morning, ${userName}` : "Good morning"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{summaryText}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={createNewPrepRoadmap}>
            <Plus className="h-4 w-4" /> Create New Prep Roadmap
          </Button>
        </div>
      </header>

      <section id="prep-calendar" className="mt-6 surface rounded-2xl border border-border p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Preparation Calendar</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Multi-interview timeline for prep tasks and interview milestones
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setCalendarView("month")}
                  className={`rounded-full px-3 py-1 text-xs ${
                    calendarView === "month"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground"
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView("week")}
                  className={`rounded-full px-3 py-1 text-xs ${
                    calendarView === "week"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground"
                  }`}
                >
                  Week
                </button>
              </div>

              <Button size="sm" variant="ghost" onClick={goToToday}>
                Today
              </Button>
              <Button size="icon" variant="ghost" onClick={goPrev} aria-label="Previous">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={goNext} aria-label="Next">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{calendarLabel(cursorDate, calendarView)}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <button
              type="button"
              onClick={() => setIncludeInterviews((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                includeInterviews
                  ? "border-terminal/40 bg-terminal/10 text-terminal"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Calendar className="h-3 w-3" /> All Interviews
            </button>

            <button
              type="button"
              onClick={showAllRoadmaps}
              className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              All roadmaps
            </button>

            {roadmaps.map((roadmap) => {
              const color = colorClasses(roadmap.color);
              const selected = selectedRoadmapIds.includes(roadmap.id);
              return (
                <button
                  key={roadmap.id}
                  type="button"
                  onClick={() => toggleRoadmapFilter(roadmap.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    selected
                      ? `${color.border} ${color.bg} ${color.text}`
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${selected ? "bg-current" : "bg-muted-foreground"}`} />
                  {roadmap.name}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-7 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="rounded-md bg-accent/30 px-2 py-1 text-center font-semibold">
                    {day}
                  </div>
                ))}
              </div>

              <div className={`mt-2 grid grid-cols-7 gap-2 ${calendarView === "month" ? "" : ""}`}>
                {visibleDays.map((dateIso) => {
                  const cellEvents = eventsByDate.get(dateIso) ?? [];
                  const isToday = dateIso === todayISO();
                  const inMonth =
                    calendarView === "month"
                      ? isSameMonthIso(dateIso, cursorDate)
                      : true;
                  const maxVisible = calendarView === "month" ? 3 : 5;
                  const visible = cellEvents.slice(0, maxVisible);
                  const hiddenCount = Math.max(0, cellEvents.length - maxVisible);

                  return (
                    <div
                      key={dateIso}
                      className={`rounded-lg border p-2 ${
                        isToday ? "border-foreground" : "border-border"
                      } ${inMonth ? "bg-background" : "bg-accent/20"} ${
                        calendarView === "month" ? "min-h-[130px]" : "min-h-[170px]"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`font-mono text-[11px] ${
                            inMonth ? "text-muted-foreground" : "text-muted-foreground/60"
                          }`}
                        >
                          {dayNum(dateIso)}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold text-background">
                            today
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {visible.map((event) => {
                          const color = colorClasses(event.roadmapColor);
                          const contextLabel = event.company !== "Company not specified" ? event.company : event.roadmapName;
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => openCalendarEvent(event)}
                              className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight transition-colors hover:border-foreground/40 ${
                                event.type === "interview"
                                  ? `${color.border} ${color.bg} ${color.text} ring-1 ring-inset ring-current/25`
                                  : event.done
                                    ? `${color.border} ${color.bg} ${color.text} opacity-75`
                                    : `${color.border} ${color.bg} ${color.text}`
                              }`}
                              title={`${event.title} · ${event.roadmapName}`}
                            >
                              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
                              <span className="align-middle">
                                {event.type === "interview" ? "Interview" : event.title}
                              </span>
                              {event.done && event.type === "task" && (
                                <CheckCircle2 className="ml-1 inline h-3 w-3 align-middle" />
                              )}
                              <span className="ml-1 hidden align-middle text-[9px] opacity-80 sm:inline">
                                · {contextLabel}
                              </span>
                            </button>
                          );
                        })}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCursorDate(new Date(dateIso + "T00:00:00"));
                              setCalendarView("week");
                            }}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 surface rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Today's Focus</h2>
            <p className="mt-1 text-sm text-muted-foreground">What should you prioritize right now?</p>
          </div>
          <Button onClick={startFocusSession} disabled={!todaysFocus || todaysFocus.recommended.length === 0}>
            <Play className="h-4 w-4" /> Start Focus Session
          </Button>
        </div>

        {!todaysFocus ? (
          <div className="mt-4 rounded-xl border border-border bg-accent/30 p-4 text-sm text-muted-foreground">
            No active focus candidates yet. Generate a prep roadmap to get deterministic focus recommendations.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${colorClasses(todaysFocus.roadmapColor).border} ${colorClasses(todaysFocus.roadmapColor).bg} ${colorClasses(todaysFocus.roadmapColor).text}`}>
                  <span className="h-2 w-2 rounded-full bg-current" /> {todaysFocus.roadmapName}
                </span>
                <span className="text-sm font-medium">
                  {todaysFocus.company}
                  {todaysFocus.daysToInterview !== null ? ` - Interview in ${todaysFocus.daysToInterview} days` : ""}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {todaysFocus.reasons.map((reason) => (
                  <span key={reason} className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                    {reason}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Recommended now</p>
                <p className="text-xs text-muted-foreground">
                  ~{formatHours(todaysFocus.totalEstimatedHours)}h total · {formatHours(todaysFocus.availableHoursPerDay)}h daily budget
                </p>
              </div>

              <ol className="mt-3 space-y-2">
                {todaysFocus.recommended.map((task) => (
                  <li key={`${task.roadmapId}-${task.date}-${task.title}`}>
                    <button
                      type="button"
                      onClick={() => {
                        switchActiveRoadmapLocal(task.roadmapId);
                        navigate({ to: "/prep/plan/$date", params: { date: task.date } });
                      }}
                      className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{task.title}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="h-3 w-3" /> {formatDurationShort(task.estimatedHours)}
                        </span>
                        {task.sharedRoadmapCount >= 2 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-terminal/40 bg-terminal/10 px-2 py-0.5 text-[10px] text-terminal">
                            <Layers className="h-3 w-3" /> shared across {task.sharedRoadmapCount} interviews
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{formatDate(task.date)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ol>

              {(() => {
                const bestShared = [...todaysFocus.recommended]
                  .filter((t) => t.sharedRoadmapCount >= 2)
                  .sort((a, b) => b.sharedRoadmapCount - a.sharedRoadmapCount)[0];
                if (!bestShared) return null;
                return (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Shared opportunity: {bestShared.title} also appears in {bestShared.sharedRoadmapCount - 1}{" "}
                    other {bestShared.sharedRoadmapCount - 1 === 1 ? "interview" : "interviews"}.
                  </p>
                );
              })()}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 surface rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Shared Preparation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepare once. Use it across multiple interviews.
            </p>
          </div>
        </div>

        {sharedPreparation.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-accent/30 p-4 text-sm text-muted-foreground">
            No overlapping preparation topics detected yet across active roadmaps.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sharedPreparation.map((item) => {
              const relatedRoadmaps = item.roadmapIds
                .map((id) => roadmaps.find((r) => r.id === id))
                .filter((r): r is PrepRoadmap => !!r);

              return (
                <article key={item.key} className="rounded-xl border border-border bg-background/50 p-4">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used in {item.roadmapIds.length} {item.roadmapIds.length === 1 ? "interview" : "interviews"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {relatedRoadmaps.map((roadmap) => {
                      const color = colorClasses(roadmap.color);
                      const details = roadmapDetailsById.get(roadmap.id);
                      return (
                        <span
                          key={roadmap.id}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${color.border} ${color.bg} ${color.text}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {details?.company && details.company !== "Company not specified"
                            ? details.company
                            : roadmap.name}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => viewSharedPreparation(item)}>
                      View Preparation <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Upcoming Interviews</h2>
          <span className="text-xs text-muted-foreground">Sorted by date</span>
        </div>

        {upcomingInterviews.length === 0 ? (
          <div className="surface rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            Add an interview date in a roadmap to track your countdown and upcoming schedule.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcomingInterviews.map(({ roadmap, interviewDate }) => {
              const color = colorClasses(roadmap.color);
              const details = roadmapDetailsById.get(roadmap.id) ?? {
                company: "Company not specified",
                role: "Role not specified",
              };
              const daysRemaining = Math.max(0, daysBetween(todayISO(), interviewDate));
              const progress = calcProgress(roadmap);
              return (
                <button
                  key={roadmap.id}
                  type="button"
                  onClick={() => openRoadmap(roadmap.id)}
                  className="surface rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${color.border} ${color.bg} ${color.text}`}>
                      <span className="h-2 w-2 rounded-full bg-current" /> {roadmap.name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {formatDate(interviewDate)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-semibold">{details.company}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{details.role}</p>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{daysRemaining} days remaining</span>
                    <span>{progress}% complete</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">My Prep Roadmaps</h2>
          <Button size="sm" variant="secondary" onClick={createNewPrepRoadmap}>
            <Plus className="h-3.5 w-3.5" /> New roadmap
          </Button>
        </div>

        {roadmaps.length === 0 ? (
          <div className="surface rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            No roadmaps yet. Create your first prep roadmap to get started.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {roadmaps.map((roadmap) => {
              const color = colorClasses(roadmap.color);
              const details = roadmapDetailsById.get(roadmap.id) ?? {
                company: "Company not specified",
                role: "Role not specified",
              };
              const progress = calcProgress(roadmap);
              const interviewDate = roadmap.state.preferences.interviewDate;
              return (
                <article key={roadmap.id} className="surface rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${color.border} ${color.bg} ${color.text}`}>
                      <span className="h-2 w-2 rounded-full bg-current" /> {roadmap.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{progress}%</span>
                  </div>

                  <p className="mt-3 text-sm font-semibold">{details.company}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{details.role}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {interviewDate ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(interviewDate)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Target className="h-3 w-3" /> Interview date not set
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <Button size="sm" variant="ghost" onClick={() => openRoadmap(roadmap.id)}>
                      Open roadmap <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function calcProgress(roadmap: PrepRoadmap): number {
  const total = roadmap.state.plan.length;
  if (!total) return 0;
  return Math.round((roadmap.state.completed.length / total) * 100);
}

function getRoadmapDetails(roadmap: PrepRoadmap): { company: string; role: string } {
  const jd = roadmap.state.jobDescription?.trim() ?? "";
  const lines = jd
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  const explicitCompany =
    lines.find((line) => /^company\s*[:\-]/i.test(line))?.replace(/^company\s*[:\-]\s*/i, "") ??
    null;
  const firstWithAt = lines.find((line) => /\sat\s/i.test(line)) ?? null;

  const companyFromAt = firstWithAt
    ? firstWithAt.split(/\sat\s/i)[1]?.split(/[,.|]/)[0]?.trim() ?? null
    : null;

  const company = explicitCompany || companyFromAt || "Company not specified";

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

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDurationShort(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 min";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (Number.isInteger(hours)) return `${hours}h`;
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
}

function normalizeSharedKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSharedTopic(raw: string): string | null {
  const base = normalizeSharedKey(raw);
  if (!base || base.length < 3) return null;

  if (/\bapi\b.*\btest\b|\bapi\s*test(ing)?\b/.test(base)) return "api testing";
  if (/\bbehavioral?\b|\bstar\b|\bbehavior\s*question/.test(base)) return "behavioral interviews";
  if (/\bsql\b|\bdatabase query\b/.test(base)) return "sql";
  if (/\bautomation\b|\btest automation\b/.test(base)) return "automation";
  if (/\bselenium\b/.test(base)) return "selenium";
  if (/\bplaywright\b/.test(base)) return "playwright";
  if (/\bjava(script)?\b/.test(base)) return base.includes("script") ? "javascript" : "java";

  if (base.includes("preparation") || base.includes("review") || base.includes("foundation")) {
    return null;
  }

  return base;
}

function extractCanonicalTopics(focusArea: string, topics: string[]): string[] {
  const pool = topics.length > 0 ? topics : [focusArea];
  const canonical = pool.map(normalizeSharedTopic).filter((t): t is string => !!t);
  return Array.from(new Set(canonical));
}

function formatSharedTopic(canonical: string): string {
  const overrides: Record<string, string> = {
    "api testing": "API Testing",
    "behavioral interviews": "Behavioral Interviews",
    sql: "SQL",
    automation: "Automation",
    selenium: "Selenium",
    playwright: "Playwright",
    javascript: "JavaScript",
    java: "Java",
  };
  if (overrides[canonical]) return overrides[canonical];
  return canonical
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function dedupeSharedTasks(tasks: SharedTopicTask[]): SharedTopicTask[] {
  const seen = new Set<string>();
  const result: SharedTopicTask[] = [];
  for (const task of tasks) {
    const key = `${task.roadmapId}:${task.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(task);
  }
  return result;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayNum(iso: string): string {
  return iso.slice(8);
}

function addDaysDate(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsDate(d: Date, months: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfWeekDate(d: Date): Date {
  const next = new Date(d);
  next.setDate(next.getDate() - next.getDay());
  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
}

function endOfWeekDate(d: Date): Date {
  return addDaysDate(startOfWeekDate(d), 6);
}

function monthGridDates(anchor: Date): string[] {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = startOfWeekDate(monthStart);
  const end = endOfWeekDate(monthEnd);

  const days: string[] = [];
  for (let d = new Date(start); d <= end; d = addDaysDate(d, 1)) {
    days.push(toISO(d));
  }
  return days;
}

function weekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toISO(addDaysDate(weekStart, i)));
}

function isSameMonthIso(iso: string, anchor: Date): boolean {
  const d = new Date(iso + "T00:00:00");
  return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
}

function calendarLabel(anchor: Date, view: CalendarView): string {
  if (view === "month") {
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const start = startOfWeekDate(anchor);
  const end = endOfWeekDate(anchor);
  const left = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${left} - ${right}`;
}
