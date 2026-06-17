-- ============================================================
-- V2 Phase 2 audit fix: persistent worker state
-- ============================================================
-- The probe-trade scheduler keeps `lastProbeDay` in memory only, so a
-- worker restart between 00:00 UTC and the daily probe time resets the
-- "already fired today?" check — and a second probe can fire the same
-- day, blowing the no-trade compliance signal. Persist scheduler state
-- here so restart-resilience is real.
--
-- Other worker singletons that need durable state can land in this table
-- (one row per key) without further migrations.
-- ============================================================

CREATE TABLE IF NOT EXISTS neurodegen.worker_state (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE neurodegen.worker_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_state_select_service ON neurodegen.worker_state
  FOR SELECT TO service_role USING (true);
CREATE POLICY worker_state_insert_service ON neurodegen.worker_state
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY worker_state_update_service ON neurodegen.worker_state
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
