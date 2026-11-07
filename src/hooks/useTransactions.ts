import { useCallback, useEffect, useState } from 'react'
import { deleteTransaction, listTransactions, saveTransaction } from '../db/client.ts'
import type { TransactionInput, TransactionRecord, TransactionType } from '../db/types.ts'
import { useDb } from './useDb.ts'

export type { TransactionInput, TransactionRecord, TransactionType }

export function useTransactions() {
  const { status } = useDb()
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const next = await listTransactions()
      setTransactions(next)
      setError(null)
      return next
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os lançamentos.')
      return []
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    void reload()
  }, [status, reload])

  const save = useCallback(
    async (input: TransactionInput) => {
      await saveTransaction(input)
      await reload()
    },
    [reload],
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteTransaction(id)
      await reload()
    },
    [reload],
  )

  return { transactions, loaded, error, save, remove, reload }
}
