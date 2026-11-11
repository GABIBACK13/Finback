import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DescriptionField from './DescriptionField.tsx'
import ImportHistory from './ImportHistory.tsx'
import SplitEditor from './SplitEditor.tsx'
import { useBanks } from '../hooks/useBanks.ts'
import { useClassCatalog } from '../hooks/useClasses.ts'
import { useTransactions, type TransactionRecord, type TransactionType } from '../hooks/useTransactions.ts'
import { bankDisplayName } from '../lib/banks.ts'
import { formatDate, todayISO } from '../lib/dates.ts'
import { centsToInput, formatCents, parseReais } from '../lib/money.ts'
import { linesForSuggestion, partsFromSplitLines, splitLinesFromParts, withAnchor, type SplitLine } from '../lib/split.ts'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'
const primaryClass = 'rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50'
const quietClass = 'rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100'
const dangerClass = 'rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50'

const typeLabels: Record<TransactionType, string> = {
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferência',
  demonstrative: 'Demonstrativo',
}

type FormState = {
  id: number | null
  type: TransactionType
  title: string
  description: string
  notes: string
  amount: string
  occurredOn: string
  paid: boolean
  bankId: string
  destinationBankId: string
  lines: SplitLine[]
}

function emptyForm(defaultBankId = ''): FormState {
  return {
    id: null,
    type: 'debit',
    title: '',
    description: '',
    notes: '',
    amount: '',
    occurredOn: todayISO(),
    paid: true,
    bankId: defaultBankId,
    destinationBankId: '',
    lines: [],
  }
}

function isTransactionType(value: string): value is TransactionType {
  return value === 'debit' || value === 'credit' || value === 'transfer' || value === 'demonstrative'
}

function amountClass(type: TransactionType) {
  if (type === 'credit') return 'font-medium text-emerald-700'
  if (type === 'debit') return 'font-medium text-rose-700'
  if (type === 'demonstrative') return 'text-zinc-400'
  return 'font-medium text-zinc-700'
}

function amountText(type: TransactionType, cents: number) {
  const value = formatCents(cents)
  if (type === 'credit') return `+ ${value}`
  if (type === 'debit') return `− ${value}`
  return value
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível salvar.'
}

export default function TransactionsPage() {
  const { banks, loaded: banksLoaded } = useBanks()
  const { classes, subclasses, create: createClass, createChild } = useClassCatalog()
  const { transactions, loaded, error, save, remove, reload } = useTransactions()
  const historyRevision = transactions.map((transaction) => transaction.id).join(',')
  const [searchParams, setSearchParams] = useSearchParams()
  const filterBankIdParam = searchParams.get('banco')
  const filterBankId = filterBankIdParam ? Number(filterBankIdParam) : null
  const selectedFilterBank = banks.find((b) => b.id === filterBankId) ?? null
  const [includeCards, setIncludeCards] = useState(true)

  const defaultBankId = selectedFilterBank ? String(selectedFilterBank.id) : (filterBankIdParam ?? '')
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultBankId))
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const amountCents = parseReais(form.amount)

  const linkedCards = selectedFilterBank?.kind === 'bank'
    ? banks.filter((b) => b.parentBankId === selectedFilterBank.id)
    : []
  const linkedCardIds = new Set(linkedCards.map((b) => b.id))

  const filteredTransactions = transactions.filter((transaction) => {
    if (!selectedFilterBank) return true
    if (selectedFilterBank.kind === 'card') {
      return transaction.bankId === selectedFilterBank.id || transaction.destinationBankId === selectedFilterBank.id
    }
    if (transaction.bankId === selectedFilterBank.id || transaction.destinationBankId === selectedFilterBank.id) {
      return true
    }
    if (includeCards && linkedCardIds.has(transaction.bankId) && transaction.paid) {
      return true
    }
    return false
  })

  function edit(transaction: TransactionRecord) {
    setForm({
      id: transaction.id,
      type: transaction.type,
      title: transaction.title,
      description: transaction.description ?? '',
      notes: transaction.notes ?? '',
      amount: centsToInput(transaction.amountCents),
      occurredOn: transaction.occurredOn,
      paid: transaction.paid,
      bankId: String(transaction.bankId),
      destinationBankId: transaction.destinationBankId ? String(transaction.destinationBankId) : '',
      lines: withAnchor(splitLinesFromParts(transaction.parts), transaction.amountCents),
    })
    setFormError(null)
    setPendingDeleteId(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (amountCents === null) {
      setFormError('Informe um valor maior que zero.')
      return
    }
    if (!form.bankId) {
      setFormError('Escolha um banco.')
      return
    }
    if (form.type === 'transfer' && !form.destinationBankId) {
      setFormError('Escolha o banco de destino.')
      return
    }
    const parsed = partsFromSplitLines(form.lines)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    if (parsed.parts.length > 0) {
      const sum = parsed.parts.reduce((total, part) => total + part.amountCents, 0)
      if (sum !== amountCents) {
        setFormError('A soma das classes tem de ser igual ao valor do lançamento.')
        return
      }
    }
    setSaving(true)
    setFormError(null)
    try {
      await save({
        id: form.id,
        type: form.type,
        bankId: Number(form.bankId),
        destinationBankId: form.type === 'transfer' ? Number(form.destinationBankId) : null,
        title: form.title,
        description: form.description,
        notes: form.notes,
        amountCents,
        occurredOn: form.occurredOn,
        paid: form.paid,
        parts: parsed.parts,
      })
      setForm(emptyForm(selectedFilterBank ? String(selectedFilterBank.id) : ''))
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await remove(id)
      setPendingDeleteId(null)
      if (form.id === id) setForm(emptyForm(selectedFilterBank ? String(selectedFilterBank.id) : ''))
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Débito, crédito e transferência entram no saldo. Demonstrativo fica registrado e não mexe no saldo.
            </p>
          </div>
          <Link className={quietClass} to="/transacoes/importar">
            Importar extrato
          </Link>
        </div>
      </div>

      <ImportHistory revision={historyRevision} onChanged={() => void reload()} />

      {banksLoaded && banks.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Cadastre um banco antes do primeiro lançamento. <Link className="underline" to="/bancos">Ir para bancos</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">{form.id === null ? 'Novo lançamento' : 'Editar lançamento'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">Tipo</span>
              <select
                className={fieldClass}
                value={form.type}
                onChange={(event) => {
                  const value = event.target.value
                  if (!isTransactionType(value)) return
                  setForm((current) => ({
                    ...current,
                    type: value,
                    destinationBankId: value === 'transfer' ? current.destinationBankId : '',
                  }))
                }}
              >
                {(Object.keys(typeLabels) as TransactionType[]).map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">Data</span>
              <input
                className={fieldClass}
                type="date"
                value={form.occurredOn}
                onChange={(event) => setForm((current) => ({ ...current, occurredOn: event.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">Situação</span>
              <select
                className={fieldClass}
                value={form.paid ? 'paid' : 'pending'}
                onChange={(event) =>
                  setForm((current) => ({ ...current, paid: event.target.value === 'paid' }))
                }
              >
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-zinc-600">Título</span>
              <input
                className={fieldClass}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                required
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">Valor</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => {
                  const amount = event.target.value
                  const cents = parseReais(amount)
                  setForm((current) => ({
                    ...current,
                    amount,
                    lines: cents === null ? current.lines : withAnchor(current.lines, cents),
                  }))
                }}
                placeholder="0,00"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">{form.type === 'transfer' ? 'Banco de origem' : 'Banco'}</span>
              <select
                className={fieldClass}
                value={form.bankId}
                onChange={(event) => {
                  const value = event.target.value
                  setForm((current) => ({
                    ...current,
                    bankId: value,
                    destinationBankId: current.destinationBankId === value ? '' : current.destinationBankId,
                  }))
                }}
                required
              >
                <option value="">Escolha</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bankDisplayName(bank)}
                  </option>
                ))}
              </select>
            </label>
            {form.type === 'transfer' && (
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-600">Banco de destino</span>
                <select
                  className={fieldClass}
                  value={form.destinationBankId}
                  onChange={(event) => setForm((current) => ({ ...current, destinationBankId: event.target.value }))}
                  required
                >
                  <option value="">Escolha</option>
                  {banks
                    .filter((bank) => String(bank.id) !== form.bankId)
                    .map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bankDisplayName(bank)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <SplitEditor
              type={form.type}
              totalCents={amountCents}
              classes={classes}
              subclasses={subclasses}
              lines={form.lines}
              onChange={(lines) => setForm((current) => ({ ...current, lines }))}
              onCreateClass={createClass}
              onCreateSubclass={createChild}
            />
            <DescriptionField
              value={form.description}
              type={form.type}
              excludeId={form.id}
              onChange={(description) => setForm((current) => ({ ...current, description }))}
              onPick={(suggestion) =>
                setForm((current) => ({
                  ...current,
                  description: suggestion.description,
                  lines: linesForSuggestion(suggestion.parts, amountCents),
                }))
              }
            />
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-zinc-600">Observação</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primaryClass} type="submit" disabled={saving}>
              Salvar
            </button>
            {form.id !== null && (
              <button
                className={quietClass}
                type="button"
                onClick={() => setForm(emptyForm(selectedFilterBank ? String(selectedFilterBank.id) : ''))}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {formError && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="filter-bank" className="text-sm font-medium text-zinc-700">
              Filtrar por banco:
            </label>
            <select
              id="filter-bank"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
              value={selectedFilterBank ? String(selectedFilterBank.id) : ''}
              onChange={(event) => {
                const nextId = event.target.value
                setSearchParams((current) => {
                  const next = new URLSearchParams(current)
                  if (nextId) next.set('banco', nextId)
                  else next.delete('banco')
                  return next
                })
                if (form.id === null) {
                  setForm((current) => ({ ...current, bankId: nextId }))
                }
              }}
            >
              <option value="">Todos os bancos e cartões</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bankDisplayName(bank)}
                </option>
              ))}
            </select>
            {selectedFilterBank && (
              <button
                type="button"
                className={quietClass}
                onClick={() => {
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current)
                    next.delete('banco')
                    return next
                  })
                }}
              >
                Limpar filtro
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {filteredTransactions.length === 1 ? '1 lançamento' : `${filteredTransactions.length} lançamentos`}
          </p>
        </div>
        {selectedFilterBank?.kind === 'bank' && linkedCards.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCards}
              onChange={(e) => setIncludeCards(e.target.checked)}
              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            <span>
              Incluir compras pagas nos cartões vinculados ({linkedCards.map((c) => c.name).join(', ')})
            </span>
          </label>
        )}
      </div>

      {loaded && filteredTransactions.length === 0 ? (
        <p className="text-sm text-zinc-600">
          {transactions.length === 0
            ? 'Nenhum lançamento ainda.'
            : 'Nenhum lançamento encontrado para este filtro.'}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {filteredTransactions.map((transaction) => {
            const isCardPaidOnBank =
              selectedFilterBank?.kind === 'bank' && linkedCardIds.has(transaction.bankId)
            return (
              <li key={transaction.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{transaction.title}</p>
                      {!transaction.paid && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                          Pendente
                        </span>
                      )}
                      {isCardPaidOnBank && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                          Cartão: {transaction.bankName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600">
                      {formatDate(transaction.occurredOn)} · {typeLabels[transaction.type]} ·{' '}
                      {transaction.type === 'transfer'
                        ? `${transaction.bankName} → ${transaction.destinationBankName ?? ''}`
                        : transaction.bankName}
                      {transaction.externalId ? ` · ${transaction.externalId}` : ''}
                      {transaction.parts.length > 0
                        ? ` · ${transaction.parts
                            .map((part) =>
                              part.subclassName ? `${part.className} / ${part.subclassName}` : part.className,
                            )
                            .join(', ')}`
                        : ''}
                    </p>
                    {transaction.description && <p className="mt-1 text-sm text-zinc-700">{transaction.description}</p>}
                    {transaction.notes && <p className="text-sm text-zinc-500">Obs.: {transaction.notes}</p>}
                  </div>
                  <p className={amountClass(transaction.type)}>{amountText(transaction.type, transaction.amountCents)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button className={quietClass} type="button" onClick={() => edit(transaction)}>
                    Editar
                  </button>
                  {pendingDeleteId === transaction.id ? (
                    <>
                      <span className="px-2 py-2 text-sm text-zinc-600">Excluir este lançamento?</span>
                      <button className={dangerClass} type="button" disabled={saving} onClick={() => void onDelete(transaction.id)}>
                        Excluir
                      </button>
                      <button className={quietClass} type="button" onClick={() => setPendingDeleteId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button className={dangerClass} type="button" onClick={() => setPendingDeleteId(transaction.id)}>
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
