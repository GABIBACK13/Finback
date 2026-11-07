PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS transactions_subclass_matches_class_insert;
DROP TRIGGER IF EXISTS transactions_subclass_matches_class_update;
DROP INDEX IF EXISTS transactions_class_id;
DROP INDEX IF EXISTS transactions_subclass_id;

ALTER TABLE classes ADD COLUMN scope TEXT CHECK (scope IS NULL OR scope IN ('debit', 'credit', 'transfer'));
ALTER TABLE transactions ADD COLUMN external_id TEXT;

CREATE TABLE IF NOT EXISTS transaction_parts (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  subclass_id INTEGER REFERENCES subclasses (id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);

INSERT INTO transaction_parts (transaction_id, class_id, subclass_id, amount_cents)
SELECT id, class_id, subclass_id, amount_cents
FROM transactions
WHERE class_id IS NOT NULL;

ALTER TABLE transactions DROP COLUMN subclass_id;
ALTER TABLE transactions DROP COLUMN class_id;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_bank_external_id
  ON transactions (bank_id, external_id);

CREATE INDEX IF NOT EXISTS transaction_parts_transaction_id ON transaction_parts (transaction_id);
CREATE INDEX IF NOT EXISTS transaction_parts_class_id ON transaction_parts (class_id);
CREATE INDEX IF NOT EXISTS transaction_parts_subclass_id ON transaction_parts (subclass_id);

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

PRAGMA foreign_keys = ON;
