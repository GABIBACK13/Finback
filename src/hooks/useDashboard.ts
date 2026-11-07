import { useEffect, useState } from 'react'
import { loadDashboard } from '../db/client.ts'
import type { DashboardSnapshot } from '../db/types.ts'
import { useDb } from './useDb.ts'

export function useDashboard(bankId: number | null, from: string | null, to: string | null) {
  const { status } = useDb()
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    setPending(true)
    loadDashboard({ bankId, from, to })
      .then((next) => {
        if (cancelled) return
        setSnapshot(next)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'Não foi possível montar o resumo.')
      })
      .finally(() => {
        if (cancelled) return
        setLoaded(true)
        setPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [status, bankId, from, to])

  return { snapshot, error, loaded, pending }
}
