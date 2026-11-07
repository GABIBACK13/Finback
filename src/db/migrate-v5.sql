CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY,
  bank_id INTEGER NOT NULL REFERENCES banks (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS import_batches_created_at ON import_batches (created_at);

CREATE TABLE IF NOT EXISTS import_changes (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  transaction_id INTEGER REFERENCES transactions (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit', 'transfer', 'demonstrative')),
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_on TEXT NOT NULL,
  reverted_at TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS import_changes_batch_id ON import_changes (batch_id);
CREATE INDEX IF NOT EXISTS import_changes_transaction_id ON import_changes (transaction_id);
