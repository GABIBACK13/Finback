import { useState, type FormEvent } from 'react'
import { useClasses, type ClassScope } from '../hooks/useClasses.ts'
import { scopeLabel } from '../lib/classes.ts'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'
const primaryClass = 'rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50'
const quietClass = 'rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100'
const dangerClass = 'rounded-md px-3 py-2 text-sm text-rose-700 hover:bg-rose-50'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível salvar.'
}

export default function ClassesPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { classes, subclasses, loaded, error, create, update, remove, createChild, updateChild, removeChild } =
    useClasses(selectedId)
  const [className, setClassName] = useState('')
  const [classScope, setClassScope] = useState<ClassScope>(null)
  const [subclassName, setSubclassName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingClassId, setEditingClassId] = useState<number | null>(null)
  const [editingSubclassId, setEditingSubclassId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editScope, setEditScope] = useState<ClassScope>(null)
  const [pendingClassId, setPendingClassId] = useState<number | null>(null)
  const [pendingSubclassId, setPendingSubclassId] = useState<number | null>(null)

  const selected = classes.find((item) => item.id === selectedId) ?? null

  async function onCreateClass(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const created = await create(className, classScope)
      setClassName('')
      setClassScope(null)
      setSelectedId(created.id)
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onCreateSubclass(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await createChild(subclassName)
      setSubclassName('')
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onRenameClass(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await update(id, editName, editScope)
      setEditingClassId(null)
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onRenameSubclass(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await updateChild(id, editName)
      setEditingSubclassId(null)
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteClass(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await remove(id)
      if (selectedId === id) setSelectedId(null)
      setPendingClassId(null)
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteSubclass(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await removeChild(id)
      setPendingSubclassId(null)
    } catch (caught) {
      setFormError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Classificações</h1>
        <p className="mt-1 text-sm text-zinc-600">
          A subclasse pertence a uma classe. Vazia aparece em todos os lançamentos. Demonstrativo mostra todas.
        </p>
      </div>

      {formError && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <form onSubmit={onCreateClass} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">Nova classe</span>
              <input className={fieldClass} value={className} onChange={(event) => setClassName(event.target.value)} autoComplete="off" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">Aparece em</span>
              <select
                className={fieldClass}
                value={classScope ?? ''}
                onChange={(event) => setClassScope(event.target.value === '' ? null : (event.target.value as ClassScope))}
              >
                <option value="">Todos</option>
                <option value="debit">Débito</option>
                <option value="credit">Crédito</option>
                <option value="transfer">Transferência</option>
              </select>
            </label>
            <button className={primaryClass} type="submit" disabled={saving}>
              Adicionar classe
            </button>
          </form>

          {loaded && classes.length === 0 ? (
            <p className="text-sm text-zinc-600">Nenhuma classe ainda. Uma classe agrupa os lançamentos, como Moradia ou Alimentação.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {classes.map((item) => {
                const active = item.id === selectedId
                return (
                  <li key={item.id} className={active ? 'bg-zinc-50 px-4 py-3' : 'px-4 py-3'}>
                    {editingClassId === item.id ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void onRenameClass(item.id)
                        }}
                      >
                        <input className={fieldClass} value={editName} onChange={(event) => setEditName(event.target.value)} autoComplete="off" />
                        <select
                          className={fieldClass}
                          value={editScope ?? ''}
                          onChange={(event) => setEditScope(event.target.value === '' ? null : (event.target.value as ClassScope))}
                        >
                          <option value="">Todos</option>
                          <option value="debit">Débito</option>
                          <option value="credit">Crédito</option>
                          <option value="transfer">Transferência</option>
                        </select>
                        <div className="flex gap-1">
                          <button className={primaryClass} type="submit" disabled={saving}>
                            Salvar
                          </button>
                          <button className={quietClass} type="button" onClick={() => setEditingClassId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button className="text-left font-medium" type="button" onClick={() => setSelectedId(item.id)}>
                          {item.name}
                          <span className="ml-2 text-sm font-normal text-zinc-500">{scopeLabel(item.scope)}</span>
                        </button>
                        <div className="flex flex-wrap gap-1">
                          <button
                            className={quietClass}
                            type="button"
                            onClick={() => {
                              setEditingClassId(item.id)
                              setEditName(item.name)
                              setEditScope(item.scope)
                              setPendingClassId(null)
                            }}
                          >
                            Renomear
                          </button>
                          {pendingClassId === item.id ? (
                            <>
                              <span className="px-2 py-2 text-sm text-zinc-600">Excluir esta classe?</span>
                              <button className={dangerClass} type="button" disabled={saving} onClick={() => void onDeleteClass(item.id)}>
                                Excluir
                              </button>
                              <button className={quietClass} type="button" onClick={() => setPendingClassId(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button className={dangerClass} type="button" onClick={() => setPendingClassId(item.id)}>
                              Excluir
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <>
              <form onSubmit={onCreateSubclass} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-600">Nova subclasse de {selected.name}</span>
                  <input
                    className={fieldClass}
                    value={subclassName}
                    onChange={(event) => setSubclassName(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button className={primaryClass} type="submit" disabled={saving}>
                  Adicionar subclasse
                </button>
              </form>
              {subclasses.length === 0 ? (
                <p className="text-sm text-zinc-600">Nenhuma subclasse nesta classe.</p>
              ) : (
                <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
                  {subclasses.map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      {editingSubclassId === item.id ? (
                        <form
                          className="flex flex-col gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void onRenameSubclass(item.id)
                          }}
                        >
                          <input className={fieldClass} value={editName} onChange={(event) => setEditName(event.target.value)} autoComplete="off" />
                          <div className="flex gap-1">
                            <button className={primaryClass} type="submit" disabled={saving}>
                              Salvar
                            </button>
                            <button className={quietClass} type="button" onClick={() => setEditingSubclassId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-medium">{item.name}</p>
                          <div className="flex flex-wrap gap-1">
                            <button
                              className={quietClass}
                              type="button"
                              onClick={() => {
                                setEditingSubclassId(item.id)
                                setEditName(item.name)
                                setPendingSubclassId(null)
                              }}
                            >
                              Renomear
                            </button>
                            {pendingSubclassId === item.id ? (
                              <>
                                <span className="px-2 py-2 text-sm text-zinc-600">Excluir esta subclasse?</span>
                                <button className={dangerClass} type="button" disabled={saving} onClick={() => void onDeleteSubclass(item.id)}>
                                  Excluir
                                </button>
                                <button className={quietClass} type="button" onClick={() => setPendingSubclassId(null)}>
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button className={dangerClass} type="button" onClick={() => setPendingSubclassId(item.id)}>
                                Excluir
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-600">Escolha uma classe para ver as subclasses.</p>
          )}
        </div>
      </div>
    </section>
  )
}
