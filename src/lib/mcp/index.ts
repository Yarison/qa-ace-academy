import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfile from "./tools/get-profile";
import getPrepSession from "./tools/get-prep-session";
import listMockSessions from "./tools/list-mock-sessions";
import getMockSession from "./tools/get-mock-session";

// Direct Supabase issuer — the .lovable.cloud proxy URL is rejected by mcp-js
// (RFC 8414 issuer mismatch). VITE_SUPABASE_PROJECT_ID is inlined by Vite at build.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ai-coach-mcp",
  title: "AI Interview Coach",
  version: "0.1.0",
  instructions:
    "Access the signed-in user's interview preparation data: their prep session (job description, analysis, study plan) and their saved mock-interview transcripts. Use these tools to answer questions about the user's target role, gaps to work on, plan progress, and past mock-interview performance.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfile, getPrepSession, listMockSessions, getMockSession],
});
