PRAGMA foreign_keys = OFF;

CREATE TABLE import_rules_next (
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

INSERT INTO import_rules_next (
  id, bank_id, match_kind, pattern, effect, class_id, subclass_id, description, created_at, updated_at
)
SELECT id, bank_id, match_kind, pattern, 'classify', class_id, subclass_id, description, created_at, updated_at
FROM import_rules;

DROP TABLE import_rules;

ALTER TABLE import_rules_next RENAME TO import_rules;

CREATE UNIQUE INDEX import_rules_bank_kind_pattern
  ON import_rules (bank_id, match_kind, pattern COLLATE NOCASE);

CREATE INDEX import_rules_class_id ON import_rules (class_id);
CREATE INDEX import_rules_subclass_id ON import_rules (subclass_id);
