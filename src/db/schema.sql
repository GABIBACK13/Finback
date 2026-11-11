PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- O cartão mora em banks para que lançamento, importação, transferência
-- e filtros continuem usando bank_id sem precisar de outra tabela de contas.
CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank', 'card')),
  parent_bank_id INTEGER REFERENCES banks (id) ON DELETE RESTRICT,
  closing_day INTEGER CHECK (closing_day IS NULL OR (closing_day BETWEEN 1 AND 31)),
  limit_cents INTEGER CHECK (limit_cents IS NULL OR limit_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (
      kind = 'bank'
      AND parent_bank_id IS NULL
      AND closing_day IS NULL
      AND limit_cents IS NULL
    )
    OR (
      kind = 'card'
      AND parent_bank_id IS NOT NULL
      AND closing_day IS NOT NULL
      AND limit_cents IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS banks_parent_bank_id ON banks (parent_bank_id);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  scope TEXT CHECK (scope IS NULL OR scope IN ('debit', 'credit', 'transfer')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subclasses (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (class_id, name)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit', 'transfer', 'demonstrative')),
  bank_id INTEGER NOT NULL REFERENCES banks (id) ON DELETE RESTRICT,
  destination_bank_id INTEGER REFERENCES banks (id) ON DELETE RESTRICT,
  external_id TEXT,
  external_bank_id INTEGER REFERENCES banks (id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  notes TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_on TEXT NOT NULL CHECK (occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  paid INTEGER NOT NULL DEFAULT 1 CHECK (paid IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (
      type = 'transfer'
      AND destination_bank_id IS NOT NULL
      AND destination_bank_id <> bank_id
    )
    OR (
      type <> 'transfer'
      AND destination_bank_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_owner
  ON transactions (COALESCE(external_bank_id, bank_id), external_id);

CREATE INDEX IF NOT EXISTS transactions_bank_id ON transactions (bank_id, occurred_on);
CREATE INDEX IF NOT EXISTS transactions_destination_bank_id ON transactions (destination_bank_id);
CREATE INDEX IF NOT EXISTS transactions_paid ON transactions (paid);

CREATE TABLE IF NOT EXISTS transaction_parts (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  subclass_id INTEGER REFERENCES subclasses (id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS transaction_parts_transaction_id ON transaction_parts (transaction_id);
CREATE INDEX IF NOT EXISTS transaction_parts_class_id ON transaction_parts (class_id);
CREATE INDEX IF NOT EXISTS transaction_parts_subclass_id ON transaction_parts (subclass_id);

CREATE TABLE IF NOT EXISTS import_rules (
  id INTEGER PRIMARY KEY,
  bank_id INTEGER NOT NULL REFERENCES banks (id) ON DELETE RESTRICT,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('equals', 'contains')),
  pattern TEXT NOT NULL CHECK (length(trim(pattern)) > 0),
  effect TEXT NOT NULL DEFAULT 'classify' CHECK (effect IN ('classify', 'skip')),
  class_id INTEGER REFERENCES classes (id) ON DELETE RESTRICT,
  subclass_id INTEGER REFERENCES subclasses (id) ON DELETE RESTRICT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (effect = 'classify' AND class_id IS NOT NULL)
    OR (effect = 'skip' AND class_id IS NULL AND subclass_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS import_rules_bank_kind_pattern
  ON import_rules (bank_id, match_kind, pattern COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS import_rules_class_id ON import_rules (class_id);
CREATE INDEX IF NOT EXISTS import_rules_subclass_id ON import_rules (subclass_id);

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
  -- Edição e exclusão precisam do estado anterior para desfazer. Criação deixa isto vazio.
  payload TEXT
);

CREATE INDEX IF NOT EXISTS import_changes_batch_id ON import_changes (batch_id);
CREATE INDEX IF NOT EXISTS import_changes_transaction_id ON import_changes (transaction_id);

CREATE TABLE IF NOT EXISTS import_mappings (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('account', 'card', 'category')),
  source_name TEXT NOT NULL COLLATE NOCASE,
  target_bank_id INTEGER REFERENCES banks (id) ON DELETE CASCADE,
  target_class_id INTEGER REFERENCES classes (id) ON DELETE CASCADE,
  target_subclass_id INTEGER REFERENCES subclasses (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, source_name)
);

CREATE INDEX IF NOT EXISTS import_mappings_kind_source ON import_mappings (kind, source_name);
CREATE INDEX IF NOT EXISTS import_mappings_target_bank_id ON import_mappings (target_bank_id);
CREATE INDEX IF NOT EXISTS import_mappings_target_class_id ON import_mappings (target_class_id);

CREATE TRIGGER IF NOT EXISTS transaction_parts_subclass_matches_class_insert
BEFORE INSERT ON transaction_parts
FOR EACH ROW
WHEN NEW.subclass_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'A subclasse não pertence à classe escolhida.')
  WHERE NOT EXISTS (
    SELECT 1
    FROM subclasses
    WHERE id = NEW.subclass_id
      AND class_id IS NEW.class_id
  );
END;

CREATE TRIGGER IF NOT EXISTS transaction_parts_subclass_matches_class_update
BEFORE UPDATE ON transaction_parts
FOR EACH ROW
WHEN NEW.subclass_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'A subclasse não pertence à classe escolhida.')
  WHERE NOT EXISTS (
    SELECT 1
    FROM subclasses
    WHERE id = NEW.subclass_id
      AND class_id IS NEW.class_id
  );
END;

CREATE TRIGGER IF NOT EXISTS banks_parent_is_bank_insert
BEFORE INSERT ON banks
FOR EACH ROW
WHEN NEW.parent_bank_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'O cartão tem de ser vinculado a uma conta.')
  WHERE NOT EXISTS (
    SELECT 1
    FROM banks
    WHERE id = NEW.parent_bank_id
      AND kind = 'bank'
  );
END;

CREATE TRIGGER IF NOT EXISTS banks_parent_is_bank_update
BEFORE UPDATE ON banks
FOR EACH ROW
WHEN NEW.parent_bank_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'O cartão tem de ser vinculado a uma conta.')
  WHERE NOT EXISTS (
    SELECT 1
    FROM banks
    WHERE id = NEW.parent_bank_id
      AND kind = 'bank'
  );
END;

INSERT INTO schema_migrations (version, applied_at)
SELECT 8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations);
