CREATE SCHEMA IF NOT EXISTS neurodegen;

-- ============================================================
-- Table: events
-- ============================================================
CREATE TABLE neurodegen.events (
  event_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL CHECK (source IN ('fourmeme', 'myx', 'pyth')),
  event_type  text        NOT NULL,
  timestamp   bigint      NOT NULL,
  block_number bigint     NULL,
  raw_hash    text        NULL,
  payload     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_source_type ON neurodegen.events (source, event_type);
CREATE INDEX idx_events_timestamp ON neurodegen.events (timestamp DESC);
CREATE INDEX idx_events_created_at ON neurodegen.events (created_at DESC);

ALTER TABLE neurodegen.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_select_anon ON neurodegen.events FOR SELECT TO anon USING (true);
CREATE POLICY events_insert_service ON neurodegen.events FOR INSERT TO service_role WITH CHECK (true);

-- ============================================================
-- Table: reasoning_chains
-- ============================================================
CREATE TABLE neurodegen.reasoning_chains (
  graph_id          uuid        PRIMARY KEY,
  created_at        timestamptz NOT NULL DEFAULT now(),
  regime            text        NOT NULL,
  input_metrics     jsonb       NOT NULL,
  model_calls       jsonb       NOT NULL,
  aggregation_logic text        NOT NULL,
  final_action      jsonb       NOT NULL,
  execution_result  jsonb       NULL
);

CREATE INDEX idx_reasoning_created_at ON neurodegen.reasoning_chains (created_at DESC);
CREATE INDEX idx_reasoning_regime ON neurodegen.reasoning_chains (regime);

ALTER TABLE neurodegen.reasoning_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY reasoning_select_anon ON neurodegen.reasoning_chains FOR SELECT TO anon USING (true);
CREATE POLICY reasoning_insert_service ON neurodegen.reasoning_chains FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY reasoning_update_service ON neurodegen.reasoning_chains FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: positions
-- ============================================================
CREATE TABLE neurodegen.positions (
  position_id        uuid        PRIMARY KEY,
  pair               text        NOT NULL,
  pair_index         integer     NOT NULL,
  is_long            boolean     NOT NULL,
  entry_price        numeric     NOT NULL,
  exit_price         numeric     NULL,
  collateral_usd     numeric     NOT NULL,
  size_amount        numeric     NOT NULL,
  leverage           numeric     NOT NULL,
  tp_price           numeric     NULL,
  sl_price           numeric     NULL,
  status             text        NOT NULL CHECK (status IN ('submitted', 'pending', 'filled', 'managed', 'closed', 'expired', 'liquidated')),
  order_id           text        NULL,
  entry_tx_hash      text        NULL,
  exit_tx_hash       text        NULL,
  exit_reason        text        NULL,
  realized_pnl_usd   numeric     NULL,
  reasoning_graph_id uuid        REFERENCES neurodegen.reasoning_chains (graph_id),
  opened_at          timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz NULL
);

CREATE INDEX idx_positions_status ON neurodegen.positions (status);
CREATE INDEX idx_positions_pair ON neurodegen.positions (pair);
CREATE INDEX idx_positions_opened_at ON neurodegen.positions (opened_at DESC);

ALTER TABLE neurodegen.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY positions_select_anon ON neurodegen.positions FOR SELECT TO anon USING (true);
CREATE POLICY positions_insert_service ON neurodegen.positions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY positions_update_service ON neurodegen.positions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: metrics
-- ============================================================
CREATE TABLE neurodegen.metrics (
  metric_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb       NOT NULL
);

CREATE INDEX idx_metrics_computed_at ON neurodegen.metrics (computed_at DESC);

ALTER TABLE neurodegen.metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY metrics_select_anon ON neurodegen.metrics FOR SELECT TO anon USING (true);
CREATE POLICY metrics_insert_service ON neurodegen.metrics FOR INSERT TO service_role WITH CHECK (true);
