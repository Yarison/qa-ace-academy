import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Briefcase, Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { savePrep, loadPrep } from "@/lib/prep.functions";
import { searchJobs, type JobSearchResult } from "@/lib/jobs.functions";
import {
  EMPTY_PREP,
  getActiveRoadmapLocal,
  loadPrepDraftLocal,
  loadPrepLocal,
  savePrepDraftLocal,
  savePrepLocal,
  type PrepRoadmap,
  type PrepState,
} from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/prep/jobs")({
  head: () => ({
    meta: [
      { title: "Find a job posting — AI Interview Coach" },
      {
        name: "description",
        content: "Search real jobs from Adzuna and use one as your job description.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    new: typeof s.new === "string" ? s.new : "",
  }),
  component: JobsStep,
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

function JobsStep() {
  const navigate = useNavigate();
  const { new: createMode } = Route.useSearch();
  const isNewRoadmap = createMode === "1";
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [activeRoadmap, setActiveRoadmap] = useState<PrepRoadmap | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [query, setQuery] = useState({ what: "", where: "", country: "us" });
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isNewRoadmap) {
      const draft = loadPrepDraftLocal() ?? EMPTY_PREP;
      setActiveRoadmap(null);
      setState(draft);
      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(!!data.session);
      });
      return;
    }

    const active = getActiveRoadmapLocal();
    setActiveRoadmap(active);
    const local = active.state ?? loadPrepLocal();
    setState(local);
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
          }
        } catch {
          /* ignore */
        }
      }
    });
  }, [isNewRoadmap]);

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

  async function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.what.trim()) {
      toast.error("Enter a job title or keyword");
      return;
    }

    setSearching(true);
    try {
      const jobs = await searchJobs({
        data: {
          what: query.what,
          where: query.where,
          country: query.country,
        },
      });
      setResults(jobs);
      if (!jobs.length) {
        toast.info("No jobs matched that search. Try a broader title or a larger city.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
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
    navigate({ to: "/prep/jd", search: isNewRoadmap ? { new: "1" } : undefined });
  }

  return (
    <div>
      <header>
        <p className="eyebrow">Job search</p>
        <h1 className="display-2 mt-2">Find a real posting.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Search Adzuna for actual openings and use one as your job description before you continue.
        </p>
      </header>

      <div className="surface mt-8 rounded-2xl border border-border p-6">
        <form onSubmit={onSearch} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div>
              <label className="block text-sm font-medium">Job title</label>
              <input
                value={query.what}
                onChange={(e) => setQuery((prev) => ({ ...prev, what: e.target.value }))}
                placeholder="Software engineer, product manager, nurse…"
                className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-terminal/60"
              />
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

          <div className="flex items-center justify-between gap-3">
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
            <Button type="submit" disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? "Searching…" : "Search jobs"}
            </Button>
            <Link
              to="/prep/jd"
              search={isNewRoadmap ? { new: "1" } : undefined}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> back to JD
            </Link>
          </div>
        </form>
      </div>

      {results.length > 0 && (
        <div className="surface mt-6 rounded-2xl border border-border p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Results</h2>
            <span className="text-sm text-muted-foreground">{results.length} openings</span>
          </div>

          <div className="space-y-4">
            {results.map((job) => {
              const salary = formatSalary(job.salaryMin, job.salaryMax);
              return (
                <div key={job.id} className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-md font-semibold text-foreground">
                        <Briefcase className="h-4 w-4 text-terminal" />
                        {job.title}
                      </div>
                      <div className="text-sm text-muted-foreground">{job.company}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                      </div>
                      {salary && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-terminal/30 bg-terminal/10 px-2 py-1 text-xs font-medium text-terminal">
                          <Sparkles className="h-3 w-3" />
                          {salary}
                        </div>
                      )}
                    </div>

                    <Button variant="outline" onClick={() => useJob(job)} className="shrink-0">
                      Use this job
                    </Button>
                  </div>

                  {job.description && (
                    <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">
                      {job.description.replace(/\s+/g, " ").trim().slice(0, 260)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
