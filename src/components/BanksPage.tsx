import { useState, type FormEvent } from 'react'
import { useBanks } from '../hooks/useBanks.ts'
import { formatCents } from '../lib/money.ts'

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

export default function BanksPage() {
  const { banks, loaded, error, create, update, remove } = useBanks()
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await create(name)
      setName('')
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onRename(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await update(id, editName)
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
        <h1 className="text-2xl font-semibold tracking-tight">Bancos</h1>
        <p className="mt-1 text-sm text-zinc-600">Cada banco guarda o próprio saldo.</p>
      </div>

      <form onSubmit={onCreate} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row">
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
      </form>

      {formError && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      {loaded && banks.length === 0 ? (
        <p className="text-sm text-zinc-600">Nenhum banco ainda. Cadastre o primeiro, como Sicredi ou Nubank.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {banks.map((bank) => (
            <li key={bank.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              {editingId === bank.id ? (
                <form
                  className="flex flex-1 flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void onRename(bank.id)
                  }}
                >
                  <input className={fieldClass} value={editName} onChange={(event) => setEditName(event.target.value)} autoComplete="off" />
                  <button className={primaryClass} type="submit" disabled={saving}>
                    Salvar
                  </button>
                  <button className={quietClass} type="button" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="font-medium">{bank.name}</p>
                    <p className={balanceClass(bank.balanceCents)}>{formatCents(bank.balanceCents)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      className={quietClass}
                      type="button"
                      onClick={() => {
                        setEditingId(bank.id)
                        setEditName(bank.name)
                        setPendingDeleteId(null)
                      }}
                    >
                      Renomear
                    </button>
                    {pendingDeleteId === bank.id ? (
                      <>
                        <span className="px-2 py-2 text-sm text-zinc-600">Excluir este banco?</span>
                        <button className={dangerClass} type="button" disabled={saving} onClick={() => void onDelete(bank.id)}>
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
