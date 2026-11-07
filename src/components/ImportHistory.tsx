import { useState } from 'react'
import { useImportHistory } from '../hooks/useImportHistory.ts'
import type { ImportBatch, TransactionType } from '../db/types.ts'
import { formatDate, formatStamp } from '../lib/dates.ts'
import { formatCents } from '../lib/money.ts'

const quietClass = 'rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50'
const dangerClass = 'rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50'

const typeLabels: Record<TransactionType, string> = {
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferência',
  demonstrative: 'Demonstrativo',
}

function amountClass(type: TransactionType) {
  if (type === 'credit') return 'text-sm font-medium text-emerald-700'
  if (type === 'debit') return 'text-sm font-medium text-rose-700'
  if (type === 'demonstrative') return 'text-sm text-zinc-400'
  return 'text-sm font-medium text-zinc-700'
}

function countText(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function createdSummary(batch: ImportBatch) {
  const parts = [
    batch.createdDebit > 0 ? countText(batch.createdDebit, 'débito', 'débitos') : '',
    batch.createdCredit > 0 ? countText(batch.createdCredit, 'crédito', 'créditos') : '',
    batch.createdTransfer > 0 ? countText(batch.createdTransfer, 'transferência', 'transferências') : '',
    batch.createdDemonstrative > 0 ? countText(batch.createdDemonstrative, 'demonstrativo', 'demonstrativos') : '',
  ].filter((part) => part.length > 0)
  return parts.length > 0 ? parts.join(' · ') : 'Nenhum lançamento gravado'
}

export default function ImportHistory({
  revision,
  onChanged,
}: {
  revision: string | number
  onChanged?: () => void
}) {
  const history = useImportHistory(revision)
  const [openId, setOpenId] = useState<number | null>(null)
  const [pending, setPending] = useState<{ id: number; kind: 'revert' | 'delete' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await task()
      onChanged?.()
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(id: number) {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setActionError(null)
    try {
      await history.loadChanges(id)
      setOpenId(id)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Não foi possível abrir a importação.')
    }
  }

  if (!history.loaded || history.batches.length === 0) {
    return history.error ? <p className="text-sm text-rose-700">{history.error}</p> : null
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Importações</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Reverter desfaz o que foi gravado. Excluir o histórico só tira o registro.
        </p>
      </div>
      {actionError && <p className="text-sm text-rose-700">{actionError}</p>}
      <ul className="space-y-3">
        {history.batches.map((batch) => {
          const open = openId === batch.id
          const rows = history.changes[batch.id] ?? []
          return (
            <li key={batch.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">
                    {formatStamp(batch.createdAt)} · {batch.bankName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {createdSummary(batch)}
                    {batch.pending === 0 ? ' · revertida' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button className={quietClass} type="button" onClick={() => void toggle(batch.id)}>
                    {open ? 'Ver menos' : 'Ver mais'}
                  </button>
                  {pending?.id === batch.id && pending.kind === 'revert' ? (
                    <>
                      <button
                        className={dangerClass}
                        type="button"
                        disabled={busy || batch.pending === 0}
                        onClick={() =>
                          void run(async () => {
                            await history.revertAll(batch.id)
                            setPending(null)
                          })
                        }
                      >
                        Confirmar reversão
                      </button>
                      <button className={quietClass} type="button" onClick={() => setPending(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      className={dangerClass}
                      type="button"
                      disabled={batch.pending === 0}
                      onClick={() => setPending({ id: batch.id, kind: 'revert' })}
                    >
                      Reverter tudo
                    </button>
                  )}
                  {pending?.id === batch.id && pending.kind === 'delete' ? (
                    <>
                      <button
                        className={dangerClass}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await history.removeHistory(batch.id)
                            if (openId === batch.id) setOpenId(null)
                            setPending(null)
                          })
                        }
                      >
                        Confirmar exclusão
                      </button>
                      <button className={quietClass} type="button" onClick={() => setPending(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      className={quietClass}
                      type="button"
                      onClick={() => setPending({ id: batch.id, kind: 'delete' })}
                    >
                      Excluir histórico
                    </button>
                  )}
                </div>
              </div>
              {open && (
                <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
                  {rows.map((change) => (
                    <li key={change.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{change.title}</p>
                        <p className="text-sm text-zinc-600">
                          {formatDate(change.occurredOn)} · {typeLabels[change.type]}
                          {change.action === 'update' ? ' · edição' : ''}
                          {change.action === 'delete' ? ' · exclusão' : ''}
                          {change.revertedAt ? ' · revertido' : ''}
                          {change.missing ? ' · já excluído' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={amountClass(change.type)}>{formatCents(change.amountCents)}</p>
                        {!change.revertedAt && !change.missing && change.action === 'create' && (
                          <button
                            className={dangerClass}
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => history.revertOne(batch.id, change.id))}
                          >
                            Reverter
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
