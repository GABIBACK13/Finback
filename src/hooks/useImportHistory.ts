import { useCallback, useEffect, useState } from 'react'
import {
  deleteImportBatch,
  listImportBatches,
  listImportChanges,
  revertImportBatch,
  revertImportChange,
} from '../db/client.ts'
import type { ImportBatch, ImportChange } from '../db/types.ts'
import { useDb } from './useDb.ts'

export function useImportHistory(revision: string | number) {
  const { status } = useDb()
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [changes, setChanges] = useState<Record<number, ImportChange[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setBatches(await listImportBatches())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as importações.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    void reload()
  }, [status, revision, reload])

  const loadChanges = useCallback(async (id: number) => {
    const rows = await listImportChanges(id)
    setChanges((current) => ({ ...current, [id]: rows }))
    return rows
  }, [])

  const revertOne = useCallback(
    async (batchId: number, changeId: number) => {
      await revertImportChange(changeId)
      await reload()
      await loadChanges(batchId)
    },
    [loadChanges, reload],
  )

  const revertAll = useCallback(
    async (id: number) => {
      await revertImportBatch(id)
      await reload()
      await loadChanges(id)
    },
    [loadChanges, reload],
  )

  const removeHistory = useCallback(
    async (id: number) => {
      await deleteImportBatch(id)
      setChanges((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      await reload()
    },
    [reload],
  )

  return { batches, changes, loaded, error, loadChanges, revertOne, revertAll, removeHistory }
}
