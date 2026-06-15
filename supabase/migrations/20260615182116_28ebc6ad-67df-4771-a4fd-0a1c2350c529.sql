
-- QUESTIONS (public read)
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('api','sql','playwright')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions are publicly readable" ON public.questions FOR SELECT USING (true);

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by owner" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles upsert by owner" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles update by owner" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- MOCK SESSIONS
CREATE TABLE public.mock_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_sessions TO authenticated;
GRANT ALL ON public.mock_sessions TO service_role;
ALTER TABLE public.mock_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own sessions" ON public.mock_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SEED QUESTIONS
INSERT INTO public.questions (category,difficulty,question,answer,tags) VALUES
('api','easy','What is the difference between PUT and PATCH?','PUT replaces the entire resource with the request payload. PATCH applies a partial update to the resource. PUT is idempotent; PATCH may or may not be.',ARRAY['rest','http']),
('api','easy','What does HTTP status 401 vs 403 mean?','401 Unauthorized: the request lacks valid authentication credentials. 403 Forbidden: the server understood and authenticated the request but refuses to authorize it.',ARRAY['http','status']),
('api','medium','How would you test a REST API for idempotency?','Send the same request multiple times (e.g. PUT or DELETE) and verify the resulting server state and response are identical after the first call. Compare response body, status, and side effects (DB row count, audit logs).',ARRAY['rest','testing']),
('api','medium','What is contract testing and when is it useful?','Contract testing verifies that two services (consumer and provider) agree on the shape of requests/responses. It is useful in microservices to catch breaking changes early without running full end-to-end tests. Tools: Pact.',ARRAY['contract','microservices']),
('api','hard','How do you test rate-limited APIs?','Use a controlled test environment or mock server, send bursts above the limit, assert 429 Too Many Requests with proper Retry-After header, verify backoff logic in the client, and ensure quota resets correctly over the time window.',ARRAY['rate-limit','resilience']),
('api','hard','Explain how you would test authentication flows (OAuth2 / JWT).','Cover positive paths (valid token grants access), negative paths (expired, malformed, wrong audience, tampered signature), scope enforcement, refresh-token rotation, revocation, and replay protection. Use a test IdP or stubbed token issuer.',ARRAY['auth','jwt']),

('sql','easy','What is the difference between WHERE and HAVING?','WHERE filters rows before aggregation. HAVING filters groups after aggregation (used with GROUP BY).',ARRAY['basics']),
('sql','easy','Difference between INNER JOIN and LEFT JOIN?','INNER JOIN returns only rows with matches in both tables. LEFT JOIN returns all rows from the left table and matched rows from the right, with NULLs where no match exists.',ARRAY['joins']),
('sql','medium','Write a query to find the 2nd highest salary from an employees table.','SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees); -- or: SELECT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) r FROM employees) t WHERE r = 2;',ARRAY['window','ranking']),
('sql','medium','How would you detect duplicate rows in a table?','SELECT col1, col2, COUNT(*) FROM table GROUP BY col1, col2 HAVING COUNT(*) > 1;',ARRAY['data-quality']),
('sql','hard','Explain how to optimize a slow query.','Read the EXPLAIN/EXPLAIN ANALYZE plan; add indexes for filter/join columns; avoid SELECT *; rewrite correlated subqueries as joins or CTEs; check statistics; partition large tables; consider materialized views or denormalization for repeated heavy reads.',ARRAY['performance','indexing']),
('sql','hard','What is a window function? Give an example.','A window function performs a calculation across a set of rows related to the current row without collapsing them. Example: SELECT name, salary, RANK() OVER (PARTITION BY dept ORDER BY salary DESC) FROM employees;',ARRAY['window']),

('playwright','easy','How do you locate an element in Playwright?','Use locators: page.getByRole(), page.getByText(), page.getByLabel(), page.getByTestId(), or page.locator(cssOrXpath). Role-based locators are preferred for accessibility.',ARRAY['locators']),
('playwright','easy','What is auto-waiting in Playwright?','Playwright actions (click, fill, etc.) automatically wait for the element to be attached, visible, stable, enabled, and to receive events before acting — reducing flakiness without manual sleeps.',ARRAY['waiting']),
('playwright','medium','How do you handle authentication in Playwright tests?','Use storageState: log in once in a global setup, save cookies/localStorage to a file (page.context().storageState({path})), then reuse with { storageState: "auth.json" } in test configs to skip login per test.',ARRAY['auth','storageState']),
('playwright','medium','How do you intercept and mock network requests?','Use page.route("**/api/users", route => route.fulfill({ status: 200, body: JSON.stringify(mock) })); to mock, or route.continue({...}) to modify in flight. Useful for deterministic tests.',ARRAY['network','mocking']),
('playwright','hard','How would you run tests in parallel and shard them in CI?','Playwright runs tests in parallel by default per worker. Configure workers in playwright.config.ts. Use --shard=1/3, --shard=2/3, --shard=3/3 across CI jobs to split the suite, then merge HTML reports with blob reporter + merge-reports.',ARRAY['ci','parallel']),
('playwright','hard','Strategies for handling flaky tests in Playwright?','Prefer role/text locators over brittle CSS; rely on auto-waiting instead of sleeps; mock external APIs; isolate state with fresh contexts; use test.step + traces; quarantine and triage with retries — but fix root cause instead of masking.',ARRAY['flakiness','best-practices']);
