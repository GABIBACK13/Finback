import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useBanks, type Bank, type BankKind } from '../hooks/useBanks.ts'
import { centsToInput, formatCents, parseReais } from '../lib/money.ts'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'
const primaryClass = 'rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50'
const quietClass = 'rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100'
const dangerClass = 'rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50'

function balanceClass(cents: number) {
  if (cents > 0) return 'text-sm font-medium text-emerald-700'
  if (cents < 0) return 'text-sm font-medium text-rose-700'
  return 'text-sm font-medium text-zinc-500'
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível salvar.'
}

function parseLimit(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '0' || trimmed === '0,00' || trimmed === '0.00') return 0
  return parseReais(trimmed)
}

export default function BanksPage() {
  const { banks, loaded, error, create, update, remove } = useBanks()
  const [kind, setKind] = useState<BankKind>('bank')
  const [name, setName] = useState('')
  const [parentBankId, setParentBankId] = useState('')
  const [closingDay, setClosingDay] = useState('')
  const [limit, setLimit] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editKind, setEditKind] = useState<BankKind>('bank')
  const [editName, setEditName] = useState('')
  const [editParentBankId, setEditParentBankId] = useState('')
  const [editClosingDay, setEditClosingDay] = useState('')
  const [editLimit, setEditLimit] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const regularBanks = banks.filter((b) => b.kind === 'bank')

  function startEdit(bank: Bank) {
    setEditingId(bank.id)
    setEditKind(bank.kind)
    setEditName(bank.name)
    setEditParentBankId(bank.parentBankId ? String(bank.parentBankId) : '')
    setEditClosingDay(bank.closingDay !== null ? String(bank.closingDay) : '')
    setEditLimit(bank.limitCents !== null ? centsToInput(bank.limitCents) : '')
    setPendingDeleteId(null)
    setFormError(null)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (kind === 'bank') {
        if (!name.trim()) {
          setFormError('Informe o nome do banco.')
          setSaving(false)
          return
        }
        await create({ name: name.trim(), kind: 'bank' })
      } else {
        if (!name.trim()) {
          setFormError('Informe o nome do cartão.')
          setSaving(false)
          return
        }
        if (!parentBankId) {
          setFormError('Escolha o banco da conta.')
          setSaving(false)
          return
        }
        const day = Number(closingDay)
        if (!closingDay || !Number.isInteger(day) || day < 1 || day > 31) {
          setFormError('Informe o dia de fechamento entre 1 e 31.')
          setSaving(false)
          return
        }
        const limitCents = parseLimit(limit)
        if (limitCents === null) {
          setFormError('Informe um limite válido.')
          setSaving(false)
          return
        }
        await create({
          name: name.trim(),
          kind: 'card',
          parentBankId: Number(parentBankId),
          closingDay: day,
          limitCents,
        })
      }
      setName('')
      setParentBankId('')
      setClosingDay('')
      setLimit('')
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onSaveEdit(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      if (editKind === 'bank') {
        if (!editName.trim()) {
          setFormError('Informe o nome do banco.')
          setSaving(false)
          return
        }
        await update(id, { name: editName.trim() })
      } else {
        if (!editName.trim()) {
          setFormError('Informe o nome do cartão.')
          setSaving(false)
          return
        }
        if (!editParentBankId) {
          setFormError('Escolha o banco da conta.')
          setSaving(false)
          return
        }
        const day = Number(editClosingDay)
        if (!editClosingDay || !Number.isInteger(day) || day < 1 || day > 31) {
          setFormError('Informe o dia de fechamento entre 1 e 31.')
          setSaving(false)
          return
        }
        const limitCents = parseLimit(editLimit)
        if (limitCents === null) {
          setFormError('Informe um limite válido.')
          setSaving(false)
          return
        }
        await update(id, {
          name: editName.trim(),
          parentBankId: Number(editParentBankId),
          closingDay: day,
          limitCents,
        })
      }
      setEditingId(null)
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
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bancos e Cartões</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Cada conta guarda o seu saldo. Lançamentos pagos no cartão debitam da conta vinculada; pendentes consomem o limite do cartão.
        </p>
      </div>

      <form onSubmit={onCreate} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex gap-2 border-b border-zinc-200 pb-3">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              kind === 'bank' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            onClick={() => setKind('bank')}
          >
            Conta
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              kind === 'card' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            onClick={() => setKind('card')}
          >
            Cartão
          </button>
        </div>

        {kind === 'bank' ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-zinc-600">Nome</span>
              <input
                className={fieldClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Sicredi, Nubank…"
                autoComplete="off"
              />
            </label>
            <button className={`${primaryClass} sm:self-end`} type="submit" disabled={saving}>
              Adicionar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {regularBanks.length === 0 ? (
              <p className="text-sm text-zinc-600">
                Cadastre primeiro uma conta para vincular ao cartão de crédito.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-zinc-600">Nome</span>
                    <input
                      className={fieldClass}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Mastercard Black, Visa…"
                      autoComplete="off"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-zinc-600">Banco</span>
                    <select
                      className={fieldClass}
                      value={parentBankId}
                      onChange={(event) => setParentBankId(event.target.value)}
                    >
                      <option value="">Escolha</option>
                      {regularBanks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-zinc-600">Dia de fechamento</span>
                    <input
                      className={fieldClass}
                      type="number"
                      min="1"
                      max="31"
                      value={closingDay}
                      onChange={(event) => setClosingDay(event.target.value)}
                      placeholder="1 a 31"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-zinc-600">Limite</span>
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      value={limit}
                      onChange={(event) => setLimit(event.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                </div>
                <button className={primaryClass} type="submit" disabled={saving}>
                  Adicionar cartão
                </button>
              </>
            )}
          </div>
        )}
      </form>

      {formError && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</p>
      )}
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      )}

      {loaded && banks.length === 0 ? (
        <p className="text-sm text-zinc-600">Nenhum banco ainda. Cadastre o primeiro, como Sicredi ou Nubank.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {banks.map((bank) => (
            <li key={bank.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              {editingId === bank.id ? (
                <form
                  className="flex flex-1 flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void onSaveEdit(bank.id)
                  }}
                >
                  {editKind === 'bank' ? (
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                      <input
                        className={fieldClass}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        autoComplete="off"
                      />
                      <button className={primaryClass} type="submit" disabled={saving}>
                        Salvar
                      </button>
                      <button className={quietClass} type="button" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm">
                          <span className="mb-1 block text-zinc-600">Nome</span>
                          <input
                            className={fieldClass}
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            autoComplete="off"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-zinc-600">Banco</span>
                          <select
                            className={fieldClass}
                            value={editParentBankId}
                            onChange={(event) => setEditParentBankId(event.target.value)}
                          >
                            <option value="">Escolha</option>
                            {regularBanks.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-zinc-600">Dia de fechamento</span>
                          <input
                            className={fieldClass}
                            type="number"
                            min="1"
                            max="31"
                            value={editClosingDay}
                            onChange={(event) => setEditClosingDay(event.target.value)}
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-zinc-600">Limite</span>
                          <input
                            className={fieldClass}
                            inputMode="decimal"
                            value={editLimit}
                            onChange={(event) => setEditLimit(event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button className={primaryClass} type="submit" disabled={saving}>
                          Salvar
                        </button>
                        <button className={quietClass} type="button" onClick={() => setEditingId(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              ) : (
                <>
                  <div>
                    {bank.kind === 'card' ? (
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/transacoes?banco=${bank.id}`}
                            className="font-medium text-zinc-900 hover:underline"
                            title="Ver movimentações deste cartão"
                          >
                            {bank.name}
                          </Link>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">Cartão</span>
                        </div>
                        <p className="text-sm text-zinc-600">
                          {bank.parentBankName} · Fecha no dia {bank.closingDay}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          Limite: {formatCents(bank.limitCents ?? 0)} · Usado: {formatCents(bank.usedLimitCents ?? 0)} ·{' '}
                          Disponível: {formatCents(bank.availableLimitCents ?? 0)}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Link
                          to={`/transacoes?banco=${bank.id}`}
                          className="font-medium text-zinc-900 hover:underline"
                          title="Ver movimentações desta conta"
                        >
                          {bank.name}
                        </Link>
                        <p className={balanceClass(bank.balanceCents)}>{formatCents(bank.balanceCents)}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Link
                      to={`/transacoes?banco=${bank.id}`}
                      className={quietClass}
                      title="Ver movimentações"
                    >
                      Movimentações
                    </Link>
                    <button className={quietClass} type="button" onClick={() => startEdit(bank)}>
                      {bank.kind === 'card' ? 'Editar' : 'Renomear'}
                    </button>
                    {pendingDeleteId === bank.id ? (
                      <>
                        <span className="px-2 py-2 text-sm text-zinc-600">
                          {bank.kind === 'card' ? 'Excluir este cartão?' : 'Excluir este banco?'}
                        </span>
                        <button
                          className={dangerClass}
                          type="button"
                          disabled={saving}
                          onClick={() => void onDelete(bank.id)}
                        >
                          Excluir
                        </button>
                        <button className={quietClass} type="button" onClick={() => setPendingDeleteId(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        className={dangerClass}
                        type="button"
                        onClick={() => {
                          setPendingDeleteId(bank.id)
                          setEditingId(null)
                        }}
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
