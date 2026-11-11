import { useCallback, useEffect, useState } from 'react'
import { createBank, deleteBank, listBanks, updateBank } from '../db/client.ts'
import type { Bank, BankInput, BankKind } from '../db/types.ts'
import { useDb } from './useDb.ts'

export type { Bank, BankInput, BankKind }

export function useBanks() {
  const { status } = useDb()
  const [banks, setBanks] = useState<Bank[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setBanks(await listBanks())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os bancos.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    void reload()
  }, [status, reload])

  const create = useCallback(
    async (input: BankInput | string) => {
      const created = await createBank(input)
      await reload()
      return created
    },
    [reload],
  )

  const update = useCallback(
    async (id: number, input: Partial<BankInput> | string) => {
      await updateBank(id, input)
      await reload()
    },
    [reload],
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteBank(id)
      await reload()
    },
    [reload],
  )

  return { banks, loaded, error, create, update, remove }
}
