ALTER TABLE neurodegen.users
  ADD COLUMN wallet_id text NULL;

CREATE INDEX idx_users_wallet_id ON neurodegen.users (wallet_id) WHERE wallet_id IS NOT NULL;
