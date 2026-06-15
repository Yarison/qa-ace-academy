import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Database, SqlJsStatic } from "sql.js";
import { Play, RotateCcw, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/sql-playground")({
  head: () => ({
    meta: [
      { title: "SQL playground — qa.repl" },
      { name: "description", content: "Run SQL against a seeded in-browser database. No setup required." },
    ],
  }),
  component: Playground,
});

const SEED = `
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO departments VALUES (1,'Engineering'),(2,'QA'),(3,'Sales'),(4,'Marketing');

CREATE TABLE employees (
  id INTEGER PRIMARY KEY, name TEXT, dept_id INTEGER, salary INTEGER, hired_at TEXT
);
INSERT INTO employees VALUES
 (1,'Ada',1,140000,'2021-04-12'),
 (2,'Linus',1,165000,'2019-08-01'),
 (3,'Grace',2,120000,'2020-11-23'),
 (4,'Alan',2,118000,'2022-02-15'),
 (5,'Margaret',3,98000,'2023-06-30'),
 (6,'Edsger',1,150000,'2018-01-09'),
 (7,'Dorothy',4,105000,'2021-09-17'),
 (8,'Hedy',2,132000,'2017-03-25');

CREATE TABLE orders (
  id INTEGER PRIMARY KEY, employee_id INTEGER, amount INTEGER, created_at TEXT
);
INSERT INTO orders VALUES
 (1,5,1200,'2025-01-04'),(2,5,840,'2025-01-09'),(3,7,3300,'2025-02-11'),
 (4,5,560,'2025-02-15'),(5,7,990,'2025-03-02'),(6,3,150,'2025-03-19'),
 (7,5,2100,'2025-04-01'),(8,7,1700,'2025-04-22'),(9,5,430,'2025-05-03');
`;

const EXAMPLES = [
  { label: "All employees", sql: "SELECT * FROM employees;" },
  { label: "Join with department", sql: "SELECT e.name, d.name AS dept, e.salary\nFROM employees e\nJOIN departments d ON d.id = e.dept_id\nORDER BY e.salary DESC;" },
  { label: "2nd highest salary", sql: "SELECT MAX(salary) AS second_highest\nFROM employees\nWHERE salary < (SELECT MAX(salary) FROM employees);" },
  { label: "Top sellers", sql: "SELECT e.name, SUM(o.amount) AS total\nFROM orders o\nJOIN employees e ON e.id = o.employee_id\nGROUP BY e.id\nORDER BY total DESC;" },
  { label: "Rank within dept", sql: "SELECT name, dept_id, salary,\n  RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rnk\nFROM employees;" },
];

type Result = { columns: string[]; values: unknown[][] } | { error: string } | { ok: string } | null;

function Playground() {
  const [sql, setSql] = useState(EXAMPLES[1].sql);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const dbRef = useRef<Database | null>(null);
  const SQLRef = useRef<SqlJsStatic | null>(null);

  async function init() {
    setLoading(true);
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs({
      locateFile: (f) => `https://sql.js.org/dist/${f}`,
    });
    SQLRef.current = SQL;
    const db = new SQL.Database();
    db.exec(SEED);
    dbRef.current = db;
    setLoading(false);
  }

  useEffect(() => {
    init();
    return () => { dbRef.current?.close(); };
  }, []);

  function run() {
    const db = dbRef.current;
    if (!db) return;
    try {
      const res = db.exec(sql);
      if (res.length === 0) setResults([{ ok: "Query executed (no rows returned)." }]);
      else setResults(res);
    } catch (e) {
      setResults([{ error: (e as Error).message }]);
    }
  }

  async function reset() {
    dbRef.current?.close();
    const SQL = SQLRef.current;
    if (!SQL) return;
    const db = new SQL.Database();
    db.exec(SEED);
    dbRef.current = db;
    setResults([{ ok: "Database reset." }]);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6">
        <h1 className="font-mono text-2xl font-bold prompt">sqlite3 ./qa.db</h1>
        <p className="mt-2 text-sm text-muted-foreground">In-browser SQLite. Tables: <code className="text-terminal">employees</code>, <code className="text-terminal">departments</code>, <code className="text-terminal">orders</code>.</p>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} onClick={() => setSql(ex.sql)} className="rounded border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground hover:border-terminal/40 hover:text-foreground">
            {ex.label}
          </button>
        ))}
      </div>

      <div className="surface overflow-hidden rounded-lg border border-border">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={Math.min(14, Math.max(6, sql.split("\n").length))}
          className="w-full resize-y bg-background p-4 font-mono text-sm text-foreground outline-none"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
        />
        <div className="flex items-center justify-between border-t border-border bg-card px-3 py-2">
          <span className="font-mono text-[11px] text-muted-foreground">⌘/Ctrl + Enter to run</span>
          <div className="flex gap-2">
            <button onClick={reset} disabled={loading} className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 font-mono text-xs hover:border-terminal/40 disabled:opacity-50">
              <RotateCcw className="h-3 w-3" /> reset
            </button>
            <button onClick={run} disabled={loading} className="inline-flex items-center gap-1.5 rounded bg-terminal px-3 py-1 font-mono text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} run
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {results.map((r, i) => (
          <ResultBlock key={i} r={r} />
        ))}
      </div>
    </main>
  );
}

function ResultBlock({ r }: { r: Result }) {
  if (!r) return null;
  if ("error" in r) {
    return (
      <div className="surface rounded-lg border border-destructive/40 bg-destructive/10 p-3 font-mono text-sm text-destructive">
        <AlertCircle className="mr-2 inline h-4 w-4" />{r.error}
      </div>
    );
  }
  if ("ok" in r) {
    return <div className="surface rounded-lg border border-border p-3 font-mono text-xs text-terminal">{r.ok}</div>;
  }
  return (
    <div className="surface overflow-x-auto rounded-lg border border-border">
      <table className="w-full font-mono text-xs">
        <thead className="bg-accent/50">
          <tr>
            {r.columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left text-terminal">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.values.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-foreground">{cell === null ? <span className="text-muted-foreground">NULL</span> : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-card px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.values.length} row(s)</div>
    </div>
  );
}
