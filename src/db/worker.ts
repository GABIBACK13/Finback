import sqlite3InitModule, {
  type Database,
  type SqlValue,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'
import migrateV2Sql from './migrate-v2.sql?raw'
import migrateV3Sql from './migrate-v3.sql?raw'
import migrateV4Sql from './migrate-v4.sql?raw'
import migrateV5Sql from './migrate-v5.sql?raw'
import migrateV6Sql from './migrate-v6.sql?raw'
import schemaSql from './schema.sql?raw'
import { daySpan, eachDay, eachMonth } from '../lib/dates.ts'
import { descriptionScore, foldText } from '../lib/text.ts'
import type {
  BalancePoint,
  Bank,
  BankPeriod,
  ClassAmount,
  ClassRecord,
  ClassScope,
  DailyFlow,
  DashboardQuery,
  DescriptionSuggestion,
  DashboardSnapshot,
  FlowMonth,
  ImportBatch,
  ImportChange,
  ImportChangeAction,
  ImportMatchKind,
  ImportRequest,
  ImportRule,
  ImportRuleEffect,
  LargestMovement,
  PartInput,
  PartRecord,
  StackedFlow,
  SubclassAmount,
  SubclassRecord,
  TitleAmount,
  TransactionRecord,
  TransactionType,
  TransferPeer,
  WeekdayFlow,
} from './types.ts'

type SqliteInit = (options?: {
  locateFile?: (file: string) => string
  print?: (...args: unknown[]) => void
  printErr?: (...args: unknown[]) => void
}) => Promise<Sqlite3Static>

const transactionTypes: readonly TransactionType[] = [
  'debit',
  'credit',
  'transfer',
  'demonstrative',
]

const classScopes: readonly Exclude<ClassScope, null>[] = ['debit', 'credit', 'transfer']

const transactionSelect = `
  SELECT
    t.id,
    t.type,
    t.bank_id,
    source.name AS bank_name,
    t.destination_bank_id,
    destination.name AS destination_bank_name,
    t.external_id,
    t.external_bank_id,
    t.title,
    t.description,
    t.notes,
    t.amount_cents,
    t.occurred_on
  FROM transactions AS t
  JOIN banks AS source ON source.id = t.bank_id
  LEFT JOIN banks AS destination ON destination.id = t.destination_bank_id
`

let db: Database | null = null

type Incoming = {
  id?: unknown
  op?: unknown
  payload?: unknown
}

function post(message: unknown) {
  self.postMessage(message)
}

function openError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (
    name === 'NoModificationAllowedError' ||
    name === 'InvalidStateError' ||
    /NoModificationAllowed|already in use|locked/i.test(text)
  ) {
    return 'O FinBack já está aberto em outra aba.'
  }
  return 'Não foi possível abrir o banco neste navegador.'
}

function database(): Database {
  if (!db) throw new Error('O banco ainda não está pronto.')
  return db
}

function asNumber(value: SqlValue): number {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  throw new Error('Não foi possível concluir a operação.')
}

function text(value: SqlValue): string {
  if (typeof value !== 'string') throw new Error('Não foi possível concluir a operação.')
  return value
}

function optionalText(value: SqlValue): string | null {
  if (value === null) return null
  return text(value)
}

function optionalNumber(value: SqlValue): number | null {
  if (value === null) return null
  return asNumber(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readName(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.name !== 'string') throw new Error('Informe um nome.')
  const name = payload.name.trim()
  if (!name) throw new Error('Informe um nome.')
  return name
}

function readId(payload: unknown): number {
  if (!isRecord(payload) || typeof payload.id !== 'number' || !Number.isInteger(payload.id) || payload.id <= 0) {
    throw new Error('Identificador inválido.')
  }
  return payload.id
}

function countOf(sql: string, bind: readonly (string | number | null)[]): number {
  return asNumber(database().selectValue(sql, bind) ?? 0)
}

function exists(sql: string, bind: readonly (string | number | null)[]): boolean {
  return database().selectValue(sql, bind) !== undefined
}

function now(): string {
  return new Date().toISOString()
}

function uniqueOr(error: unknown, message: string): never {
  const textValue = error instanceof Error ? error.message : String(error)
  if (textValue.includes('UNIQUE')) throw new Error(message)
  throw error
}

function listBanks(): Bank[] {
  const rows = database().selectObjects(`
    SELECT
      b.id,
      b.name,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN t.type = 'credit' AND t.bank_id = b.id THEN t.amount_cents
            WHEN t.type = 'debit' AND t.bank_id = b.id THEN -t.amount_cents
            WHEN t.type = 'transfer' AND t.bank_id = b.id THEN -t.amount_cents
            WHEN t.type = 'transfer' AND t.destination_bank_id = b.id THEN t.amount_cents
            ELSE 0
          END
        )
        FROM transactions AS t
        WHERE t.bank_id = b.id OR t.destination_bank_id = b.id
      ), 0) AS balance_cents
    FROM banks AS b
    ORDER BY b.name COLLATE NOCASE, b.id
  `)
  return rows.map((row) => ({
    id: asNumber(row.id),
    name: text(row.name),
    balanceCents: asNumber(row.balance_cents),
  }))
}

function createBank(payload: unknown): Bank {
  const name = readName(payload)
  const stamp = now()
  try {
    database().exec({
      sql: 'INSERT INTO banks (name, created_at, updated_at) VALUES (?, ?, ?)',
      bind: [name, stamp, stamp],
    })
  } catch (error) {
    uniqueOr(error, 'Já existe um banco com esse nome.')
  }
  const id = asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0)
  const created = listBanks().find((bank) => bank.id === id)
  if (!created) throw new Error('Não foi possível concluir a operação.')
  return created
}

function updateBank(payload: unknown): Bank {
  const id = readId(payload)
  const name = readName(payload)
  if (!exists('SELECT id FROM banks WHERE id = ?', [id])) throw new Error('Banco não encontrado.')
  try {
    database().exec({
      sql: 'UPDATE banks SET name = ?, updated_at = ? WHERE id = ?',
      bind: [name, now(), id],
    })
  } catch (error) {
    uniqueOr(error, 'Já existe um banco com esse nome.')
  }
  const updated = listBanks().find((bank) => bank.id === id)
  if (!updated) throw new Error('Banco não encontrado.')
  return updated
}

function deleteBank(payload: unknown): void {
  const id = readId(payload)
  if (!exists('SELECT id FROM banks WHERE id = ?', [id])) throw new Error('Banco não encontrado.')
  const used = countOf(
    'SELECT COUNT(*) FROM transactions WHERE bank_id = ? OR destination_bank_id = ? OR external_bank_id = ?',
    [id, id, id],
  )
  if (used > 0) throw new Error('Este banco ainda é usado por um lançamento.')
  const rules = countOf('SELECT COUNT(*) FROM import_rules WHERE bank_id = ?', [id])
  if (rules > 0) throw new Error('Este banco ainda tem regras de importação.')
  const batches = countOf('SELECT COUNT(*) FROM import_batches WHERE bank_id = ?', [id])
  if (batches > 0) throw new Error('Este banco ainda tem histórico de importação.')
  database().exec({ sql: 'DELETE FROM banks WHERE id = ?', bind: [id] })
}

function mapScope(value: SqlValue): ClassScope {
  if (value === 'debit' || value === 'credit' || value === 'transfer') return value
  return null
}

function readScope(payload: unknown): ClassScope {
  if (!isRecord(payload) || payload.scope === null || payload.scope === undefined || payload.scope === '') return null
  if (typeof payload.scope === 'string' && classScopes.includes(payload.scope as Exclude<ClassScope, null>)) {
    return payload.scope as Exclude<ClassScope, null>
  }
  throw new Error('Escolha onde a classe aparece.')
}

function listClasses(): ClassRecord[] {
  return database()
    .selectObjects('SELECT id, name, scope FROM classes ORDER BY name COLLATE NOCASE, id')
    .map((row) => ({ id: asNumber(row.id), name: text(row.name), scope: mapScope(row.scope) }))
}

function createClass(payload: unknown): ClassRecord {
  const name = readName(payload)
  const scope = readScope(payload)
  const stamp = now()
  try {
    database().exec({
      sql: 'INSERT INTO classes (name, scope, created_at, updated_at) VALUES (?, ?, ?, ?)',
      bind: [name, scope, stamp, stamp],
    })
  } catch (error) {
    uniqueOr(error, 'Já existe uma classe com esse nome.')
  }
  return {
    id: asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0),
    name,
    scope,
  }
}

function updateClass(payload: unknown): ClassRecord {
  const id = readId(payload)
  const name = readName(payload)
  const scope = readScope(payload)
  if (!exists('SELECT id FROM classes WHERE id = ?', [id])) throw new Error('Classe não encontrada.')
  try {
    database().exec({
      sql: 'UPDATE classes SET name = ?, scope = ?, updated_at = ? WHERE id = ?',
      bind: [name, scope, now(), id],
    })
  } catch (error) {
    uniqueOr(error, 'Já existe uma classe com esse nome.')
  }
  return { id, name, scope }
}

function deleteClass(payload: unknown): void {
  const id = readId(payload)
  if (!exists('SELECT id FROM classes WHERE id = ?', [id])) throw new Error('Classe não encontrada.')
  const subclasses = countOf('SELECT COUNT(*) FROM subclasses WHERE class_id = ?', [id])
  const transactions = countOf('SELECT COUNT(*) FROM transaction_parts WHERE class_id = ?', [id])
  if (subclasses > 0 && transactions > 0) {
    throw new Error('Esta classe ainda tem subclasses ou lançamentos.')
  }
  if (subclasses > 0) throw new Error('Esta classe ainda tem subclasses.')
  if (transactions > 0) throw new Error('Esta classe ainda é usada por um lançamento.')
  const rules = countOf('SELECT COUNT(*) FROM import_rules WHERE class_id = ?', [id])
  if (rules > 0) throw new Error('Esta classe ainda é usada por uma regra de importação.')
  database().exec({ sql: 'DELETE FROM classes WHERE id = ?', bind: [id] })
}

function listAllSubclasses(): SubclassRecord[] {
  return database()
    .selectObjects('SELECT id, class_id, name FROM subclasses ORDER BY name COLLATE NOCASE, id')
    .map(mapSubclass)
}

function listSubclasses(payload: unknown): SubclassRecord[] {
  const classId = readId(payload)
  return database()
    .selectObjects(
      'SELECT id, class_id, name FROM subclasses WHERE class_id = ? ORDER BY name COLLATE NOCASE, id',
      [classId],
    )
    .map(mapSubclass)
}

function mapSubclass(row: Record<string, SqlValue>): SubclassRecord {
  return {
    id: asNumber(row.id),
    classId: asNumber(row.class_id),
    name: text(row.name),
  }
}

function createSubclass(payload: unknown): SubclassRecord {
  if (!isRecord(payload)) throw new Error('Informe um nome.')
  const classId = readId({ id: payload.classId })
  const name = readName(payload)
  if (!exists('SELECT id FROM classes WHERE id = ?', [classId])) throw new Error('Classe não encontrada.')
  const stamp = now()
  try {
    database().exec({
      sql: 'INSERT INTO subclasses (class_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      bind: [classId, name, stamp, stamp],
    })
  } catch (error) {
    uniqueOr(error, 'Já existe uma subclasse com esse nome nesta classe.')
  }
  return {
    id: asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0),
    classId,
    name,
  }
}

function updateSubclass(payload: unknown): SubclassRecord {
  const id = readId(payload)
  const name = readName(payload)
  const classId = database().selectValue('SELECT class_id FROM subclasses WHERE id = ?', [id])
  if (classId === undefined) throw new Error('Subclasse não encontrada.')
  try {
    database().exec({
      sql: 'UPDATE subclasses SET name = ?, updated_at = ? WHERE id = ?',
      bind: [name, now(), id],
    })
  } catch (error) {
    uniqueOr(error, 'Já existe uma subclasse com esse nome nesta classe.')
  }
  return { id, classId: asNumber(classId), name }
}

function deleteSubclass(payload: unknown): void {
  const id = readId(payload)
  if (!exists('SELECT id FROM subclasses WHERE id = ?', [id])) throw new Error('Subclasse não encontrada.')
  const used = countOf('SELECT COUNT(*) FROM transaction_parts WHERE subclass_id = ?', [id])
  if (used > 0) throw new Error('Esta subclasse ainda é usada por um lançamento.')
  const rules = countOf('SELECT COUNT(*) FROM import_rules WHERE subclass_id = ?', [id])
  if (rules > 0) throw new Error('Esta subclasse ainda é usada por uma regra de importação.')
  database().exec({ sql: 'DELETE FROM subclasses WHERE id = ?', bind: [id] })
}

function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && transactionTypes.includes(value as TransactionType)
}

function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function optionalForeignId(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('Identificador inválido.')
  }
  return value
}

function partsByTransaction(): Map<number, PartRecord[]> {
  const grouped = new Map<number, PartRecord[]>()
  const rows = database().selectObjects(`
    SELECT
      p.transaction_id,
      p.class_id,
      category.name AS class_name,
      p.subclass_id,
      subclass.name AS subclass_name,
      p.amount_cents
    FROM transaction_parts AS p
    JOIN classes AS category ON category.id = p.class_id
    LEFT JOIN subclasses AS subclass ON subclass.id = p.subclass_id
    ORDER BY p.transaction_id, p.id
  `)
  for (const row of rows) {
    const transactionId = asNumber(row.transaction_id)
    const parts = grouped.get(transactionId) ?? []
    parts.push({
      classId: asNumber(row.class_id),
      className: text(row.class_name),
      subclassId: optionalNumber(row.subclass_id),
      subclassName: optionalText(row.subclass_name),
      amountCents: asNumber(row.amount_cents),
    })
    grouped.set(transactionId, parts)
  }
  return grouped
}

function mapTransaction(row: Record<string, SqlValue>, parts: PartRecord[]): TransactionRecord {
  const type = row.type
  if (!isTransactionType(type)) throw new Error('Não foi possível concluir a operação.')
  return {
    id: asNumber(row.id),
    type,
    bankId: asNumber(row.bank_id),
    bankName: text(row.bank_name),
    destinationBankId: optionalNumber(row.destination_bank_id),
    destinationBankName: optionalText(row.destination_bank_name),
    externalBankId: optionalNumber(row.external_bank_id),
    externalId: optionalText(row.external_id),
    title: text(row.title),
    description: optionalText(row.description),
    notes: optionalText(row.notes),
    amountCents: asNumber(row.amount_cents),
    occurredOn: text(row.occurred_on),
    parts,
  }
}

function transactionById(id: number): TransactionRecord {
  const row = database().selectObject(`${transactionSelect} WHERE t.id = ?`, [id])
  if (!row) throw new Error('Lançamento não encontrado.')
  return mapTransaction(row, partsByTransaction().get(id) ?? [])
}

function listTransactions(): TransactionRecord[] {
  const parts = partsByTransaction()
  return database()
    .selectObjects(`${transactionSelect} ORDER BY t.occurred_on DESC, t.id DESC`)
    .map((row) => mapTransaction(row, parts.get(asNumber(row.id)) ?? []))
}

function blankToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function saveTransaction(payload: unknown): TransactionRecord {
  if (!isRecord(payload)) throw new Error('Não foi possível salvar o lançamento.')
  if (!isTransactionType(payload.type)) throw new Error('Escolha o tipo do lançamento.')
  if (typeof payload.bankId !== 'number' || !Number.isInteger(payload.bankId) || payload.bankId <= 0) {
    throw new Error('Escolha um banco.')
  }
  if (typeof payload.title !== 'string' || !payload.title.trim()) throw new Error('Informe um título.')
  if (typeof payload.amountCents !== 'number' || !Number.isInteger(payload.amountCents) || payload.amountCents <= 0) {
    throw new Error('Informe um valor maior que zero.')
  }
  if (typeof payload.occurredOn !== 'string' || !isCivilDate(payload.occurredOn)) {
    throw new Error('Informe uma data válida.')
  }

  const type = payload.type
  const bankId = payload.bankId
  const destinationBankId = type === 'transfer' ? optionalForeignId(payload.destinationBankId) : null
  const title = payload.title.trim()
  const description = blankToNull(payload.description)
  const notes = blankToNull(payload.notes)
  const amountCents = payload.amountCents
  const occurredOn = payload.occurredOn
  const id = payload.id === null || payload.id === undefined ? null : optionalForeignId(payload.id)
  const parts = readParts(payload.parts, amountCents)

  assertTransfer(type, bankId, destinationBankId)
  assertBank(bankId, destinationBankId)
  assertParts(parts)

  const stamp = now()
  const bind = [type, bankId, destinationBankId, title, description, notes, amountCents, occurredOn, stamp]

  let savedId = id ?? 0
  database().transaction(() => {
    if (id === null) {
      database().exec({
        sql: `
          INSERT INTO transactions (
            type, bank_id, destination_bank_id, external_id,
            title, description, notes, amount_cents, occurred_on, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
        `,
        bind: [...bind, stamp],
      })
      savedId = asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0)
    } else {
      database().exec({
        sql: `
          UPDATE transactions SET
            type = ?,
            bank_id = ?,
            destination_bank_id = ?,
            title = ?,
            description = ?,
            notes = ?,
            amount_cents = ?,
            occurred_on = ?,
            updated_at = ?
          WHERE id = ?
        `,
        bind: [...bind, id],
      })
      if (database().changes() === 0 && !exists('SELECT id FROM transactions WHERE id = ?', [id])) {
        throw new Error('Lançamento não encontrado.')
      }
      savedId = id
    }
    replaceParts(savedId, parts)
  })

  return transactionById(savedId)
}

function readParts(value: unknown, amountCents: number): PartInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('O rateio das classes é inválido.')
  const parts = value.map((item) => {
    if (!isRecord(item)) throw new Error('O rateio das classes é inválido.')
    const classId = optionalForeignId(item.classId)
    if (classId === null) throw new Error('Escolha a classe de cada parte.')
    const subclassId = optionalForeignId(item.subclassId)
    if (typeof item.amountCents !== 'number' || !Number.isInteger(item.amountCents) || item.amountCents <= 0) {
      throw new Error('Informe o valor de cada classe.')
    }
    return { classId, subclassId, amountCents: item.amountCents }
  })
  if (parts.length === 0) return []
  const sum = parts.reduce((total, part) => total + part.amountCents, 0)
  if (sum !== amountCents) throw new Error('A soma das classes tem de ser igual ao valor do lançamento.')
  return parts
}

function assertTransfer(type: TransactionType, bankId: number, destinationBankId: number | null) {
  if (type !== 'transfer') return
  if (destinationBankId === null) throw new Error('Escolha o banco de destino.')
  if (destinationBankId === bankId) throw new Error('A transferência precisa de dois bancos diferentes.')
}

function assertBank(bankId: number, destinationBankId: number | null) {
  if (!exists('SELECT id FROM banks WHERE id = ?', [bankId])) throw new Error('Banco não encontrado.')
  if (destinationBankId !== null && !exists('SELECT id FROM banks WHERE id = ?', [destinationBankId])) {
    throw new Error('Banco de destino não encontrado.')
  }
}

function assertParts(parts: readonly PartInput[]) {
  for (const part of parts) {
    if (!exists('SELECT id FROM classes WHERE id = ?', [part.classId])) throw new Error('Classe não encontrada.')
    if (part.subclassId === null) continue
    const owner = database().selectValue('SELECT class_id FROM subclasses WHERE id = ?', [part.subclassId])
    if (owner === undefined || asNumber(owner) !== part.classId) {
      throw new Error('A subclasse não pertence à classe escolhida.')
    }
  }
}

function replaceParts(transactionId: number, parts: readonly PartInput[]) {
  database().exec({ sql: 'DELETE FROM transaction_parts WHERE transaction_id = ?', bind: [transactionId] })
  for (const part of parts) {
    database().exec({
      sql: `
        INSERT INTO transaction_parts (transaction_id, class_id, subclass_id, amount_cents)
        VALUES (?, ?, ?, ?)
      `,
      bind: [transactionId, part.classId, part.subclassId, part.amountCents],
    })
  }
}

function importTransactions(payload: unknown): number {
  if (!isRecord(payload) || typeof payload.bankId !== 'number' || !Array.isArray(payload.rows)) {
    throw new Error('Não foi possível salvar o lançamento.')
  }
  const request = payload as ImportRequest
  if (request.rows.length === 0) throw new Error('Não há lançamentos para finalizar.')
  assertBank(request.bankId, null)
  database().transaction(() => {
    const batchStamp = now()
    database().exec({
      sql: 'INSERT INTO import_batches (bank_id, created_at) VALUES (?, ?)',
      bind: [request.bankId, batchStamp],
    })
    const batchId = asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0)
    for (const row of request.rows) {
      if (!isTransactionType(row.type)) throw new Error('Escolha o tipo do lançamento.')
      if (typeof row.externalId !== 'string' || !row.externalId.trim()) {
        throw new Error('Este identificador já existe neste banco.')
      }
      const externalId = row.externalId.trim()
      const sourceBankId = typeof row.bankId === 'number' ? row.bankId : request.bankId
      if (!Number.isInteger(sourceBankId) || sourceBankId <= 0) throw new Error('Escolha um banco.')
      const externalBankId =
        row.externalBankId === null || row.externalBankId === undefined ? null : optionalForeignId(row.externalBankId)
      // O identificador do arquivo fica na conta importada, mesmo quando o dinheiro saiu de outra.
      const ownerBankId = externalBankId ?? sourceBankId
      if (
        exists(
          'SELECT id FROM transactions WHERE external_id = ? AND COALESCE(external_bank_id, bank_id) = ?',
          [externalId, ownerBankId],
        )
      ) {
        throw new Error('Este identificador já existe neste banco.')
      }
      if (typeof row.title !== 'string' || !row.title.trim()) throw new Error('Informe um título.')
      if (typeof row.amountCents !== 'number' || !Number.isInteger(row.amountCents) || row.amountCents <= 0) {
        throw new Error('Informe um valor maior que zero.')
      }
      if (typeof row.occurredOn !== 'string' || !isCivilDate(row.occurredOn)) throw new Error('Informe uma data válida.')
      const destinationBankId = row.type === 'transfer' ? optionalForeignId(row.destinationBankId) : null
      assertTransfer(row.type, sourceBankId, destinationBankId)
      assertBank(sourceBankId, destinationBankId)
      if (externalBankId !== null) assertBank(externalBankId, null)
      const parts = readParts(row.parts, row.amountCents)
      assertParts(parts)
      const stamp = now()
      const title = row.title.trim()
      database().exec({
        sql: `
          INSERT INTO transactions (
            type, bank_id, destination_bank_id, external_id, external_bank_id,
            title, description, notes, amount_cents, occurred_on, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        bind: [
          row.type,
          sourceBankId,
          destinationBankId,
          externalId,
          externalBankId,
          title,
          blankToNull(row.description),
          blankToNull(row.notes),
          row.amountCents,
          row.occurredOn,
          stamp,
          stamp,
        ],
      })
      const transactionId = asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0)
      replaceParts(transactionId, parts)
      database().exec({
        sql: `
          INSERT INTO import_changes (
            batch_id, action, transaction_id, type, title, amount_cents, occurred_on, payload
          ) VALUES (?, 'create', ?, ?, ?, ?, ?, NULL)
        `,
        bind: [batchId, transactionId, row.type, title, row.amountCents, row.occurredOn],
      })
    }
  })
  return request.rows.length
}

function suggestDescriptions(payload: unknown): DescriptionSuggestion[] {
  if (!isRecord(payload) || !isTransactionType(payload.type)) return []
  if (typeof payload.query !== 'string') return []
  const excludeId =
    typeof payload.excludeId === 'number' && Number.isInteger(payload.excludeId) && payload.excludeId > 0
      ? payload.excludeId
      : null
  const rows = database().selectObjects(
    `
      SELECT id, description, occurred_on
      FROM transactions
      WHERE type = ?
        AND description IS NOT NULL
        AND length(trim(description)) > 0
        AND (? IS NULL OR id <> ?)
      ORDER BY occurred_on DESC, id DESC
    `,
    [payload.type, excludeId, excludeId],
  )
  const newest = new Map<string, { id: number; description: string; occurredOn: string }>()
  for (const row of rows) {
    const description = text(row.description)
    const key = foldText(description)
    if (!key || newest.has(key)) continue
    newest.set(key, { id: asNumber(row.id), description, occurredOn: text(row.occurred_on) })
  }
  const ranked = [...newest.values()]
    .map((row) => ({ row, score: descriptionScore(payload.query as string, row.description) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.row.occurredOn.localeCompare(left.row.occurredOn))
    .slice(0, 8)
  return ranked.map(({ row }) => ({
    description: row.description,
    parts: partsOfTransaction(row.id),
  }))
}

function partsOfTransaction(transactionId: number): PartRecord[] {
  return database()
    .selectObjects(
      `
        SELECT
          p.class_id,
          category.name AS class_name,
          p.subclass_id,
          subclass.name AS subclass_name,
          p.amount_cents
        FROM transaction_parts AS p
        JOIN classes AS category ON category.id = p.class_id
        LEFT JOIN subclasses AS subclass ON subclass.id = p.subclass_id
        WHERE p.transaction_id = ?
        ORDER BY p.amount_cents DESC, p.id
      `,
      [transactionId],
    )
    .map((row) => ({
      classId: asNumber(row.class_id),
      className: text(row.class_name),
      subclassId: optionalNumber(row.subclass_id),
      subclassName: optionalText(row.subclass_name),
      amountCents: asNumber(row.amount_cents),
    }))
}

function deleteTransaction(payload: unknown): void {
  const id = readId(payload)
  database().exec({ sql: 'DELETE FROM transactions WHERE id = ?', bind: [id] })
  if (database().changes() === 0) throw new Error('Lançamento não encontrado.')
}

type SqlBind = string | number

function metric(value: SqlValue | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  throw new Error('Não foi possível montar o resumo.')
}

function whereAnd(parts: { sql: string; bind: SqlBind[] }[]): { sql: string; bind: SqlBind[] } {
  const active = parts.filter((part) => part.sql.length > 0)
  if (active.length === 0) return { sql: '', bind: [] }
  return {
    sql: `WHERE ${active.map((part) => `(${part.sql})`).join(' AND ')}`,
    bind: active.flatMap((part) => part.bind),
  }
}

function dateClause(from: string | null, to: string | null): { sql: string; bind: SqlBind[] } {
  const sql: string[] = []
  const bind: SqlBind[] = []
  if (from) {
    sql.push('t.occurred_on >= ?')
    bind.push(from)
  }
  if (to) {
    sql.push('t.occurred_on <= ?')
    bind.push(to)
  }
  return { sql: sql.join(' AND '), bind }
}

function bankTouch(bankId: number | null): { sql: string; bind: SqlBind[] } {
  if (bankId === null) return { sql: '', bind: [] }
  return { sql: 't.bank_id = ? OR t.destination_bank_id = ?', bind: [bankId, bankId] }
}

function readDashboardQuery(payload: unknown): DashboardQuery {
  if (!isRecord(payload)) throw new Error('Não foi possível montar o resumo.')
  let bankId: number | null = null
  if (payload.bankId !== null && payload.bankId !== undefined) {
    if (typeof payload.bankId !== 'number' || !Number.isInteger(payload.bankId) || payload.bankId <= 0) {
      throw new Error('Banco não encontrado.')
    }
    bankId = payload.bankId
  }
  const from = readDashboardDate(payload.from)
  const to = readDashboardDate(payload.to)
  if (from && to && from > to) throw new Error('Informe um período válido.')
  return { bankId, from, to }
}

function readDashboardDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !isCivilDate(value)) throw new Error('Informe um período válido.')
  return value
}

function emptyFlow(month: string): FlowMonth {
  return {
    month,
    creditCents: 0,
    debitCents: 0,
    transferInCents: 0,
    transferOutCents: 0,
    demonstrativeCents: 0,
    creditCount: 0,
    debitCount: 0,
  }
}

function flowSums(bankId: number | null): { sql: string; bind: SqlBind[] } {
  if (bankId === null) {
    return {
      sql: `
        SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents ELSE 0 END) AS credit_cents,
        SUM(CASE WHEN t.type = 'debit' THEN t.amount_cents ELSE 0 END) AS debit_cents,
        SUM(CASE WHEN t.type = 'transfer' THEN t.amount_cents ELSE 0 END) AS transfer_in_cents,
        SUM(CASE WHEN t.type = 'transfer' THEN t.amount_cents ELSE 0 END) AS transfer_out_cents,
        SUM(CASE WHEN t.type = 'demonstrative' THEN t.amount_cents ELSE 0 END) AS demonstrative_cents,
        SUM(CASE WHEN t.type = 'credit' THEN 1 ELSE 0 END) AS credit_count,
        SUM(CASE WHEN t.type = 'debit' THEN 1 ELSE 0 END) AS debit_count
      `,
      bind: [],
    }
  }
  return {
    sql: `
      SUM(CASE WHEN t.type = 'credit' AND t.bank_id = ? THEN t.amount_cents ELSE 0 END) AS credit_cents,
      SUM(CASE WHEN t.type = 'debit' AND t.bank_id = ? THEN t.amount_cents ELSE 0 END) AS debit_cents,
      SUM(CASE WHEN t.type = 'transfer' AND t.destination_bank_id = ? THEN t.amount_cents ELSE 0 END) AS transfer_in_cents,
      SUM(CASE WHEN t.type = 'transfer' AND t.bank_id = ? THEN t.amount_cents ELSE 0 END) AS transfer_out_cents,
      SUM(CASE WHEN t.type = 'demonstrative' AND t.bank_id = ? THEN t.amount_cents ELSE 0 END) AS demonstrative_cents,
      SUM(CASE WHEN t.type = 'credit' AND t.bank_id = ? THEN 1 ELSE 0 END) AS credit_count,
      SUM(CASE WHEN t.type = 'debit' AND t.bank_id = ? THEN 1 ELSE 0 END) AS debit_count
    `,
    bind: [bankId, bankId, bankId, bankId, bankId, bankId, bankId],
  }
}

function mapFlow(bucket: string, row: Record<string, SqlValue>): FlowMonth {
  return {
    month: bucket,
    creditCents: metric(row.credit_cents),
    debitCents: metric(row.debit_cents),
    transferInCents: metric(row.transfer_in_cents),
    transferOutCents: metric(row.transfer_out_cents),
    demonstrativeCents: metric(row.demonstrative_cents),
    creditCount: metric(row.credit_count),
    debitCount: metric(row.debit_count),
  }
}

function groupedFlows(bankId: number | null, from: string | null, to: string | null, grain: 'month' | 'day'): FlowMonth[] {
  const sums = flowSums(bankId)
  const where = whereAnd([bankTouch(bankId), dateClause(from, to)])
  const bucket = grain === 'month' ? "substr(t.occurred_on, 1, 7)" : 't.occurred_on'
  const rows = database().selectObjects(
    `
      SELECT ${bucket} AS bucket,
        ${sums.sql}
      FROM transactions AS t
      ${where.sql}
      GROUP BY bucket
      ORDER BY bucket
    `,
    [...sums.bind, ...where.bind],
  )
  return rows.map((row) => mapFlow(text(row.bucket), row))
}

function openingBalance(bankId: number | null, from: string | null): number {
  if (!from) return 0
  if (bankId === null) {
    return metric(
      database().selectValue(
        `
          SELECT COALESCE(SUM(
            CASE
              WHEN type = 'credit' THEN amount_cents
              WHEN type = 'debit' THEN -amount_cents
              ELSE 0
            END
          ), 0)
          FROM transactions
          WHERE occurred_on < ?
        `,
        [from],
      ) ?? 0,
    )
  }
  return metric(
    database().selectValue(
      `
        SELECT COALESCE(SUM(
          CASE
            WHEN type = 'credit' AND bank_id = ? THEN amount_cents
            WHEN type = 'debit' AND bank_id = ? THEN -amount_cents
            WHEN type = 'transfer' AND bank_id = ? THEN -amount_cents
            WHEN type = 'transfer' AND destination_bank_id = ? THEN amount_cents
            ELSE 0
          END
        ), 0)
        FROM transactions
        WHERE occurred_on < ?
      `,
      [bankId, bankId, bankId, bankId, from],
    ) ?? 0,
  )
}

function activityRange(bankId: number | null): { from: string; to: string } | null {
  const where = whereAnd([bankTouch(bankId)])
  const row = database().selectObject(
    `SELECT MIN(t.occurred_on) AS min_on, MAX(t.occurred_on) AS max_on FROM transactions AS t ${where.sql}`,
    where.bind,
  )
  if (!row || row.min_on === null || row.max_on === null) return null
  return { from: text(row.min_on), to: text(row.max_on) }
}

function classAmounts(type: TransactionType, bankId: number | null, from: string | null, to: string | null): ClassAmount[] {
  const bank =
    bankId === null
      ? { sql: '', bind: [] as SqlBind[] }
      : type === 'transfer'
        ? bankTouch(bankId)
        : { sql: 't.bank_id = ?', bind: [bankId] as SqlBind[] }
  const where = whereAnd([{ sql: 't.type = ?', bind: [type] }, bank, dateClause(from, to)])
  return database()
    .selectObjects(
      `
        SELECT c.id AS class_id, c.name AS class_name,
               SUM(p.amount_cents) AS amount_cents,
               COUNT(DISTINCT t.id) AS n
        FROM transaction_parts AS p
        JOIN transactions AS t ON t.id = p.transaction_id
        JOIN classes AS c ON c.id = p.class_id
        ${where.sql}
        GROUP BY c.id
        ORDER BY amount_cents DESC, c.name COLLATE NOCASE
      `,
      where.bind,
    )
    .map((row) => ({
      classId: metric(row.class_id),
      className: text(row.class_name),
      amountCents: metric(row.amount_cents),
      count: metric(row.n),
    }))
}

function subclassAmounts(
  type: 'debit' | 'credit',
  bankId: number | null,
  from: string | null,
  to: string | null,
): SubclassAmount[] {
  const bank = bankId === null ? { sql: '', bind: [] as SqlBind[] } : { sql: 't.bank_id = ?', bind: [bankId] as SqlBind[] }
  const where = whereAnd([{ sql: 't.type = ?', bind: [type] }, bank, dateClause(from, to)])
  return database()
    .selectObjects(
      `
        SELECT c.name AS class_name,
               COALESCE(s.name, 'Sem subclasse') AS subclass_name,
               SUM(p.amount_cents) AS amount_cents
        FROM transaction_parts AS p
        JOIN transactions AS t ON t.id = p.transaction_id
        JOIN classes AS c ON c.id = p.class_id
        LEFT JOIN subclasses AS s ON s.id = p.subclass_id
        ${where.sql}
        GROUP BY c.id, p.subclass_id
        ORDER BY amount_cents DESC, class_name COLLATE NOCASE
        LIMIT 12
      `,
      where.bind,
    )
    .map((row) => ({
      className: text(row.class_name),
      subclassName: text(row.subclass_name),
      amountCents: metric(row.amount_cents),
    }))
}

function titleAmounts(
  type: 'debit' | 'credit',
  bankId: number | null,
  from: string | null,
  to: string | null,
): TitleAmount[] {
  const bank = bankId === null ? { sql: '', bind: [] as SqlBind[] } : { sql: 't.bank_id = ?', bind: [bankId] as SqlBind[] }
  const where = whereAnd([{ sql: 't.type = ?', bind: [type] }, bank, dateClause(from, to)])
  return database()
    .selectObjects(
      `
        SELECT MIN(t.title) AS title, SUM(t.amount_cents) AS amount_cents, COUNT(*) AS n
        FROM transactions AS t
        ${where.sql}
        GROUP BY t.title COLLATE NOCASE
        ORDER BY amount_cents DESC, title COLLATE NOCASE
        LIMIT 10
      `,
      where.bind,
    )
    .map((row) => ({
      title: text(row.title),
      amountCents: metric(row.amount_cents),
      count: metric(row.n),
    }))
}

function largestMovement(
  type: 'debit' | 'credit',
  bankId: number | null,
  from: string | null,
  to: string | null,
): LargestMovement | null {
  const bank = bankId === null ? { sql: '', bind: [] as SqlBind[] } : { sql: 't.bank_id = ?', bind: [bankId] as SqlBind[] }
  const where = whereAnd([{ sql: 't.type = ?', bind: [type] }, bank, dateClause(from, to)])
  const row = database().selectObject(
    `
      SELECT t.title AS title, t.amount_cents AS amount_cents, t.occurred_on AS occurred_on
      FROM transactions AS t
      ${where.sql}
      ORDER BY t.amount_cents DESC, t.occurred_on DESC, t.id DESC
      LIMIT 1
    `,
    where.bind,
  )
  if (!row) return null
  return {
    title: text(row.title),
    amountCents: metric(row.amount_cents),
    occurredOn: text(row.occurred_on),
  }
}

function unclassifiedTotals(bankId: number | null, from: string | null, to: string | null) {
  const source = bankId === null ? '1 = 1' : 't.bank_id = ?'
  const sourceBind = bankId === null ? [] : [bankId]
  const gap = `MAX(0, t.amount_cents - COALESCE((SELECT SUM(p.amount_cents) FROM transaction_parts AS p WHERE p.transaction_id = t.id), 0))`
  const date = dateClause(from, to)
  const row = database().selectObject(
    `
      SELECT
        COALESCE(SUM(CASE WHEN t.type = 'debit' AND ${source} THEN ${gap} ELSE 0 END), 0) AS debit_cents,
        COALESCE(SUM(CASE WHEN t.type = 'debit' AND ${source} AND ${gap} > 0 THEN 1 ELSE 0 END), 0) AS debit_count,
        COALESCE(SUM(CASE WHEN t.type = 'credit' AND ${source} THEN ${gap} ELSE 0 END), 0) AS credit_cents,
        COALESCE(SUM(CASE WHEN t.type = 'credit' AND ${source} AND ${gap} > 0 THEN 1 ELSE 0 END), 0) AS credit_count
      FROM transactions AS t
      ${date.sql ? `WHERE ${date.sql}` : ''}
    `,
    [...sourceBind, ...sourceBind, ...sourceBind, ...sourceBind, ...date.bind],
  )
  return {
    unclassifiedDebitCents: metric(row?.debit_cents),
    unclassifiedDebitCount: metric(row?.debit_count),
    unclassifiedCreditCents: metric(row?.credit_cents),
    unclassifiedCreditCount: metric(row?.credit_count),
  }
}

function debitStack(bankId: number | null, from: string | null, to: string | null, months: string[]): StackedFlow {
  const bank = bankId === null ? { sql: '', bind: [] as SqlBind[] } : { sql: 't.bank_id = ?', bind: [bankId] as SqlBind[] }
  const where = whereAnd([{ sql: "t.type = 'debit'", bind: [] }, bank, dateClause(from, to)])
  const gap = `MAX(0, t.amount_cents - COALESCE((SELECT SUM(p.amount_cents) FROM transaction_parts AS p WHERE p.transaction_id = t.id), 0))`
  const rows = database().selectObjects(
    `
      SELECT substr(t.occurred_on, 1, 7) AS month, c.name AS name, SUM(p.amount_cents) AS amount_cents
      FROM transaction_parts AS p
      JOIN transactions AS t ON t.id = p.transaction_id
      JOIN classes AS c ON c.id = p.class_id
      ${where.sql}
      GROUP BY month, c.id
      UNION ALL
      SELECT substr(t.occurred_on, 1, 7) AS month, 'Sem classe' AS name, SUM(${gap}) AS amount_cents
      FROM transactions AS t
      ${where.sql}
      GROUP BY month
      HAVING amount_cents > 0
    `,
    [...where.bind, ...where.bind],
  )
  return pivotStack(
    rows.map((row) => ({
      month: text(row.month),
      name: text(row.name),
      amountCents: metric(row.amount_cents),
    })),
    months,
  )
}

function pivotStack(rows: { month: string; name: string; amountCents: number }[], months: string[]): StackedFlow {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.amountCents <= 0) continue
    totals.set(row.name, (totals.get(row.name) ?? 0) + row.amountCents)
  }
  const unclassified = totals.get('Sem classe') ?? 0
  totals.delete('Sem classe')
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  const names = ranked.slice(0, 5).map(([name]) => name)
  if (unclassified > 0) names.push('Sem classe')
  if (ranked.length > 5) names.push('Outras')
  const series = names.map((name) => ({ name, values: months.map(() => 0) }))
  const seriesAt = new Map(series.map((item, index) => [item.name, index]))
  const monthAt = new Map(months.map((month, index) => [month, index]))
  const otherIndex = seriesAt.get('Outras')
  for (const row of rows) {
    if (row.amountCents <= 0) continue
    const monthIndex = monthAt.get(row.month)
    if (monthIndex === undefined) continue
    const seriesIndex = seriesAt.get(row.name) ?? otherIndex
    if (seriesIndex === undefined) continue
    series[seriesIndex].values[monthIndex] += row.amountCents
  }
  return { months, series }
}

function bankPeriods(from: string | null, to: string | null, banks: Bank[]): BankPeriod[] {
  const date = dateClause(from, to)
  const on = ['(t.bank_id = b.id OR t.destination_bank_id = b.id)']
  if (date.sql) on.push(date.sql)
  const balanceOf = new Map(banks.map((bank) => [bank.id, bank.balanceCents]))
  return database()
    .selectObjects(
      `
        SELECT
          b.id AS bank_id,
          b.name AS bank_name,
          COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.bank_id = b.id THEN t.amount_cents ELSE 0 END), 0) AS credit_cents,
          COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.bank_id = b.id THEN t.amount_cents ELSE 0 END), 0) AS debit_cents,
          COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.destination_bank_id = b.id THEN t.amount_cents ELSE 0 END), 0) AS transfer_in_cents,
          COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.bank_id = b.id THEN t.amount_cents ELSE 0 END), 0) AS transfer_out_cents
        FROM banks AS b
        LEFT JOIN transactions AS t ON ${on.join(' AND ')}
        GROUP BY b.id
        ORDER BY b.name COLLATE NOCASE, b.id
      `,
      date.bind,
    )
    .map((row) => {
      const bankId = metric(row.bank_id)
      return {
        bankId,
        bankName: text(row.bank_name),
        balanceCents: balanceOf.get(bankId) ?? 0,
        creditCents: metric(row.credit_cents),
        debitCents: metric(row.debit_cents),
        transferInCents: metric(row.transfer_in_cents),
        transferOutCents: metric(row.transfer_out_cents),
      }
    })
}

function weekdaysOf(bankId: number | null, from: string | null, to: string | null): WeekdayFlow[] {
  const sums = flowSums(bankId)
  const where = whereAnd([bankTouch(bankId), dateClause(from, to)])
  const rows = database().selectObjects(
    `
      SELECT CAST(strftime('%w', t.occurred_on) AS INTEGER) AS weekday,
        ${sums.sql}
      FROM transactions AS t
      ${where.sql}
      GROUP BY weekday
    `,
    [...sums.bind, ...where.bind],
  )
  const byDay = new Map(rows.map((row) => [metric(row.weekday), mapFlow('', row)]))
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const row = byDay.get(weekday)
    return {
      weekday,
      creditCents: row?.creditCents ?? 0,
      debitCents: row?.debitCents ?? 0,
    }
  })
}

function transferPeers(bankId: number, from: string | null, to: string | null): TransferPeer[] {
  const date = dateClause(from, to)
  const rows = database().selectObjects(
    `
      SELECT
        other.name AS bank_name,
        CASE WHEN t.bank_id = ? THEN 'out' ELSE 'in' END AS direction,
        SUM(t.amount_cents) AS amount_cents
      FROM transactions AS t
      JOIN banks AS other
        ON other.id = CASE WHEN t.bank_id = ? THEN t.destination_bank_id ELSE t.bank_id END
      WHERE t.type = 'transfer'
        AND (t.bank_id = ? OR t.destination_bank_id = ?)
        ${date.sql ? `AND ${date.sql}` : ''}
      GROUP BY other.id, direction
      ORDER BY amount_cents DESC, bank_name COLLATE NOCASE
    `,
    [bankId, bankId, bankId, bankId, ...date.bind],
  )
  return rows.map((row) => {
    const direction = row.direction
    if (direction !== 'in' && direction !== 'out') throw new Error('Não foi possível montar o resumo.')
    return {
      bankName: text(row.bank_name),
      direction,
      amountCents: metric(row.amount_cents),
    }
  })
}

function balanceSeries(bankId: number | null, openingCents: number, months: FlowMonth[]): BalancePoint[] {
  // Transferência entre contas some no total e entra no saldo de cada banco.
  let running = openingCents
  const points: BalancePoint[] = [{ label: 'início', balanceCents: openingCents }]
  for (const month of months) {
    const net =
      bankId === null
        ? month.creditCents - month.debitCents
        : month.creditCents + month.transferInCents - month.debitCents - month.transferOutCents
    running += net
    points.push({ label: month.month, balanceCents: running })
  }
  return points
}

function sumFlows(months: FlowMonth[]) {
  return months.reduce(
    (total, month) => ({
      creditCents: total.creditCents + month.creditCents,
      debitCents: total.debitCents + month.debitCents,
      transferInCents: total.transferInCents + month.transferInCents,
      transferOutCents: total.transferOutCents + month.transferOutCents,
      demonstrativeCents: total.demonstrativeCents + month.demonstrativeCents,
      creditCount: total.creditCount + month.creditCount,
      debitCount: total.debitCount + month.debitCount,
    }),
    {
      creditCents: 0,
      debitCents: 0,
      transferInCents: 0,
      transferOutCents: 0,
      demonstrativeCents: 0,
      creditCount: 0,
      debitCount: 0,
    },
  )
}

function loadDashboard(payload: unknown): DashboardSnapshot {
  const query = readDashboardQuery(payload)
  if (query.bankId !== null && !exists('SELECT id FROM banks WHERE id = ?', [query.bankId])) {
    throw new Error('Banco não encontrado.')
  }
  const banks = listBanks()
  const balanceCents =
    query.bankId === null
      ? banks.reduce((sum, bank) => sum + bank.balanceCents, 0)
      : (banks.find((bank) => bank.id === query.bankId)?.balanceCents ?? 0)
  const range =
    query.from && query.to ? { from: query.from, to: query.to } : activityRange(query.bankId)
  const monthKeys = range ? eachMonth(range.from, range.to) : []
  const rawMonths = groupedFlows(query.bankId, query.from, query.to, 'month')
  const byMonth = new Map(rawMonths.map((month) => [month.month, month]))
  const months = monthKeys.map((month) => byMonth.get(month) ?? emptyFlow(month))
  const totals = sumFlows(months)
  const openingCents = openingBalance(query.bankId, range?.from ?? null)
  let days: DailyFlow[] = []
  if (range && daySpan(range.from, range.to) <= 100) {
    const rawDays = groupedFlows(query.bankId, range.from, range.to, 'day')
    const byDay = new Map(rawDays.map((day) => [day.month, day]))
    days = eachDay(range.from, range.to).map((day) => {
      const row = byDay.get(day)
      return { day, creditCents: row?.creditCents ?? 0, debitCents: row?.debitCents ?? 0 }
    })
  }
  const gaps = unclassifiedTotals(query.bankId, query.from, query.to)
  return {
    balanceCents,
    openingCents,
    ...totals,
    ...gaps,
    largestDebit: largestMovement('debit', query.bankId, query.from, query.to),
    largestCredit: largestMovement('credit', query.bankId, query.from, query.to),
    months,
    balanceSeries: monthKeys.length > 0 ? balanceSeries(query.bankId, openingCents, months) : [],
    days,
    weekdays: weekdaysOf(query.bankId, query.from, query.to),
    debitClasses: classAmounts('debit', query.bankId, query.from, query.to),
    creditClasses: classAmounts('credit', query.bankId, query.from, query.to),
    transferClasses: classAmounts('transfer', query.bankId, query.from, query.to),
    debitSubclasses: subclassAmounts('debit', query.bankId, query.from, query.to),
    creditSubclasses: subclassAmounts('credit', query.bankId, query.from, query.to),
    debitStack: debitStack(query.bankId, query.from, query.to, monthKeys),
    banks: bankPeriods(query.from, query.to, banks),
    debitTitles: titleAmounts('debit', query.bankId, query.from, query.to),
    creditTitles: titleAmounts('credit', query.bankId, query.from, query.to),
    transferPeers: query.bankId === null ? [] : transferPeers(query.bankId, query.from, query.to),
  }
}

function readMatchKind(value: unknown): ImportMatchKind {
  if (value === 'equals' || value === 'contains') return value
  throw new Error('Escolha se a regra é igual ou contém.')
}

function readRuleEffect(value: unknown): ImportRuleEffect {
  if (value === 'classify' || value === 'skip') return value
  throw new Error('Escolha se a regra classifica ou não infere.')
}

function mapImportRule(row: Record<string, SqlValue>): ImportRule {
  return {
    id: asNumber(row.id),
    bankId: asNumber(row.bank_id),
    matchKind: readMatchKind(row.match_kind),
    pattern: text(row.pattern),
    effect: readRuleEffect(row.effect),
    classId: optionalNumber(row.class_id),
    subclassId: optionalNumber(row.subclass_id),
    description: text(row.description),
  }
}

function listImportRules(payload: unknown): ImportRule[] {
  const bankId = readId(payload)
  if (!exists('SELECT id FROM banks WHERE id = ?', [bankId])) throw new Error('Banco não encontrado.')
  return database()
    .selectObjects(
      `SELECT id, bank_id, match_kind, pattern, effect, class_id, subclass_id, description
       FROM import_rules
       WHERE bank_id = ?
       ORDER BY id`,
      [bankId],
    )
    .map(mapImportRule)
}

function saveImportRule(payload: unknown): ImportRule {
  if (!isRecord(payload)) throw new Error('Informe o texto da regra.')
  const bankId = readId({ id: payload.bankId })
  const effect = readRuleEffect(payload.effect)
  const matchKind = readMatchKind(payload.matchKind)
  if (typeof payload.pattern !== 'string' || !payload.pattern.trim()) throw new Error('Informe o texto da regra.')
  const pattern = payload.pattern.trim()
  if (matchKind === 'contains' && !/[^\s%_]/u.test(pattern)) throw new Error('Informe o texto da regra.')
  const description = effect === 'skip' || typeof payload.description !== 'string' ? '' : payload.description.trim()
  const classId = effect === 'skip' ? null : readId({ id: payload.classId })
  const subclassId =
    effect === 'skip' || payload.subclassId === null || payload.subclassId === undefined || payload.subclassId === ''
      ? null
      : readId({ id: payload.subclassId })
  if (!exists('SELECT id FROM banks WHERE id = ?', [bankId])) throw new Error('Banco não encontrado.')
  if (classId !== null && !exists('SELECT id FROM classes WHERE id = ?', [classId])) {
    throw new Error('Classe não encontrada.')
  }
  if (subclassId !== null) {
    const owner = database().selectValue('SELECT class_id FROM subclasses WHERE id = ?', [subclassId])
    if (owner === undefined) throw new Error('Subclasse não encontrada.')
    if (classId === null || asNumber(owner) !== classId) throw new Error('A subclasse não pertence à classe escolhida.')
  }
  const stamp = now()
  const existing = database().selectValue(
    'SELECT id FROM import_rules WHERE bank_id = ? AND match_kind = ? AND pattern = ? COLLATE NOCASE',
    [bankId, matchKind, pattern],
  )
  const saved = { bankId, matchKind, pattern, effect, classId, subclassId, description }
  if (existing !== undefined) {
    const id = asNumber(existing)
    database().exec({
      sql: `UPDATE import_rules
            SET pattern = ?, effect = ?, class_id = ?, subclass_id = ?, description = ?, updated_at = ?
            WHERE id = ?`,
      bind: [pattern, effect, classId, subclassId, description, stamp, id],
    })
    return { id, ...saved }
  }
  database().exec({
    sql: `INSERT INTO import_rules (
            bank_id, match_kind, pattern, effect, class_id, subclass_id, description, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [bankId, matchKind, pattern, effect, classId, subclassId, description, stamp, stamp],
  })
  return {
    id: asNumber(database().selectValue('SELECT last_insert_rowid()') ?? 0),
    ...saved,
  }
}

function readChangeAction(value: SqlValue): ImportChangeAction {
  if (value === 'create' || value === 'update' || value === 'delete') return value
  throw new Error('Não foi possível concluir a operação.')
}

function listImportBatches(): ImportBatch[] {
  return database()
    .selectObjects(`
      SELECT
        b.id,
        b.bank_id,
        k.name AS bank_name,
        b.created_at,
        COALESCE(SUM(CASE WHEN c.action = 'create' AND c.type = 'debit' THEN 1 ELSE 0 END), 0) AS created_debit,
        COALESCE(SUM(CASE WHEN c.action = 'create' AND c.type = 'credit' THEN 1 ELSE 0 END), 0) AS created_credit,
        COALESCE(SUM(CASE WHEN c.action = 'create' AND c.type = 'transfer' THEN 1 ELSE 0 END), 0) AS created_transfer,
        COALESCE(SUM(CASE WHEN c.action = 'create' AND c.type = 'demonstrative' THEN 1 ELSE 0 END), 0) AS created_demonstrative,
        COALESCE(SUM(CASE WHEN c.reverted_at IS NULL THEN 1 ELSE 0 END), 0) AS pending_count
      FROM import_batches AS b
      JOIN banks AS k ON k.id = b.bank_id
      LEFT JOIN import_changes AS c ON c.batch_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC, b.id DESC
    `)
    .map((row) => ({
      id: asNumber(row.id),
      bankId: asNumber(row.bank_id),
      bankName: text(row.bank_name),
      createdAt: text(row.created_at),
      createdDebit: asNumber(row.created_debit),
      createdCredit: asNumber(row.created_credit),
      createdTransfer: asNumber(row.created_transfer),
      createdDemonstrative: asNumber(row.created_demonstrative),
      pending: asNumber(row.pending_count),
    }))
}

function listImportChanges(payload: unknown): ImportChange[] {
  const batchId = readId(payload)
  if (!exists('SELECT id FROM import_batches WHERE id = ?', [batchId])) {
    throw new Error('Importação não encontrada.')
  }
  return database()
    .selectObjects(
      `
        SELECT id, action, type, title, amount_cents, occurred_on, reverted_at, transaction_id
        FROM import_changes
        WHERE batch_id = ?
        ORDER BY occurred_on, id
      `,
      [batchId],
    )
    .map((row) => {
      const type = row.type
      if (!isTransactionType(type)) throw new Error('Não foi possível concluir a operação.')
      const revertedAt = optionalText(row.reverted_at)
      return {
        id: asNumber(row.id),
        action: readChangeAction(row.action),
        type,
        title: text(row.title),
        amountCents: asNumber(row.amount_cents),
        occurredOn: text(row.occurred_on),
        revertedAt,
        missing: revertedAt === null && (row.transaction_id === null || row.transaction_id === undefined),
      }
    })
}

function revertStoredChange(id: number, revertedAt: string) {
  const row = database().selectObject(
    'SELECT id, action, transaction_id, reverted_at FROM import_changes WHERE id = ?',
    [id],
  )
  if (!row) throw new Error('Alteração não encontrada.')
  if (row.reverted_at !== null) return
  const action = readChangeAction(row.action)
  if (action !== 'create') throw new Error('Esta alteração ainda não pode ser revertida.')
  const transactionId = optionalNumber(row.transaction_id)
  if (transactionId !== null) {
    database().exec({ sql: 'DELETE FROM transactions WHERE id = ?', bind: [transactionId] })
  }
  database().exec({
    sql: 'UPDATE import_changes SET reverted_at = ? WHERE id = ?',
    bind: [revertedAt, id],
  })
}

function revertImportChange(payload: unknown): void {
  const id = readId(payload)
  database().transaction(() => {
    revertStoredChange(id, now())
  })
}

function revertImportBatch(payload: unknown): void {
  const batchId = readId(payload)
  if (!exists('SELECT id FROM import_batches WHERE id = ?', [batchId])) {
    throw new Error('Importação não encontrada.')
  }
  const ids = database()
    .selectObjects('SELECT id FROM import_changes WHERE batch_id = ? AND reverted_at IS NULL', [batchId])
    .map((row) => asNumber(row.id))
  const stamp = now()
  database().transaction(() => {
    for (const id of ids) revertStoredChange(id, stamp)
  })
}

function deleteImportBatch(payload: unknown): void {
  const id = readId(payload)
  database().exec({ sql: 'DELETE FROM import_batches WHERE id = ?', bind: [id] })
  if (database().changes() === 0) throw new Error('Importação não encontrada.')
}

function dispatch(op: string, payload: unknown): unknown {
  switch (op) {
    case 'banks.list':
      return listBanks()
    case 'banks.create':
      return createBank(payload)
    case 'banks.update':
      return updateBank(payload)
    case 'banks.delete':
      deleteBank(payload)
      return null
    case 'classes.list':
      return listClasses()
    case 'classes.create':
      return createClass(payload)
    case 'classes.update':
      return updateClass(payload)
    case 'classes.delete':
      deleteClass(payload)
      return null
    case 'subclasses.list':
      return listSubclasses(payload)
    case 'subclasses.listAll':
      return listAllSubclasses()
    case 'subclasses.create':
      return createSubclass(payload)
    case 'subclasses.update':
      return updateSubclass(payload)
    case 'subclasses.delete':
      deleteSubclass(payload)
      return null
    case 'transactions.list':
      return listTransactions()
    case 'transactions.suggestDescriptions':
      return suggestDescriptions(payload)
    case 'transactions.save':
      return saveTransaction(payload)
    case 'transactions.delete':
      deleteTransaction(payload)
      return null
    case 'transactions.import':
      return importTransactions(payload)
    case 'imports.list':
      return listImportBatches()
    case 'imports.changes':
      return listImportChanges(payload)
    case 'imports.revertChange':
      revertImportChange(payload)
      return null
    case 'imports.revertBatch':
      revertImportBatch(payload)
      return null
    case 'imports.delete':
      deleteImportBatch(payload)
      return null
    case 'importRules.list':
      return listImportRules(payload)
    case 'importRules.save':
      return saveImportRule(payload)
    case 'dashboard.load':
      return loadDashboard(payload)
    default:
      throw new Error('Não foi possível concluir a operação.')
  }
}

function operationError(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.startsWith('Já existe') ||
      error.message.startsWith('Este ') ||
      error.message.startsWith('Esta ') ||
      error.message.startsWith('Escolha') ||
      error.message.startsWith('Informe') ||
      error.message.startsWith('A transferência') ||
      error.message.startsWith('A subclasse') ||
      error.message.endsWith('não encontrado.') ||
      error.message.endsWith('não encontrada.') ||
      error.message.startsWith('Não foi possível') ||
      error.message.startsWith('Identificador') ||
      error.message.startsWith('O banco') ||
      error.message.startsWith('O rateio') ||
      error.message.startsWith('A soma') ||
      error.message.startsWith('Não há')
    ) {
      return error.message
    }
    if (error.message.includes('UNIQUE')) return 'Já existe um registro com esse nome.'
    if (error.message.includes('FOREIGN KEY')) {
      return 'Não é possível excluir porque ainda existe um vínculo.'
    }
    if (error.message.includes('subclasse não pertence')) {
      return 'A subclasse não pertence à classe escolhida.'
    }
    if (error.message.includes('CHECK')) return 'Os dados do lançamento são inválidos.'
  }
  return 'Não foi possível concluir a operação.'
}

self.addEventListener('message', (event: MessageEvent<Incoming>) => {
  const data = event.data
  if (!data || typeof data.id !== 'number' || typeof data.op !== 'string') return
  try {
    const result = dispatch(data.op, data.payload)
    post({ id: data.id, ok: true, result })
  } catch (error) {
    post({ id: data.id, ok: false, error: operationError(error) })
  }
})

function tableExists(connection: Database, name: string): boolean {
  return (
    connection.selectValue("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]) !== undefined
  )
}

function openSchema(connection: Database) {
  if (!tableExists(connection, 'schema_migrations')) {
    connection.exec(schemaSql)
  } else {
    const version = asNumber(connection.selectValue('SELECT COALESCE(MAX(version), 0) FROM schema_migrations') ?? 0)
    if (version < 2) {
      connection.exec(migrateV2Sql)
      connection.exec({
        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)',
        bind: [new Date().toISOString()],
      })
    }
    if (version < 3) {
      connection.exec(migrateV3Sql)
      connection.exec({
        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)',
        bind: [new Date().toISOString()],
      })
    }
    if (version < 4) {
      connection.exec(migrateV4Sql)
      connection.exec({
        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)',
        bind: [new Date().toISOString()],
      })
    }
    if (version < 5) {
      connection.exec(migrateV5Sql)
      connection.exec({
        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)',
        bind: [new Date().toISOString()],
      })
    }
    if (version < 6) {
      connection.exec(migrateV6Sql)
      connection.exec({
        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)',
        bind: [new Date().toISOString()],
      })
    }
  }
  connection.exec('PRAGMA foreign_keys = ON')
  const foreignKeys = asNumber(connection.selectValue('PRAGMA foreign_keys') ?? 0)
  if (foreignKeys !== 1) throw new Error('Não foi possível abrir o banco neste navegador.')
}

async function init() {
  try {
    // SyncAccessHandle só existe em worker. A main thread não pode abrir o OPFS.
    const sqlite3 = await (sqlite3InitModule as SqliteInit)({
      locateFile(file) {
        return file.endsWith('sqlite3.wasm') ? wasmUrl : file
      },
      print() {},
      printErr(...args) {
        console.error(...args)
      },
    })
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: 'finback',
      directory: '.finback',
    })
    const connection = new pool.OpfsSAHPoolDb('/finback.sqlite3')
    connection.exec('PRAGMA foreign_keys = ON')
    openSchema(connection)
    db = connection
    post({ type: 'ready' })
  } catch (error) {
    console.error(error)
    post({ type: 'init-error', message: openError(error) })
  }
}

void init()
