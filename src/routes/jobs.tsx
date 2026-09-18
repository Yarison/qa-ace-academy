import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { searchJobs, type JobSearchResult } from "@/lib/jobs.functions";
import { analyzeResume, generateResume, loadPrep, savePrep } from "@/lib/prep.functions";
import {
  EMPTY_PREP,
  getActiveRoadmapLocal,
  loadPrepLocal,
  savePrepLocal,
  type PrepRoadmap,
  type PrepState,
} from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const TITLE_HINTS = [
  "QA Engineer",
  "QA Automation Engineer",
  "Software QA Engineer",
  "SDET",
  "Senior QA Engineer",
  "Test Automation Engineer",
  "Automation Engineer",
  "Quality Engineer",
  "QA Analyst",
  "Test Engineer",
];

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs — AI Interview Coach" },
      {
        name: "description",
        content: "Search real jobs and generate a tailored resume from a posting.",
      },
    ],
  }),
  component: JobsPage,
});

function formatSalary(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const lower = min == null ? "" : `$${Math.round(min).toLocaleString()}`;
  const upper = max == null ? "" : `$${Math.round(max).toLocaleString()}`;
  if (!lower && upper) return `Up to ${upper}`;
  if (lower && !upper) return `From ${lower}`;
  if (lower === upper) return lower;
  return `${lower}–${upper}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "Recently";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Recently";
  }
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSkillText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—]\s*/g, " ")
    .trim();
}

function buildSkillChips(text: string | null | undefined): string[] {
  if (!text) return [];
  const pieces = text
    .split(/[\n,;|/]/)
    .map((part) => normalizeSkillText(part))
    .filter(Boolean);
  return [...new Set(pieces)].slice(0, 12);
}

function getActiveFilterChips(filters: {
  remote: string;
  dateRange: string;
  jobType: string;
  salaryMin: number | null;
}) {
  const chips: string[] = [];
  if (filters.remote !== "any") chips.push(toTitleCase(filters.remote.replace("_", " ")));
  if (filters.dateRange !== "any") chips.push(`Last ${filters.dateRange} days`);
  if (filters.jobType !== "any") chips.push(toTitleCase(filters.jobType.replace("_", " ")));
  if (filters.salaryMin != null && Number.isFinite(filters.salaryMin)) chips.push(`$${Math.round(filters.salaryMin).toLocaleString()}+`);
  return chips;
}

export function JobsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [activeRoadmap, setActiveRoadmap] = useState<PrepRoadmap | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [query, setQuery] = useState({ what: "", where: "", country: "us" });
  const [filters, setFilters] = useState({
    remote: "any",
    dateRange: "any",
    jobType: "any",
    salaryMin: null as number | null,
    sortBy: "relevance" as "relevance" | "date" | "salary",
  });
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumePdfBase64, setResumePdfBase64] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [searchMode, setSearchMode] = useState<"title" | "resume" | "skills">("title");
  const [resumeProfile, setResumeProfile] = useState({ skills: [] as string[], roleFamilies: [] as string[] });
  const [skillInputs, setSkillInputs] = useState({ skills: "", interests: "" });
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const suggestionTimerRef = useRef<number | null>(null);
  const suggestionInputRef = useRef<HTMLInputElement | null>(null);

  const activeChips = useMemo(() => getActiveFilterChips(filters), [filters]);

  useEffect(() => {
    const active = getActiveRoadmapLocal();
    setActiveRoadmap(active);
    const local = active.state ?? loadPrepLocal();
    setState(local);
    if (local.resumeText?.trim()) {
      setIsProfileLoaded(true);
      setResumeProfile({
        skills: (local.resumeAnalysis?.skills ?? []).slice(0, 8),
        roleFamilies: ["QA Engineer", "Automation Engineer"],
      });
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSignedIn(!!data.session);
      if (data.session) {
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
          }
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  useEffect(() => {
    const raw = query.what.trim();
    if (raw.length < 2) {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      return;
    }

    if (suggestionTimerRef.current) window.clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = window.setTimeout(async () => {
      try {
        const jobs = await searchJobs({
          data: {
            what: raw,
            where: query.where,
            country: query.country,
            remote: "any",
            dateRange: "any",
            jobType: "any",
            sortBy: "relevance",
            page: 1,
            perPage: 8,
          },
        });
        const nextSuggestions = [...new Set(jobs.map((job) => job.title).filter(Boolean).slice(0, 8))];
        setSuggestions(nextSuggestions.length ? nextSuggestions : TITLE_HINTS.filter((title) => title.toLowerCase().includes(raw.toLowerCase())));
      } catch {
        setSuggestions(TITLE_HINTS.filter((title) => title.toLowerCase().includes(raw.toLowerCase())));
      }
    }, 250);

    return () => {
      if (suggestionTimerRef.current) window.clearTimeout(suggestionTimerRef.current);
    };
  }, [query.what, query.where, query.country]);

  async function persist(next: PrepState) {
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

  function addSuggestion(title: string) {
    setQuery((prev) => ({ ...prev, what: title }));
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && activeSuggestionIndex >= 0) {
      e.preventDefault();
      addSuggestion(suggestions[activeSuggestionIndex]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
    }
  }

  async function onSearch(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    const trimmed = query.what.trim();
    if (!trimmed && searchMode === "title") {
      toast.error("Enter a job title or keyword");
      return;
    }

    const searchQuery =
      searchMode === "resume"
        ? [...resumeProfile.skills, ...resumeProfile.roleFamilies].join(" ")
        : searchMode === "skills"
          ? `${skillInputs.skills} ${skillInputs.interests}`.trim()
          : trimmed;

    if (!searchQuery) {
      toast.error("Add a few relevant skills or a job title before searching.");
      return;
    }

    setSearching(true);
    try {
      const jobs = await searchJobs({
        data: {
          what: searchQuery,
          where: query.where,
          country: query.country,
          remote: filters.remote,
          dateRange: filters.dateRange,
          jobType: filters.jobType,
          salaryMin: filters.salaryMin,
          sortBy: filters.sortBy,
          page: 1,
          perPage: 25,
        },
      });
      setResults(jobs);
      if (!jobs.length) {
        toast.info("No jobs matched that search. Try a broader title or a larger city.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function useJob(job: JobSearchResult) {
    const description = job.description.trim();
    const next: PrepState = {
      ...state,
      jobDescription: description || `Role: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}`,
    };
    await persist(next);
    const shouldStartFresh =
      !state.resumeText &&
      !state.resumeAnalysis &&
      !state.jobDescription &&
      !state.jdAnalysis &&
      !state.plan.length &&
      !state.completed.length;
    navigate({ to: "/prep/jd", search: shouldStartFresh ? { new: "1" } : undefined });
  }

  async function onResumeFile(file: File) {
    if (file.size > 4_500_000) {
      toast.error("File must be under 4.5 MB");
      return;
    }
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const b64 = await fileToBase64(file);
      setResumePdfBase64(b64);
      setResumeFileName(file.name);
      const next: PrepState = { ...state, resumeText: "" };
      setState(next);
      await persist(next);
      toast.success(`${file.name} attached. Upload a resume and run the search profile builder.`);
    } else if (
      file.type.startsWith("text/") ||
      file.name.toLowerCase().endsWith(".txt") ||
      file.name.toLowerCase().endsWith(".md")
    ) {
      const text = await file.text();
      const next: PrepState = { ...state, resumeText: text };
      setState(next);
      await persist(next);
      setResumeFileName(file.name);
      setResumePdfBase64(null);
    } else {
      toast.error("Unsupported file. Upload a PDF or paste text.");
    }
  }

  async function useResumeProfile() {
    const text = state.resumeText.trim();
    if (!text && !resumePdfBase64) {
      toast.error("Paste or upload a resume before searching with your resume.");
      return;
    }
    try {
      const resumeAnalysis = state.resumeAnalysis ?? (await analyzeResume({ data: { text: text || "" } })).analysis;
      const skillList = (resumeAnalysis?.skills ?? []).slice(0, 10);
      const profile = {
        skills: skillList,
        roleFamilies: skillList.some((skill) => /qa|test|automation|selenium|playwright/i.test(skill))
          ? ["QA Engineer", "Automation Engineer", "SDET"]
          : ["Engineer", "Software Engineer"],
      };
      setResumeProfile(profile);
      setIsProfileLoaded(true);
      setSearchMode("resume");
      setState((prev) => ({ ...prev, resumeAnalysis: resumeAnalysis ?? prev.resumeAnalysis }));
      toast.success("Resume search profile ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build a resume profile");
    }
  }

  async function generateResumeForJob(job: JobSearchResult) {
    if (!state.resumeText.trim() && !resumePdfBase64) {
      setResumeError("Paste or upload your resume before generating a tailored version.");
      toast.error("Paste or upload your resume before generating a tailored version.");
      return;
    }

    setGenerating(true);
    setResumeError(null);
    try {
      const result = await generateResume({
        data: {
          jobDescription: job.fullDescription || job.description || `${job.title}\n${job.company}\n${job.location}`,
          resumeText: state.resumeText || "",
          resumeAnalysis: state.resumeAnalysis,
        },
      });

      const next: PrepState = {
        ...state,
        generatedResume: {
          summary: result.summary ?? "",
          experience: result.experience ?? [],
          skills: result.skills ?? [],
          education: result.education ?? [],
        },
      };
      await persist(next);
      toast.success("Tailored resume generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resume generation failed";
      setResumeError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  const generatedResume = state.generatedResume;

  function updateGeneratedField<K extends keyof NonNullable<typeof generatedResume>>(
    key: K,
    value: NonNullable<typeof generatedResume>[K],
  ) {
    if (!state.generatedResume) return;
    const next: PrepState = {
      ...state,
      generatedResume: { ...state.generatedResume, [key]: value },
    };
    void persist(next);
  }

  return (
    <div>
      <header>
        <p className="eyebrow">Jobs</p>
        <h1 className="display-2 mt-2">Find a role that fits you.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Search live postings, refine with filters, and tailor your resume to the roles that match your background.
        </p>
      </header>

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setSearchMode("title")}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${
              searchMode === "title" ? "border-terminal bg-terminal/10 text-terminal" : "border-border bg-background text-muted-foreground"
            }`}
          >
            Job title
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("resume")}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${
              searchMode === "resume" ? "border-terminal bg-terminal/10 text-terminal" : "border-border bg-background text-muted-foreground"
            }`}
          >
            Search based on my resume
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("skills")}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${
              searchMode === "skills" ? "border-terminal bg-terminal/10 text-terminal" : "border-border bg-background text-muted-foreground"
            }`}
          >
            Search by skills & interests
          </button>
        </div>

        <form onSubmit={onSearch} className="space-y-4">
          {searchMode === "title" && (
            <div className="relative grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div>
                <label className="block text-sm font-medium">Job title</label>
                <input
                  ref={suggestionInputRef}
                  value={query.what}
                  onChange={(e) => setQuery((prev) => ({ ...prev, what: e.target.value }))}
                  onKeyDown={handleInputKeyDown}
                  onBlur={() => {
                    window.setTimeout(() => setSuggestions([]), 120);
                  }}
                  placeholder="QA Engineer, software engineer, product manager…"
                  className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full max-w-xl rounded-lg border border-border bg-background shadow-lg">
                    {suggestions.map((title, idx) => (
                      <button
                        key={`${title}-${idx}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addSuggestion(title);
                        }}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                          activeSuggestionIndex === idx ? "bg-accent" : ""
                        }`}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium">Location</label>
                <input
                  value={query.where}
                  onChange={(e) => setQuery((prev) => ({ ...prev, where: e.target.value }))}
                  placeholder="San Francisco, Austin, remote"
                  className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                />
              </div>
            </div>
          )}

          {searchMode === "resume" && (
            <div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Resume search profile</p>
                  <p className="text-xs text-muted-foreground">Searching based on your resume</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={useResumeProfile}>
                  Build profile
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {resumeProfile.skills.length ? (
                  resumeProfile.skills.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => setResumeProfile((prev) => ({ ...prev, skills: prev.skills.filter((item) => item !== skill) }))}
                      className="rounded-full border border-terminal/40 bg-terminal/10 px-2 py-1 text-xs text-terminal"
                    >
                      {skill} ×
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No extracted skills yet.</span>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Role titles / families</label>
                  <input
                    value={resumeProfile.roleFamilies.join(", ")}
                    onChange={(e) => setResumeProfile((prev) => ({ ...prev, roleFamilies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                    className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Resume source</label>
                  <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
                    <Upload className="h-4 w-4 text-terminal" />
                    {state.resumeText ? "Resume text available" : resumePdfBase64 ? "PDF uploaded" : "No resume loaded"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {searchMode === "skills" && (
            <div className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Skills I have</label>
                  <input
                    value={skillInputs.skills}
                    onChange={(e) => setSkillInputs((prev) => ({ ...prev, skills: e.target.value }))}
                    placeholder="Java, Selenium, SQL, Azure"
                    className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">What I want to work with</label>
                  <input
                    value={skillInputs.interests}
                    onChange={(e) => setSkillInputs((prev) => ({ ...prev, interests: e.target.value }))}
                    placeholder="QA automation, APIs, cloud, CI/CD"
                    className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Country</span>
              </div>
              <select
                value={query.country}
                onChange={(e) => setQuery((prev) => ({ ...prev, country: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-terminal/60"
              >
                <option value="us">United States</option>
                <option value="gb">United Kingdom</option>
                <option value="ca">Canada</option>
                <option value="au">Australia</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
              >
                Filters <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
              <Button type="submit" disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {searching ? "Searching…" : "Search jobs"}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-muted-foreground">Remote</span>
                  <select
                    value={filters.remote}
                    onChange={(e) => setFilters((prev) => ({ ...prev, remote: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="any">Any</option>
                    <option value="remote">Remote</option>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-2 block font-medium text-muted-foreground">Date posted</span>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters((prev) => ({ ...prev, dateRange: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="any">Any time</option>
                    <option value="1">Last 24 hours</option>
                    <option value="3">Last 3 days</option>
                    <option value="7">Last 7 days</option>
                    <option value="14">Last 14 days</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-2 block font-medium text-muted-foreground">Job type</span>
                  <select
                    value={filters.jobType}
                    onChange={(e) => setFilters((prev) => ({ ...prev, jobType: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="any">Any</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="temporary">Temporary</option>
                    <option value="internship">Internship</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-2 block font-medium text-muted-foreground">Salary min</span>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={filters.salaryMin ?? ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, salaryMin: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="90000"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-2 block font-medium text-muted-foreground">Sort</span>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value as typeof prev.sortBy }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="date">Most recent</option>
                    <option value="salary">Salary</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setFilters({ remote: "any", dateRange: "any", jobType: "any", salaryMin: null, sortBy: "relevance" })}>
                  Clear filters
                </Button>
                <Button type="submit" size="sm">
                  Apply filters
                </Button>
              </div>
            </div>
          )}

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Active</span>
              {activeChips.map((chip) => (
                <span key={chip} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                  {chip}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link to="/prep/jd" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> start roadmap
            </Link>
          </div>
        </form>
      </div>

      {results.length > 0 && (
        <div className="surface mt-6 rounded-2xl border border-border p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Openings</h2>
            <span className="text-sm text-muted-foreground">{results.length} jobs found</span>
          </div>

          <div className="space-y-4">
            {results.map((job) => {
              const salary = formatSalary(job.salaryMin, job.salaryMax);
              const skills = job.skills.length ? job.skills : buildSkillChips(job.description).slice(0, 6);
              return (
                <div key={job.id} className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <Briefcase className="h-4 w-4 text-terminal" />
                        {job.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>{job.company}</span>
                        <span>•</span>
                        <span>{job.location}</span>
                        {job.remote !== "unknown" && (
                          <>
                            <span>•</span>
                            <span className="capitalize">{job.remote}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {salary && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-terminal/30 bg-terminal/10 px-2 py-1 font-medium text-terminal">
                            <Sparkles className="h-3 w-3" /> {salary}
                          </span>
                        )}
                        {job.jobType !== "unknown" && (
                          <span className="rounded-full border border-border px-2 py-1">{job.jobType}</span>
                        )}
                        <span>{formatDate(job.created)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <a
                        href={job.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
                      >
                        View job
                      </a>
                      <Button variant="outline" onClick={() => generateResumeForJob(job)} disabled={generating}>
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        Generate tailored resume
                      </Button>
                      <Button variant="secondary" onClick={() => useJob(job)}>
                        Build a study plan from this
                      </Button>
                    </div>
                  </div>

                  {job.description && (
                    <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{job.description.replace(/\s+/g, " ").trim().slice(0, 280)}</p>
                  )}

                  {skills.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required skills</p>
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill) => (
                          <span key={skill} className="rounded-full border border-border bg-accent px-2 py-1 text-[11px] font-medium text-foreground">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="surface mt-6 rounded-2xl border border-border p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Resume source</h2>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-accent">
            <Upload className="h-3.5 w-3.5" />
            {resumeFileName ? "Change file" : "Upload PDF or .txt"}
            <input
              type="file"
              accept=".pdf,application/pdf,text/plain,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onResumeFile(file);
              }}
            />
          </label>
        </div>

        {resumeFileName && resumePdfBase64 ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4 text-terminal" /> {resumeFileName}
            </span>
            <button
              type="button"
              onClick={() => {
                setResumePdfBase64(null);
                setResumeFileName(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <textarea
          value={state.resumeText}
          onChange={(e) => {
            const next: PrepState = { ...state, resumeText: e.target.value };
            setState(next);
            void persist(next);
            setResumeFileName(null);
            setResumePdfBase64(null);
            setIsProfileLoaded(false);
          }}
          placeholder="Paste your resume text here…"
          className="mt-3 min-h-[180px] w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
        />
      </div>

      {resumeError && (
        <div className="surface mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {resumeError}
        </div>
      )}

      {generatedResume && (
        <div className="surface mt-6 rounded-2xl border border-border p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tailored resume draft</h2>
            <span className="text-sm text-muted-foreground">saved locally</span>
          </div>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium">Summary</label>
              <textarea
                value={generatedResume.summary}
                onChange={(e) => updateGeneratedField("summary", e.target.value)}
                className="min-h-[100px] w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Skills</label>
                <textarea
                  value={generatedResume.skills.join("\n")}
                  onChange={(e) => updateGeneratedField("skills", e.target.value.split(/\n|,/).map((s) => s.trim()).filter(Boolean))}
                  className="min-h-[120px] w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Education</label>
                <textarea
                  value={generatedResume.education.map((school) => `${school.school} — ${school.degree}`).join("\n")}
                  onChange={(e) => {
                    const next = e.target.value
                      .split(/\n/)
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((item) => ({ school: item, degree: "", dates: "" }));
                    updateGeneratedField("education", next);
                  }}
                  className="min-h-[120px] w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Experience</label>
              <textarea
                value={generatedResume.experience.map((exp) => `${exp.company} — ${exp.title}\n${exp.dates}\n${exp.bullets.join("\n")}`).join("\n\n")}
                onChange={(e) => {
                  const next = e.target.value
                    .split(/\n\n/)
                    .filter(Boolean)
                    .map((entry) => ({
                      company: entry.split(" — ")[0] ?? "",
                      title: entry.split(" — ")[1]?.split("\n")[0] ?? "",
                      dates: entry.split("\n")[1] ?? "",
                      bullets: entry.split("\n").slice(2).filter(Boolean),
                    }));
                  updateGeneratedField("experience", next);
                }}
                className="min-h-[160px] w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      } else {
        reject(new Error("Could not read file"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
