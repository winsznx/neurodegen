-- ============================================================
-- Table: users (Privy-authenticated copy-trade subscribers)
-- ============================================================
CREATE TABLE neurodegen.users (
  user_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id         text        NOT NULL UNIQUE,
  wallet_address   text        NOT NULL UNIQUE,
  email            text        NULL,
  display_name     text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_privy_id ON neurodegen.users (privy_id);
CREATE INDEX idx_users_wallet_address ON neurodegen.users (wallet_address);

ALTER TABLE neurodegen.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_service ON neurodegen.users FOR SELECT TO service_role USING (true);
CREATE POLICY users_insert_service ON neurodegen.users FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY users_update_service ON neurodegen.users FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: subscriptions (per-user copy-trade preferences)
-- ============================================================
CREATE TABLE neurodegen.subscriptions (
  subscription_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL REFERENCES neurodegen.users (user_id) ON DELETE CASCADE,
  active                     boolean     NOT NULL DEFAULT false,
  session_signer_granted     boolean     NOT NULL DEFAULT false,
  leverage_multiplier        numeric     NOT NULL DEFAULT 1.0 CHECK (leverage_multiplier > 0 AND leverage_multiplier <= 2.0),
  max_position_usd           numeric     NOT NULL DEFAULT 25.0 CHECK (max_position_usd > 0),
  min_confidence             numeric     NOT NULL DEFAULT 0.3 CHECK (min_confidence >= 0 AND min_confidence <= 1),
  paused_until               timestamptz NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_user_id ON neurodegen.subscriptions (user_id);
CREATE INDEX idx_subscriptions_active ON neurodegen.subscriptions (active) WHERE active = true;

ALTER TABLE neurodegen.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select_service ON neurodegen.subscriptions FOR SELECT TO service_role USING (true);
CREATE POLICY subscriptions_insert_service ON neurodegen.subscriptions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY subscriptions_update_service ON neurodegen.subscriptions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: user_positions (mirror positions — one row per user per agent entry)
-- ============================================================
CREATE TABLE neurodegen.user_positions (
  user_position_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES neurodegen.users (user_id) ON DELETE CASCADE,
  source_position_id  uuid        NOT NULL REFERENCES neurodegen.positions (position_id) ON DELETE CASCADE,
  pair                text        NOT NULL,
  pair_index          integer     NOT NULL,
  is_long             boolean     NOT NULL,
  entry_price         numeric     NOT NULL,
  exit_price          numeric     NULL,
  collateral_usd      numeric     NOT NULL,
  size_amount         numeric     NOT NULL,
  leverage            numeric     NOT NULL,
  tp_price            numeric     NULL,
  sl_price            numeric     NULL,
  status              text        NOT NULL CHECK (status IN ('submitted', 'pending', 'filled', 'managed', 'closed', 'expired', 'liquidated', 'skipped')),
  order_id            text        NULL,
  entry_tx_hash       text        NULL,
  exit_tx_hash        text        NULL,
  exit_reason         text        NULL,
  realized_pnl_usd    numeric     NULL,
  skip_reason         text        NULL,
  opened_at           timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz NULL
);

CREATE INDEX idx_user_positions_user_id ON neurodegen.user_positions (user_id);
CREATE INDEX idx_user_positions_source ON neurodegen.user_positions (source_position_id);
CREATE INDEX idx_user_positions_status ON neurodegen.user_positions (status);
CREATE INDEX idx_user_positions_opened_at ON neurodegen.user_positions (opened_at DESC);
CREATE UNIQUE INDEX idx_user_positions_user_source ON neurodegen.user_positions (user_id, source_position_id);

ALTER TABLE neurodegen.user_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_positions_select_service ON neurodegen.user_positions FOR SELECT TO service_role USING (true);
CREATE POLICY user_positions_insert_service ON neurodegen.user_positions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY user_positions_update_service ON neurodegen.user_positions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- updated_at trigger for subscriptions
-- ============================================================
CREATE OR REPLACE FUNCTION neurodegen.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscriptions_touch
  BEFORE UPDATE ON neurodegen.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION neurodegen.touch_updated_at();
