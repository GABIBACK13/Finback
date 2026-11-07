import { useRef, useState } from 'react'
import type { ClassRecord, ClassScope, SubclassRecord } from '../hooks/useClasses.ts'
import type { TransactionType } from '../hooks/useTransactions.ts'
import { classFitsType, scopeForType } from '../lib/classes.ts'
import { formatCents, parseReais } from '../lib/money.ts'
import { emptySplitLine, withAnchor, type SplitLine } from '../lib/split.ts'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'
const quietClass = 'rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100'

type SplitEditorProps = {
  type: TransactionType
  totalCents: number | null
  classes: ClassRecord[]
  subclasses: SubclassRecord[]
  lines: SplitLine[]
  onChange: (lines: SplitLine[]) => void
  onCreateClass: (name: string, scope: ClassScope) => Promise<ClassRecord>
  onCreateSubclass: (classId: number, name: string) => Promise<SubclassRecord>
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível cadastrar.'
}

export default function SplitEditor({
  type,
  totalCents,
  classes,
  subclasses,
  lines,
  onChange,
  onCreateClass,
  onCreateSubclass,
}: SplitEditorProps) {
  const anchorSeed = useRef(emptySplitLine())
  const [creating, setCreating] = useState(false)
  const [classChoice, setClassChoice] = useState('new')
  const [className, setClassName] = useState('')
  const [subclassName, setSubclassName] = useState('')
  const [scope, setScope] = useState<ClassScope>(scopeForType(type))
  const [createError, setCreateError] = useState<string | null>(null)
  const [savingClass, setSavingClass] = useState(false)

  const shown = withAnchor(lines.length > 0 ? lines : [anchorSeed.current], totalCents)
  const creatableClasses = classes.filter((item) => classFitsType(item.scope, type, item.id, null))

  function commit(next: SplitLine[]) {
    onChange(withAnchor(next, totalCents))
  }

  function update(key: string, patch: Partial<SplitLine>) {
    commit(shown.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function openCreate() {
    setCreating(true)
    setClassChoice('new')
    setClassName('')
    setSubclassName('')
    setScope(scopeForType(type))
    setCreateError(null)
  }

  function place(classId: string, subclassId: string) {
    const target = [...shown].reverse().find((line) => !line.classId)
    if (!target) {
      commit([...shown, { ...emptySplitLine(), classId, subclassId }])
      return
    }
    commit(shown.map((line) => (line.key === target.key ? { ...line, classId, subclassId } : line)))
  }

  async function saveClass() {
    setSavingClass(true)
    setCreateError(null)
    try {
      if (classChoice === 'new') {
        const created = await onCreateClass(className, scope)
        const child = subclassName.trim() ? await onCreateSubclass(created.id, subclassName) : null
        place(String(created.id), child ? String(child.id) : '')
      } else {
        if (!subclassName.trim()) {
          setCreateError('Informe a subclasse.')
          return
        }
        const child = await onCreateSubclass(Number(classChoice), subclassName)
        place(classChoice, String(child.id))
      }
      setCreating(false)
    } catch (caught) {
      setCreateError(messageOf(caught))
    } finally {
      setSavingClass(false)
    }
  }

  let otherCents = 0
  let otherInvalid = false
  for (const line of shown.slice(1)) {
    if (!line.classId && !line.subclassId && !line.amount.trim()) continue
    const cents = parseReais(line.amount)
    if (cents === null) otherInvalid = true
    else otherCents += cents
  }
  const passed = totalCents !== null && !otherInvalid && otherCents > totalCents ? otherCents - totalCents : null

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">A primeira classe fica com o total e diminui quando as outras recebem valor.</p>
        <div className="flex flex-wrap gap-1">
          <button className={quietClass} type="button" onClick={openCreate}>
            Cadastrar classe
          </button>
          <button className={quietClass} type="button" onClick={() => commit([...shown, emptySplitLine()])}>
            Adicionar classe
          </button>
        </div>
      </div>
      {creating && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Classe</span>
            <select className={fieldClass} value={classChoice} onChange={(event) => setClassChoice(event.target.value)}>
              <option value="new">Nova classe</option>
              {creatableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {classChoice === 'new' && (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-600">Nome da classe</span>
                <input
                  className={fieldClass}
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-600">Aparece em</span>
                <select
                  className={fieldClass}
                  value={scope ?? ''}
                  onChange={(event) => setScope(event.target.value === '' ? null : (event.target.value as ClassScope))}
                >
                  <option value="">Todos</option>
                  <option value="debit">Débito</option>
                  <option value="credit">Crédito</option>
                  <option value="transfer">Transferência</option>
                </select>
              </label>
            </>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Subclasse</span>
            <input
              className={fieldClass}
              value={subclassName}
              onChange={(event) => setSubclassName(event.target.value)}
              autoComplete="off"
              placeholder={classChoice === 'new' ? 'Opcional' : ''}
            />
          </label>
          {createError && <p className="text-sm text-rose-700">{createError}</p>}
          <div className="flex gap-1">
            <button className={quietClass} type="button" disabled={savingClass} onClick={() => void saveClass()}>
              Salvar cadastro
            </button>
            <button className={quietClass} type="button" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {shown.map((line, index) => {
        const selectedClassId = line.classId ? Number(line.classId) : null
        const visibleClasses = classes.filter((item) => classFitsType(item.scope, type, item.id, selectedClassId))
        const visibleSubclasses = subclasses.filter((item) => item.classId === selectedClassId)
        return (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
            <select
              className={fieldClass}
              value={line.classId}
              onChange={(event) => update(line.key, { classId: event.target.value, subclassId: '' })}
            >
              <option value="">Classe</option>
              {visibleClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className={fieldClass}
              value={line.subclassId}
              disabled={selectedClassId === null}
              onChange={(event) => update(line.key, { subclassId: event.target.value })}
            >
              <option value="">Sem subclasse</option>
              {visibleSubclasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              className={index === 0 ? `${fieldClass} bg-zinc-50` : fieldClass}
              inputMode="decimal"
              value={line.amount}
              placeholder="0,00"
              readOnly={index === 0}
              tabIndex={index === 0 ? -1 : undefined}
              aria-label={index === 0 ? 'Valor restante' : 'Valor da classe'}
              onChange={(event) => update(line.key, { amount: event.target.value })}
            />
            {index > 0 ? (
              <button
                className={quietClass}
                type="button"
                onClick={() => commit(shown.filter((item) => item.key !== line.key))}
              >
                Tirar
              </button>
            ) : (
              <span />
            )}
          </div>
        )
      })}
      {totalCents === null ? (
        <p className="text-sm text-zinc-500">Informe o valor do lançamento para fechar o rateio.</p>
      ) : otherInvalid ? (
        <p className="text-sm text-rose-700">Há um valor de classe inválido.</p>
      ) : passed !== null ? (
        <p className="text-sm text-rose-700">Passou {formatCents(passed)}.</p>
      ) : null}
    </div>
  )
}
