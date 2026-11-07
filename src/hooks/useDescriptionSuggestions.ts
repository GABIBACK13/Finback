import { useEffect, useState } from 'react'
import { suggestDescriptions } from '../db/client.ts'
import type { DescriptionSuggestion, TransactionType } from '../db/types.ts'
import { useDb } from './useDb.ts'

export function useDescriptionSuggestions(
  type: TransactionType | null,
  query: string,
  excludeId: number | null,
  enabled: boolean,
) {
  const { status } = useDb()
  const [items, setItems] = useState<DescriptionSuggestion[]>([])

  useEffect(() => {
    if (!enabled || status !== 'ready' || type === null || query.trim().length < 2) {
      setItems([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void suggestDescriptions(type, query, excludeId)
        .then((next) => {
          if (!cancelled) setItems(next)
        })
        .catch(() => {
          if (!cancelled) setItems([])
        })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, status, type, query, excludeId])

  return items
}
