// Shared prep types + localStorage helpers.
// Signed-in users mirror to Supabase via prep.functions.ts.

export type ResumeAnalysis = {
  yearsExperience: number;
  skills: string[];
  weakAreas: string[];
  summary: string;
};

export type JdAnalysis = {
  technicalSkills: string[];
  softSkills: string[];
  toolsAndTechnologies: string[];
  industryKnowledge: string[];
  certifications: string[];
  keywordsAndCompetencies: string[];
  likelyQuestions: string[];
  matchScore: number | null; // null when no resume provided
  summary: string;
};

export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

export type InterviewType =
  | "general"
  | "behavioral"
  | "technical"
  | "case"
  | "panel"
  | "take-home";

export type RoadmapColor = "terminal" | "amber" | "sky" | "rose" | "emerald" | "indigo";

export type Preferences = {
  interviewDate: string | null; // ISO date
  daysUntil: number | null; // alternative to date
  hoursPerDay: number; // 1-12
  experienceLevel: ExperienceLevel;
  interviewType: InterviewType;
};

export type PlanDay = {
  date: string; // ISO date
  focusArea: string; // e.g. "Technical skills", "Behavioral", "Company research"
  topics: string[];
  activities: string[]; // concrete tasks
  estimatedHours: number;
  questions?: string[]; // interview-style questions to practice this day
};

export type TaskAnswer = {
  question: string;
  answer: string;
  score: number; // 0-10
  feedback: string;
  weakAreas: string[];
  followUpQuestions: string[];
  answeredAt: string; // ISO datetime
  exampleAnswer?: string | null; //example answer demonstrating a strong response to the question
};

export type PrepState = {
  resumeText: string;
  resumeAnalysis: ResumeAnalysis | null;
  jobDescription: string;
  jdAnalysis: JdAnalysis | null;
  preferences: Preferences;
  plan: PlanDay[];
  completed: string[]; // ISO dates marked done
  answers: Record<string, TaskAnswer[]>; // keyed by day ISO date
};

export type PrepRoadmap = {
  id: string;
  name: string;
  color: RoadmapColor;
  state: PrepState;
  createdAt: string;
  updatedAt: string;
};

export type PrepWorkspace = {
  activeRoadmapId: string;
  roadmaps: PrepRoadmap[];
};

export const EMPTY_PREP: PrepState = {
  resumeText: "",
  resumeAnalysis: null,
  jobDescription: "",
  jdAnalysis: null,
  preferences: {
    interviewDate: null,
    daysUntil: null,
    hoursPerDay: 2,
    experienceLevel: "intermediate",
    interviewType: "general",
  },
  plan: [],
  completed: [],
  answers: {},
};

const LEGACY_KEY = "ai.prep.v2";
const WORKSPACE_KEY = "ai.prep.workspace.v1";
const DRAFT_KEY = "ai.prep.new-roadmap.draft.v1";
const COLOR_ROTATION: RoadmapColor[] = ["terminal", "amber", "sky", "rose", "emerald", "indigo"];

function cloneEmptyPrep(): PrepState {
  return JSON.parse(JSON.stringify(EMPTY_PREP)) as PrepState;
}

function normalizePrep(input: unknown): PrepState {
  if (!input || typeof input !== "object") return cloneEmptyPrep();
  const parsed = input as Partial<PrepState> & { preferences?: Partial<Preferences> };
  return {
    ...cloneEmptyPrep(),
    ...parsed,
    preferences: {
      ...cloneEmptyPrep().preferences,
      ...(parsed.preferences ?? {}),
    },
    completed: Array.isArray(parsed.completed)
      ? parsed.completed.filter((d): d is string => typeof d === "string")
      : [],
    answers: parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {},
  };
}

function roadmapNameFromState(state: PrepState, fallbackIndex = 1): string {
  if (state.preferences.interviewDate) return `Interview ${state.preferences.interviewDate}`;
  return `Roadmap ${fallbackIndex}`;
}

function normalizeWorkspace(input: unknown): PrepWorkspace | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Partial<PrepWorkspace>;
  if (!Array.isArray(data.roadmaps) || data.roadmaps.length === 0) return null;

  const roadmaps = data.roadmaps
    .map((r, idx) => {
      const raw = r as Partial<PrepRoadmap>;
      const id = typeof raw.id === "string" && raw.id ? raw.id : `roadmap-${idx + 1}`;
      const color = COLOR_ROTATION.includes(raw.color as RoadmapColor)
        ? (raw.color as RoadmapColor)
        : COLOR_ROTATION[idx % COLOR_ROTATION.length];
      const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
      const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
      const state = normalizePrep(raw.state);
      return {
        id,
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : roadmapNameFromState(state, idx + 1),
        color,
        state,
        createdAt,
        updatedAt,
      } satisfies PrepRoadmap;
    })
    .filter(Boolean);

  if (!roadmaps.length) return null;
  const activeRoadmapId =
    typeof data.activeRoadmapId === "string" && roadmaps.some((r) => r.id === data.activeRoadmapId)
      ? data.activeRoadmapId
      : roadmaps[0].id;

  return { activeRoadmapId, roadmaps };
}

function buildDefaultWorkspace(): PrepWorkspace {
  const now = new Date().toISOString();
  return {
    activeRoadmapId: "roadmap-1",
    roadmaps: [
      {
        id: "roadmap-1",
        name: "Roadmap 1",
        color: COLOR_ROTATION[0],
        state: cloneEmptyPrep(),
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function ensureWorkspace(): PrepWorkspace {
  const ws = loadPrepWorkspaceLocal();
  if (ws.roadmaps.length > 0) return ws;
  const fallback = buildDefaultWorkspace();
  savePrepWorkspaceLocal(fallback);
  return fallback;
}

function nextColor(existingCount: number): RoadmapColor {
  return COLOR_ROTATION[existingCount % COLOR_ROTATION.length];
}

function nextRoadmapId(roadmaps: PrepRoadmap[]): string {
  let i = roadmaps.length + 1;
  let id = `roadmap-${i}`;
  const ids = new Set(roadmaps.map((r) => r.id));
  while (ids.has(id)) {
    i += 1;
    id = `roadmap-${i}`;
  }
  return id;
}

function migrateLegacyWorkspace(): PrepWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const state = normalizePrep(JSON.parse(raw));
    const now = new Date().toISOString();
    return {
      activeRoadmapId: "roadmap-1",
      roadmaps: [
        {
          id: "roadmap-1",
          name: roadmapNameFromState(state, 1),
          color: COLOR_ROTATION[0],
          state,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  } catch {
    return null;
  }
}

export function loadPrepWorkspaceLocal(): PrepWorkspace {
  if (typeof window === "undefined") return buildDefaultWorkspace();
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const parsed = normalizeWorkspace(JSON.parse(raw));
      if (parsed) return parsed;
    }
    const migrated = migrateLegacyWorkspace();
    if (migrated) {
      savePrepWorkspaceLocal(migrated);
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
    const fallback = buildDefaultWorkspace();
    savePrepWorkspaceLocal(fallback);
    return fallback;
  } catch {
    return buildDefaultWorkspace();
  }
}

export function savePrepWorkspaceLocal(workspace: PrepWorkspace) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  } catch {
    /* ignore */
  }
}

export function getActiveRoadmapLocal(): PrepRoadmap {
  const ws = ensureWorkspace();
  return ws.roadmaps.find((r) => r.id === ws.activeRoadmapId) ?? ws.roadmaps[0];
}

export function listPrepRoadmapsLocal(): PrepRoadmap[] {
  return ensureWorkspace().roadmaps;
}

export function switchActiveRoadmapLocal(roadmapId: string): PrepRoadmap | null {
  const ws = ensureWorkspace();
  if (!ws.roadmaps.some((r) => r.id === roadmapId)) return null;
  const next = { ...ws, activeRoadmapId: roadmapId };
  savePrepWorkspaceLocal(next);
  return next.roadmaps.find((r) => r.id === roadmapId) ?? null;
}

export function createRoadmapLocal(opts?: {
  name?: string;
  sourceState?: PrepState;
  color?: RoadmapColor;
}): PrepRoadmap {
  const ws = ensureWorkspace();
  const now = new Date().toISOString();
  const id = nextRoadmapId(ws.roadmaps);
  const state = normalizePrep(opts?.sourceState ?? cloneEmptyPrep());
  const roadmap: PrepRoadmap = {
    id,
    name: opts?.name?.trim() || roadmapNameFromState(state, ws.roadmaps.length + 1),
    color: opts?.color ?? nextColor(ws.roadmaps.length),
    state,
    createdAt: now,
    updatedAt: now,
  };
  const next: PrepWorkspace = {
    activeRoadmapId: roadmap.id,
    roadmaps: [...ws.roadmaps, roadmap],
  };
  savePrepWorkspaceLocal(next);
  return roadmap;
}

export function renameRoadmapLocal(roadmapId: string, name: string): PrepRoadmap | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const ws = ensureWorkspace();
  let updated: PrepRoadmap | null = null;
  const next: PrepWorkspace = {
    ...ws,
    roadmaps: ws.roadmaps.map((r) => {
      if (r.id !== roadmapId) return r;
      updated = { ...r, name: trimmed, updatedAt: new Date().toISOString() };
      return updated;
    }),
  };
  savePrepWorkspaceLocal(next);
  return updated;
}

export function deleteRoadmapLocal(roadmapId: string): PrepRoadmap {
  const ws = ensureWorkspace();
  const filtered = ws.roadmaps.filter((r) => r.id !== roadmapId);
  if (filtered.length === 0) {
    const created = createRoadmapLocal();
    return created;
  }
  const activeRoadmapId = ws.activeRoadmapId === roadmapId ? filtered[0].id : ws.activeRoadmapId;
  const next: PrepWorkspace = { activeRoadmapId, roadmaps: filtered };
  savePrepWorkspaceLocal(next);
  return filtered.find((r) => r.id === activeRoadmapId) ?? filtered[0];
}

export function loadPrepLocal(): PrepState {
  return getActiveRoadmapLocal().state;
}

export function savePrepLocal(state: PrepState) {
  const ws = ensureWorkspace();
  const normalizedState = normalizePrep(state);
  const now = new Date().toISOString();
  const next: PrepWorkspace = {
    ...ws,
    roadmaps: ws.roadmaps.map((r) =>
      r.id === ws.activeRoadmapId ? { ...r, state: normalizedState, updatedAt: now } : r,
    ),
  };
  savePrepWorkspaceLocal(next);
}

export function clearPrepLocal() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WORKSPACE_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

export function loadPrepDraftLocal(): PrepState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return normalizePrep(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePrepDraftLocal(state: PrepState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(normalizePrep(state)));
  } catch {
    /* ignore */
  }
}

export function clearPrepDraftLocal() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00").getTime();
  const b = new Date(toISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function resolveDaysUntil(prefs: Preferences): number | null {
  if (prefs.daysUntil && prefs.daysUntil >= 1) return Math.min(60, Math.floor(prefs.daysUntil));
  if (prefs.interviewDate) {
    const d = daysBetween(todayISO(), prefs.interviewDate);
    if (d >= 1) return Math.min(60, d);
  }
  return null;
}
