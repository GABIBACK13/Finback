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
