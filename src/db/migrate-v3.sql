CREATE TABLE IF NOT EXISTS import_rules (
  id INTEGER PRIMARY KEY,
  bank_id INTEGER NOT NULL REFERENCES banks (id) ON DELETE RESTRICT,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('equals', 'contains')),
  pattern TEXT NOT NULL CHECK (length(trim(pattern)) > 0),
  class_id INTEGER NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  subclass_id INTEGER REFERENCES subclasses (id) ON DELETE RESTRICT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS import_rules_bank_kind_pattern
  ON import_rules (bank_id, match_kind, pattern COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS import_rules_class_id ON import_rules (class_id);
CREATE INDEX IF NOT EXISTS import_rules_subclass_id ON import_rules (subclass_id);
