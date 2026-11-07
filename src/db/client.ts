import type {
  Bank,
  ClassRecord,
  ClassScope,
  DashboardQuery,
  DashboardSnapshot,
  DescriptionSuggestion,
  ImportBatch,
  ImportChange,
  ImportRequest,
  ImportRule,
  ImportRuleInput,
  SubclassRecord,
  TransactionInput,
  TransactionRecord,
  TransactionType,
} from './types.ts'

export type DbSnapshot = {
  status: 'loading' | 'ready' | 'error'
  errorMessage: string
}

type Waiter = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type WorkerResponse = {
  id?: number
  ok?: boolean
  result?: unknown
  error?: string
  type?: string
  message?: string
}

const listeners = new Set<() => void>()
const pending = new Map<number, Waiter>()

let snapshot: DbSnapshot = { status: 'loading', errorMessage: '' }
let worker: Worker | null = null
let opening: Promise<void> | null = null
let nextId = 1

function setSnapshot(next: DbSnapshot) {
  if (snapshot.status === next.status && snapshot.errorMessage === next.errorMessage) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function subscribeDb(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDbSnapshot() {
  return snapshot
}

function failPending(message: string) {
  for (const waiter of pending.values()) waiter.reject(new Error(message))
  pending.clear()
}

function startWorker(): Promise<void> {
  const nextWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker = nextWorker
  return new Promise((resolve, reject) => {
    nextWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data
      if (data.type === 'ready') {
        setSnapshot({ status: 'ready', errorMessage: '' })
        resolve()
        return
      }
      if (data.type === 'init-error') {
        const message = data.message || 'Não foi possível abrir o banco neste navegador.'
        setSnapshot({ status: 'error', errorMessage: message })
        failPending(message)
        reject(new Error(message))
        return
      }
      if (typeof data.id !== 'number') return
      const waiter = pending.get(data.id)
      if (!waiter) return
      pending.delete(data.id)
      if (data.ok) waiter.resolve(data.result)
      else waiter.reject(new Error(data.error || 'Não foi possível concluir a operação.'))
    }
    nextWorker.onerror = () => {
      const message =
        snapshot.status === 'ready'
          ? 'A conexão com o banco foi interrompida.'
          : 'Não foi possível abrir o banco neste navegador.'
      setSnapshot({ status: 'error', errorMessage: message })
      failPending(message)
      reject(new Error(message))
    }
  })
}

export function openDb(): Promise<void> {
  opening ??= startWorker()
  return opening
}

function call<T>(op: string, payload?: unknown): Promise<T> {
  return openDb().then(
    () =>
      new Promise((resolve, reject) => {
        if (!worker || snapshot.status !== 'ready') {
          reject(new Error(snapshot.errorMessage || 'O banco não está disponível.'))
          return
        }
        const id = nextId
        nextId += 1
        pending.set(id, {
          resolve: (value) => resolve(value as T),
          reject,
        })
        worker.postMessage({ id, op, payload })
      }),
  )
}

export function listBanks() {
  return call<Bank[]>('banks.list')
}

export function createBank(name: string) {
  return call<Bank>('banks.create', { name })
}

export function updateBank(id: number, name: string) {
  return call<Bank>('banks.update', { id, name })
}

export function deleteBank(id: number) {
  return call<null>('banks.delete', { id })
}

export function listClasses() {
  return call<ClassRecord[]>('classes.list')
}

export function createClass(name: string, scope: ClassScope) {
  return call<ClassRecord>('classes.create', { name, scope })
}

export function updateClass(id: number, name: string, scope: ClassScope) {
  return call<ClassRecord>('classes.update', { id, name, scope })
}

export function deleteClass(id: number) {
  return call<null>('classes.delete', { id })
}

export function listSubclasses(classId: number) {
  return call<SubclassRecord[]>('subclasses.list', { id: classId })
}

export function listAllSubclasses() {
  return call<SubclassRecord[]>('subclasses.listAll')
}

export function createSubclass(classId: number, name: string) {
  return call<SubclassRecord>('subclasses.create', { classId, name })
}

export function updateSubclass(id: number, name: string) {
  return call<SubclassRecord>('subclasses.update', { id, name })
}

export function deleteSubclass(id: number) {
  return call<null>('subclasses.delete', { id })
}

export function listTransactions() {
  return call<TransactionRecord[]>('transactions.list')
}

export function suggestDescriptions(type: TransactionType, query: string, excludeId: number | null) {
  return call<DescriptionSuggestion[]>('transactions.suggestDescriptions', { type, query, excludeId })
}

export function saveTransaction(input: TransactionInput) {
  return call<TransactionRecord>('transactions.save', input)
}

export function deleteTransaction(id: number) {
  return call<null>('transactions.delete', { id })
}

export function importTransactions(request: ImportRequest) {
  return call<number>('transactions.import', request)
}

export function listImportRules(bankId: number) {
  return call<ImportRule[]>('importRules.list', { id: bankId })
}

export function saveImportRule(input: ImportRuleInput) {
  return call<ImportRule>('importRules.save', input)
}

export function loadDashboard(query: DashboardQuery) {
  return call<DashboardSnapshot>('dashboard.load', query)
}

export function listImportBatches() {
  return call<ImportBatch[]>('imports.list')
}

export function listImportChanges(id: number) {
  return call<ImportChange[]>('imports.changes', { id })
}

export function revertImportChange(id: number) {
  return call<null>('imports.revertChange', { id })
}

export function revertImportBatch(id: number) {
  return call<null>('imports.revertBatch', { id })
}

export function deleteImportBatch(id: number) {
  return call<null>('imports.delete', { id })
}
