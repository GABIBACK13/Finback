import { useCallback, useEffect, useState } from 'react'
import {
  createClass,
  createSubclass,
  deleteClass,
  deleteSubclass,
  listAllSubclasses,
  listClasses,
  listSubclasses,
  updateClass,
  updateSubclass,
} from '../db/client.ts'
import type { ClassRecord, ClassScope, SubclassRecord } from '../db/types.ts'
import { useDb } from './useDb.ts'

export type { ClassRecord, ClassScope, SubclassRecord }

export function useClasses(classId: number | null) {
  const { status } = useDb()
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [subclasses, setSubclasses] = useState<SubclassRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reloadClasses = useCallback(async () => {
    try {
      setClasses(await listClasses())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as classes.')
    } finally {
      setLoaded(true)
    }
  }, [])

  const reloadSubclasses = useCallback(async () => {
    if (classId === null) {
      setSubclasses([])
      return
    }
    try {
      setSubclasses(await listSubclasses(classId))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as subclasses.')
    }
  }, [classId])

  useEffect(() => {
    if (status !== 'ready') return
    void reloadClasses()
  }, [status, reloadClasses])

  useEffect(() => {
    if (status !== 'ready') return
    void reloadSubclasses()
  }, [status, reloadSubclasses])

  const create = useCallback(
    async (name: string, scope: ClassScope) => {
      const created = await createClass(name, scope)
      await reloadClasses()
      return created
    },
    [reloadClasses],
  )

  const update = useCallback(
    async (id: number, name: string, scope: ClassScope) => {
      await updateClass(id, name, scope)
      await reloadClasses()
    },
    [reloadClasses],
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteClass(id)
      await reloadClasses()
    },
    [reloadClasses],
  )

  const createChild = useCallback(
    async (name: string) => {
      if (classId === null) throw new Error('Escolha uma classe.')
      await createSubclass(classId, name)
      await reloadSubclasses()
    },
    [classId, reloadSubclasses],
  )

  const updateChild = useCallback(
    async (id: number, name: string) => {
      await updateSubclass(id, name)
      await reloadSubclasses()
    },
    [reloadSubclasses],
  )

  const removeChild = useCallback(
    async (id: number) => {
      await deleteSubclass(id)
      await reloadSubclasses()
    },
    [reloadSubclasses],
  )

  return {
    classes,
    subclasses,
    loaded,
    error,
    create,
    update,
    remove,
    createChild,
    updateChild,
    removeChild,
  }
}

export function useClassCatalog() {
  const { status } = useDb()
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [subclasses, setSubclasses] = useState<SubclassRecord[]>([])

  const reload = useCallback(async () => {
    const [nextClasses, nextSubclasses] = await Promise.all([listClasses(), listAllSubclasses()])
    setClasses(nextClasses)
    setSubclasses(nextSubclasses)
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    void reload()
  }, [status, reload])

  const create = useCallback(
    async (name: string, scope: ClassScope) => {
      const created = await createClass(name, scope)
      await reload()
      return created
    },
    [reload],
  )

  const createChild = useCallback(
    async (classId: number, name: string) => {
      const created = await createSubclass(classId, name)
      await reload()
      return created
    },
    [reload],
  )

  return { classes, subclasses, reload, create, createChild }
}
