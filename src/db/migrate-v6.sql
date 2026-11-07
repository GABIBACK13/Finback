ALTER TABLE transactions ADD COLUMN external_bank_id INTEGER REFERENCES banks (id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS transactions_bank_external_id;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_owner
  ON transactions (COALESCE(external_bank_id, bank_id), external_id);
