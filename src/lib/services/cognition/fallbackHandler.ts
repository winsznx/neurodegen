// Thin compatibility shim — Phase 2's `lib/clients/llm/router.ts` already
// implements the BYOK-direct → DGrid-primary → DGrid-fallback chain per
// committee member. Re-export the canonical entry point so callers that
// hit cognition/fallbackHandler (per PRD §10 file tree) compile cleanly.

export { routeCommitteeCall as runFallback } from '@/lib/clients/llm/router';
export type {
  CommitteeMember,
  RouterCallParams,
  RouterCallResult,
} from '@/lib/clients/llm/router';
