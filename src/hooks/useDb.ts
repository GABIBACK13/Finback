import { useEffect, useSyncExternalStore } from 'react'
import { getDbSnapshot, openDb, subscribeDb } from '../db/client.ts'

export function useDb() {
  const snapshot = useSyncExternalStore(subscribeDb, getDbSnapshot, getDbSnapshot)
  useEffect(() => {
    void openDb().catch(() => undefined)
  }, [])
  return snapshot
}
