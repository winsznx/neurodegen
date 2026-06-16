-- ============================================================
-- NeuroDegen V2 schema reset
-- ============================================================
--
-- WARNING: This migration DROPs V1 tables that V2 reuses by name:
--   neurodegen.positions, neurodegen.events, neurodegen.metrics,
--   neurodegen.reasoning_chains, neurodegen.users, neurodegen.subscriptions,
--   neurodegen.user_positions, neurodegen.telegram_*, neurodegen.notifications_log
--
-- V1 PRODUCTION DATA WILL BE LOST. If you want to preserve V1 records:
--   1. Run this against a fresh Supabase project, OR
--   2. Back up neurodegen.* via pg_dump first, OR
--   3. Manually preserve the rows you need before applying.
--
-- The /proof/[txHash] page and any historical analytics depend on
-- committee_sessions + positions, NOT on the V1 reasoning_chains/positions
-- tables. The V1 audit data referenced from NEURODEGEN_V1_AUDIT.md
-- is preserved in markdown form; the live tables are not migrated.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS neurodegen;

-- Drop V1 tables and views (in dependency order)
DROP VIEW  IF EXISTS neurodegen.journal_entries CASCADE;
DROP TABLE IF EXISTS neurodegen.notifications_log CASCADE;
DROP TABLE IF EXISTS neurodegen.telegram_subscriptions CASCADE;
DROP TABLE IF EXISTS neurodegen.telegram_link_tokens CASCADE;
DROP TABLE IF EXISTS neurodegen.user_positions CASCADE;
DROP TABLE IF EXISTS neurodegen.subscriptions CASCADE;
DROP TABLE IF EXISTS neurodegen.users CASCADE;
DROP TABLE IF EXISTS neurodegen.positions CASCADE;
DROP TABLE IF EXISTS neurodegen.reasoning_chains CASCADE;
DROP TABLE IF EXISTS neurodegen.metrics CASCADE;
DROP TABLE IF EXISTS neurodegen.events CASCADE;

-- ============================================================
-- V2 committee_sessions
-- ============================================================
CREATE TABLE neurodegen.committee_sessions (
  session_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number        BIGINT NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regime                TEXT NOT NULL CHECK (regime IN ('quiet', 'active', 'momentum', 'volatile')),
  previous_regime       TEXT CHECK (previous_regime IS NULL OR previous_regime IN ('quiet', 'active', 'momentum', 'volatile')),
  fear_greed_value      INTEGER NOT NULL,
  input_metrics         JSONB NOT NULL,
  ev_gate_decisions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  x402_spend_usdc       NUMERIC(10,4) NOT NULL DEFAULT 0,
  narrative_call        JSONB NOT NULL,
  quant_call            JSONB NOT NULL,
  dissent_result        JSONB NOT NULL,
  risk_call             JSONB NOT NULL,
  final_action          JSONB NOT NULL,
  reasoning_hash        TEXT NOT NULL,
  attestation_commit_tx TEXT,
  execution_result      JSONB
);

CREATE INDEX idx_committee_sessions_created_at ON neurodegen.committee_sessions (created_at DESC);
CREATE INDEX idx_committee_sessions_regime ON neurodegen.committee_sessions (regime);
CREATE INDEX idx_committee_sessions_reasoning_hash ON neurodegen.committee_sessions (reasoning_hash);

ALTER TABLE neurodegen.committee_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY committee_sessions_select_anon  ON neurodegen.committee_sessions FOR SELECT TO anon USING (true);
CREATE POLICY committee_sessions_insert_service ON neurodegen.committee_sessions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY committee_sessions_update_service ON neurodegen.committee_sessions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- V2 positions (spot trades via TWAK; LIQUIDATED retained for V2.1 perp)
-- ============================================================
CREATE TABLE neurodegen.positions (
  position_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             UUID REFERENCES neurodegen.committee_sessions (session_id) ON DELETE SET NULL,
  token_symbol           TEXT NOT NULL,
  token_address          TEXT NOT NULL,
  direction              TEXT NOT NULL DEFAULT 'spot' CHECK (direction IN ('long', 'short', 'spot')),
  size_usd               NUMERIC(12,2) NOT NULL,
  leverage               NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  entry_price_usd        NUMERIC(20,8) NOT NULL,
  tp_price_usd           NUMERIC(20,8),
  sl_price_usd           NUMERIC(20,8),
  twak_tx_hash           TEXT NOT NULL,
  attestation_commit_tx  TEXT,
  attestation_reveal_tx  TEXT,
  status                 TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'PENDING', 'FILLED', 'MANAGED', 'CLOSED', 'EXPIRED', 'LIQUIDATED')),
  exit_price_usd         NUMERIC(20,8),
  pnl_usd                NUMERIC(12,2),
  pnl_pct                NUMERIC(8,4),
  exit_reason            TEXT,
  opened_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at              TIMESTAMPTZ
);

CREATE INDEX idx_positions_status ON neurodegen.positions (status);
CREATE INDEX idx_positions_opened_at ON neurodegen.positions (opened_at DESC);
CREATE INDEX idx_positions_session ON neurodegen.positions (session_id);
CREATE INDEX idx_positions_twak_tx ON neurodegen.positions (twak_tx_hash);

ALTER TABLE neurodegen.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY positions_select_anon ON neurodegen.positions FOR SELECT TO anon USING (true);
CREATE POLICY positions_insert_service ON neurodegen.positions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY positions_update_service ON neurodegen.positions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- V2 events (CMC + Pyth)
-- ============================================================
CREATE TABLE neurodegen.events (
  event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL CHECK (source IN ('cmc_hub', 'pyth', 'twak')),
  event_type   TEXT NOT NULL,
  timestamp    BIGINT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_source_type ON neurodegen.events (source, event_type);
CREATE INDEX idx_events_timestamp ON neurodegen.events (timestamp DESC);

ALTER TABLE neurodegen.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_select_anon ON neurodegen.events FOR SELECT TO anon USING (true);
CREATE POLICY events_insert_service ON neurodegen.events FOR INSERT TO service_role WITH CHECK (true);

-- ============================================================
-- V2 metrics (AggregateMetrics snapshots + peak equity tracking)
-- ============================================================
CREATE TABLE neurodegen.metrics (
  metric_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB NOT NULL
);

CREATE INDEX idx_metrics_computed_at ON neurodegen.metrics (computed_at DESC);

ALTER TABLE neurodegen.metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY metrics_select_anon ON neurodegen.metrics FOR SELECT TO anon USING (true);
CREATE POLICY metrics_insert_service ON neurodegen.metrics FOR INSERT TO service_role WITH CHECK (true);

-- ============================================================
-- V2 consumed_x402_proofs (replay protection for inbound x402)
-- Fixes the V1 Pieverse replay vulnerability flagged in NEURODEGEN_V1_AUDIT.md §4.1
-- ============================================================
CREATE TABLE neurodegen.consumed_x402_proofs (
  tx_hash       TEXT PRIMARY KEY,
  payer         TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  consumed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint      TEXT NOT NULL
);

CREATE INDEX idx_consumed_x402_payer ON neurodegen.consumed_x402_proofs (payer);
CREATE INDEX idx_consumed_x402_consumed_at ON neurodegen.consumed_x402_proofs (consumed_at DESC);

ALTER TABLE neurodegen.consumed_x402_proofs ENABLE ROW LEVEL SECURITY;
-- No anon SELECT — proof consumption is operational metadata, not public.
CREATE POLICY consumed_x402_select_service  ON neurodegen.consumed_x402_proofs FOR SELECT TO service_role USING (true);
CREATE POLICY consumed_x402_insert_service  ON neurodegen.consumed_x402_proofs FOR INSERT TO service_role WITH CHECK (true);

-- ============================================================
-- Journal view (used by /journal page; cheap to recompute)
-- ============================================================
CREATE VIEW neurodegen.journal_entries AS
SELECT
  cs.session_id,
  cs.session_number,
  cs.created_at,
  cs.regime,
  cs.fear_greed_value,
  cs.final_action ->> 'action'                                AS action,
  cs.final_action ->> 'tokenSymbol'                           AS token_symbol,
  (cs.dissent_result ->> 'dissentDetected')::boolean          AS dissent_detected,
  p.pnl_pct,
  p.pnl_usd,
  p.exit_reason,
  CASE
    WHEN p.closed_at IS NOT NULL AND p.opened_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (p.closed_at - p.opened_at)) / 60
    ELSE NULL
  END AS hold_minutes,
  p.twak_tx_hash
FROM neurodegen.committee_sessions cs
LEFT JOIN neurodegen.positions p ON p.session_id = cs.session_id
ORDER BY cs.session_number DESC;
