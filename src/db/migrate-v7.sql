ALTER TABLE banks ADD COLUMN kind TEXT NOT NULL DEFAULT 'bank';
ALTER TABLE banks ADD COLUMN parent_bank_id INTEGER REFERENCES banks (id) ON DELETE RESTRICT;
ALTER TABLE banks ADD COLUMN closing_day INTEGER;
ALTER TABLE banks ADD COLUMN limit_cents INTEGER;

ALTER TABLE transactions ADD COLUMN paid INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS banks_parent_bank_id ON banks (parent_bank_id);
CREATE INDEX IF NOT EXISTS transactions_paid ON transactions (paid);
