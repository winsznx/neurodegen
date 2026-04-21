-- ============================================================
-- Table: telegram_link_tokens (short-lived onboarding tokens)
-- ============================================================
CREATE TABLE neurodegen.telegram_link_tokens (
  token         text        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES neurodegen.users (user_id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz NULL
);

CREATE INDEX idx_tg_tokens_user_id ON neurodegen.telegram_link_tokens (user_id);
CREATE INDEX idx_tg_tokens_expires_at ON neurodegen.telegram_link_tokens (expires_at);

ALTER TABLE neurodegen.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tg_tokens_select_service ON neurodegen.telegram_link_tokens FOR SELECT TO service_role USING (true);
CREATE POLICY tg_tokens_insert_service ON neurodegen.telegram_link_tokens FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY tg_tokens_update_service ON neurodegen.telegram_link_tokens FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tg_tokens_delete_service ON neurodegen.telegram_link_tokens FOR DELETE TO service_role USING (true);

-- ============================================================
-- Table: telegram_subscriptions (linked accounts)
-- ============================================================
CREATE TABLE neurodegen.telegram_subscriptions (
  subscription_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL UNIQUE REFERENCES neurodegen.users (user_id) ON DELETE CASCADE,
  chat_id            bigint      NOT NULL UNIQUE,
  username           text        NULL,
  first_name         text        NULL,
  language_code      text        NULL,
  preferences        jsonb       NOT NULL DEFAULT '{
    "mirror_opened": true,
    "mirror_closed": true,
    "mirror_skipped": false,
    "health_alerts": true,
    "agent_status": true,
    "daily_summary": true
  }'::jsonb,
  linked_at          timestamptz NOT NULL DEFAULT now(),
  last_message_at    timestamptz NULL,
  unlinked_at        timestamptz NULL
);

CREATE INDEX idx_tg_subs_user_id ON neurodegen.telegram_subscriptions (user_id);
CREATE INDEX idx_tg_subs_chat_id ON neurodegen.telegram_subscriptions (chat_id);
CREATE INDEX idx_tg_subs_active ON neurodegen.telegram_subscriptions (user_id) WHERE unlinked_at IS NULL;

ALTER TABLE neurodegen.telegram_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tg_subs_select_service ON neurodegen.telegram_subscriptions FOR SELECT TO service_role USING (true);
CREATE POLICY tg_subs_insert_service ON neurodegen.telegram_subscriptions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY tg_subs_update_service ON neurodegen.telegram_subscriptions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tg_subs_delete_service ON neurodegen.telegram_subscriptions FOR DELETE TO service_role USING (true);

-- ============================================================
-- Table: notifications_log (audit trail for deliveries)
-- ============================================================
CREATE TABLE neurodegen.notifications_log (
  notification_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES neurodegen.users (user_id) ON DELETE CASCADE,
  channel            text        NOT NULL CHECK (channel IN ('telegram', 'web_push')),
  kind               text        NOT NULL,
  payload            jsonb       NOT NULL,
  status             text        NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error              text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_user_created ON neurodegen.notifications_log (user_id, created_at DESC);
CREATE INDEX idx_notif_kind ON neurodegen.notifications_log (kind, created_at DESC);

ALTER TABLE neurodegen.notifications_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_select_service ON neurodegen.notifications_log FOR SELECT TO service_role USING (true);
CREATE POLICY notif_insert_service ON neurodegen.notifications_log FOR INSERT TO service_role WITH CHECK (true);
