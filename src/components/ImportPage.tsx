import { useState, type FormEvent } from 'react'
import type { ImportMatchKind, ImportRuleEffect } from '../db/types.ts'
import { Link } from 'react-router-dom'
import { useBanks } from '../hooks/useBanks.ts'
import { useClassCatalog } from '../hooks/useClasses.ts'
import { useStatementImport, type StatementDraft, type StatementFormat } from '../hooks/useStatementImport.ts'
import type { TransactionType } from '../hooks/useTransactions.ts'
import { bankDisplayName } from '../lib/banks.ts'
import { classFitsType } from '../lib/classes.ts'
import { linesForSuggestion } from '../lib/split.ts'
import { formatDate } from '../lib/dates.ts'
import { formatCents, parseReais } from '../lib/money.ts'
import DescriptionField from './DescriptionField.tsx'
import ImportHistory from './ImportHistory.tsx'
import SplitEditor from './SplitEditor.tsx'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'
const primaryClass = 'rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50'
const quietClass = 'rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100'

const typeLabels: Record<TransactionType, string> = {
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferência',
  demonstrative: 'Demonstrativo',
}

const typeOptions = [
  { value: 'debit', label: 'Débito' },
  { value: 'credit', label: 'Crédito' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'transfer-in', label: 'Transferência de crédito' },
  { value: 'demonstrative', label: 'Demonstrativo' },
]

const formats: { id: StatementFormat; label: string }[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'csv', label: 'CSV' },
  { id: 'excel', label: 'Excel' },
]

function amountClass(type: TransactionType | null) {
  if (type === 'credit') return 'font-medium text-emerald-700'
  if (type === 'debit') return 'font-medium text-rose-700'
  if (type === 'demonstrative') return 'text-zinc-400'
  return 'font-medium text-zinc-700'
}

function MappingBadge({ source, isMapped }: { source?: 'saved' | 'exact' | 'manual'; isMapped: boolean }) {
  if (!isMapped) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Pendente
      </span>
    )
  }
  if (source === 'saved') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
        title="Mapeamento aplicado automaticamente do histórico salvo"
      >
        <span className="font-bold">✓</span> Mapeamento salvo
      </span>
    )
  }
  if (source === 'exact') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
        title="Correspondência automática pelo nome idêntico"
      >
        <span className="font-bold">✓</span> Nome idêntico
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
      <span className="font-bold">✓</span> Mapeado
    </span>
  )
}

export default function ImportPage() {
  const { banks, create: createBank } = useBanks()
  const { classes, subclasses, create: createClass, createChild } = useClassCatalog()
  const statement = useStatementImport()
  const [fileKey, setFileKey] = useState(0)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [ruleKind, setRuleKind] = useState<ImportMatchKind>('equals')
  const [ruleEffect, setRuleEffect] = useState<ImportRuleEffect>('classify')
  const [rulePattern, setRulePattern] = useState('')
  const [ruleClassId, setRuleClassId] = useState('')
  const [ruleSubclassId, setRuleSubclassId] = useState('')
  const [ruleDescription, setRuleDescription] = useState('')
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [savingRule, setSavingRule] = useState(false)

  // Estados para criação rápida no De-Para
  const [newAccountFor, setNewAccountFor] = useState<string | null>(null)
  const [newAccountName, setNewAccountName] = useState('')
  const [newCardFor, setNewCardFor] = useState<string | null>(null)
  const [newCardName, setNewCardName] = useState('')
  const [newCardParentId, setNewCardParentId] = useState('')
  const [newCardClosingDay, setNewCardClosingDay] = useState('10')
  const [newCardLimit, setNewCardLimit] = useState('')
  const [newClassForKey, setNewClassForKey] = useState<string | null>(null)
  const [newClassName, setNewClassName] = useState('')
  const [newSubclassForKey, setNewSubclassForKey] = useState<string | null>(null)
  const [newSubclassName, setNewSubclassName] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [savingInline, setSavingInline] = useState(false)

  const bankAccounts = banks.filter((item) => item.kind === 'bank')
  const creditCards = banks.filter((item) => item.kind === 'card')

  const currentBankId = statement.current?.bankId ?? statement.bankId
  const currentBank = banks.find((item) => item.id === currentBankId) ?? null
  const currentBankName = currentBank ? bankDisplayName(currentBank) : ''

  const ruleType = statement.current?.type ?? 'demonstrative'
  const ruleClasses = classes.filter((item) =>
    classFitsType(item.scope, ruleType, item.id, ruleClassId ? Number(ruleClassId) : null),
  )
  const ruleSubclasses = subclasses.filter((item) => item.classId === (ruleClassId ? Number(ruleClassId) : null))

  function draftBankName(draft: StatementDraft): string {
    const id = draft.bankId ?? statement.bankId
    const found = banks.find((item) => item.id === id)
    const originName = found ? bankDisplayName(found) : 'Sem banco'
    if (draft.type === 'transfer' && draft.destinationBankId !== null) {
      const dest = banks.find((item) => item.id === draft.destinationBankId)
      const destName = dest ? bankDisplayName(dest) : 'Sem destino'
      return draft.incoming ? `${destName} → ${originName}` : `${originName} → ${destName}`
    }
    return originName
  }

  function openRule() {
    const current = statement.current
    if (!current) return
    const part = current.parts[0]
    setRuleKind('equals')
    setRuleEffect('classify')
    setRulePattern(current.title)
    setRuleClassId(part ? String(part.classId) : '')
    setRuleSubclassId(part?.subclassId ? String(part.subclassId) : '')
    setRuleDescription(current.description)
    setRuleError(null)
    setRuleOpen(true)
  }

  function changeRuleKind(kind: ImportMatchKind) {
    setRuleKind(kind)
    const title = statement.current?.title ?? ''
    if (kind === 'contains' && !rulePattern.includes('%')) setRulePattern(title ? `%${title}%` : '%')
    if (kind === 'equals') setRulePattern(title)
  }

  async function onSaveRule() {
    if (ruleEffect === 'classify' && !ruleClassId) {
      setRuleError('Escolha a classe da regra.')
      return
    }
    setSavingRule(true)
    setRuleError(null)
    try {
      await statement.createRule({
        matchKind: ruleKind,
        pattern: rulePattern,
        effect: ruleEffect,
        classId: ruleEffect === 'classify' ? Number(ruleClassId) : null,
        subclassId: ruleEffect === 'classify' && ruleSubclassId ? Number(ruleSubclassId) : null,
        description: ruleEffect === 'classify' ? ruleDescription : '',
      })
      setRuleOpen(false)
    } catch (caught) {
      setRuleError(caught instanceof Error ? caught.message : 'Não foi possível salvar a regra.')
    } finally {
      setSavingRule(false)
    }
  }

  function onFile(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    void statement.loadFile(file, { banks, classes, subclasses })
    setFileKey((value) => value + 1)
  }

  async function handleCreateInlineAccount(csvAccount: string) {
    const name = newAccountName.trim()
    if (!name) {
      setInlineError('Informe o nome da conta.')
      return
    }
    setSavingInline(true)
    setInlineError(null)
    try {
      const created = await createBank({ name, kind: 'bank' })
      statement.setAccountMapping(csvAccount, created.id)
      setNewAccountFor(null)
      setNewAccountName('')
    } catch (caught) {
      setInlineError(caught instanceof Error ? caught.message : 'Não foi possível criar a conta.')
    } finally {
      setSavingInline(false)
    }
  }

  async function handleCreateInlineCard(csvCard: string) {
    const name = newCardName.trim()
    if (!name) {
      setInlineError('Informe o nome do cartão.')
      return
    }
    if (!newCardParentId) {
      setInlineError('Escolha a conta bancária vinculada ao cartão.')
      return
    }
    const closingDay = Number(newCardClosingDay)
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
      setInlineError('Informe um dia de fechamento entre 1 e 31.')
      return
    }
    let limitCents: number | null = null
    if (newCardLimit.trim()) {
      const parsed = parseReais(newCardLimit)
      if (parsed === null) {
        setInlineError('Informe um limite válido.')
        return
      }
      limitCents = parsed
    }
    setSavingInline(true)
    setInlineError(null)
    try {
      const created = await createBank({
        name,
        kind: 'card',
        parentBankId: Number(newCardParentId),
        closingDay,
        limitCents,
      })
      statement.setCardMapping(csvCard, created.id)
      setNewCardFor(null)
      setNewCardName('')
      setNewCardLimit('')
    } catch (caught) {
      setInlineError(caught instanceof Error ? caught.message : 'Não foi possível criar o cartão.')
    } finally {
      setSavingInline(false)
    }
  }

  async function handleCreateInlineClass(catKey: string, csvSubcategory: string) {
    const name = newClassName.trim()
    if (!name || !statement.mfFile) {
      setInlineError('Informe o nome da classe.')
      return
    }
    const scope = statement.mfFile.defaultType === 'credit' ? 'credit' : 'debit'
    setSavingInline(true)
    setInlineError(null)
    try {
      const created = await createClass(name, scope)
      let subId: number | null = null
      if (csvSubcategory.trim()) {
        const createdSub = await createChild(created.id, csvSubcategory.trim())
        subId = createdSub.id
      }
      statement.setCategoryMapping(catKey, created.id, subId)
      setNewClassForKey(null)
      setNewClassName('')
    } catch (caught) {
      setInlineError(caught instanceof Error ? caught.message : 'Não foi possível criar a classe.')
    } finally {
      setSavingInline(false)
    }
  }

  async function handleCreateInlineSubclass(catKey: string, classId: number) {
    const name = newSubclassName.trim()
    if (!name) {
      setInlineError('Informe o nome da subclasse.')
      return
    }
    setSavingInline(true)
    setInlineError(null)
    try {
      const created = await createChild(classId, name)
      statement.setCategoryMapping(catKey, classId, created.id)
      setNewSubclassForKey(null)
      setNewSubclassName('')
    } catch (caught) {
      setInlineError(caught instanceof Error ? caught.message : 'Não foi possível criar a subclasse.')
    } finally {
      setSavingInline(false)
    }
  }

  // Agrupamento das linhas visíveis por Conta / Cartão (cartões separados das contas)
  const groupedVisible = (() => {
    const groups = new Map<number, StatementDraft[]>()
    for (const draft of statement.visible) {
      const id = draft.bankId ?? statement.bankId ?? 0
      const list = groups.get(id) ?? []
      list.push(draft)
      groups.set(id, list)
    }
    const entries = [...groups.entries()].map(([id, items]) => {
      const found = banks.find((b) => b.id === id) ?? null
      return {
        bankId: id,
        bank: found,
        kind: found?.kind ?? 'bank',
        name: found ? bankDisplayName(found) : 'Sem banco',
        items,
      }
    })
    // Ordena Contas primeiro e Cartões separados depois
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'bank' ? -1 : 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
    return entries
  })()

  const mfSummary =
    statement.mfFile && statement.mfMapping
      ? {
          unmappedAccounts: statement.mfFile.accounts.filter((a) => !statement.mfMapping?.accounts[a]).length,
          unmappedCards: statement.mfFile.cards.filter((c) => !statement.mfMapping?.cards[c.name]).length,
          mappedCategories: statement.mfFile.categories.filter(
            (c) => statement.mfMapping?.categories[c.key]?.classId != null,
          ).length,
          savedCount:
            statement.mfFile.accounts.filter((a) => statement.mfMappingSources?.accounts[a] === 'saved').length +
            statement.mfFile.cards.filter((c) => statement.mfMappingSources?.cards[c.name] === 'saved').length +
            statement.mfFile.categories.filter((c) => statement.mfMappingSources?.categories[c.key] === 'saved').length,
        }
      : null

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Importar extrato</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {statement.isMultiBank
              ? 'Mapeie contas, cartões e categorias no De-Para antes de revisar. Nada é gravado até finalizar.'
              : 'O banco é escolhido antes do arquivo. Nada é gravado até finalizar.'}
          </p>
        </div>
        <Link className={quietClass} to="/transacoes">
          Voltar às transações
        </Link>
      </div>

      {statement.error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{statement.error}</p>
      )}
      {statement.savedCount !== null && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {statement.savedCount === 1
            ? '1 lançamento gravado.'
            : `${statement.savedCount} lançamentos gravados.`}
        </p>
      )}

      <form className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">Formato</span>
          <select
            className={fieldClass}
            value={statement.format}
            onChange={(event) => statement.setFormat(event.target.value as StatementFormat)}
          >
            {formats.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {statement.standards.length > 0 ? (
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Padrão</span>
            <select
              className={fieldClass}
              value={statement.standardId}
              onChange={(event) => statement.setStandardId(event.target.value)}
            >
              {statement.standards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-end text-sm text-zinc-600">Ainda não há padrão para este formato.</p>
        )}
        {statement.isMultiBank ? (
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Contas e cartões</span>
            <input
              className={`${fieldClass} bg-zinc-50 text-zinc-600`}
              value="Definidos no De-Para após escolher o CSV"
              readOnly
            />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Banco</span>
            <select
              className={fieldClass}
              value={statement.bankId ?? ''}
              onChange={(event) => statement.setBankId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Escolha</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bankDisplayName(bank)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">Arquivo</span>
          <input
            key={fileKey}
            className={fieldClass}
            type="file"
            accept={statement.format === 'csv' ? '.csv,text/csv' : undefined}
            disabled={statement.standards.length === 0 || (!statement.isMultiBank && statement.bankId === null)}
            onChange={onFile}
          />
        </label>
      </form>

      {statement.mfFile && statement.mfMapping && !statement.drafts && (
        <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
            <div>
              <h2 className="text-lg font-semibold">De-Para da importação</h2>
              <p className="text-sm text-zinc-600">
                {statement.mfFile.rows.length}{' '}
                {statement.mfFile.rows.length === 1 ? 'lançamento lido' : 'lançamentos lidos'} (
                {statement.mfFile.defaultType === 'credit'
                  ? 'Créditos'
                  : statement.mfFile.defaultType === 'transfer'
                    ? 'Transferências'
                    : 'Débitos'}
                ). Associe ou crie as contas
                {statement.mfFile.defaultType === 'transfer' ? ' de origem e destino.' : ', cartões e categorias correspondentes.'}
              </p>
            </div>
            <button className={primaryClass} type="button" onClick={() => void statement.confirmMapping()}>
              Confirmar De-Para e revisar
            </button>
          </div>

          {mfSummary && mfSummary.savedCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">✓ {mfSummary.savedCount} mapeamento(s) salvo(s)</span> foram aplicados automaticamente de importações anteriores.
            </div>
          )}

          {mfSummary && (mfSummary.unmappedAccounts > 0 || mfSummary.unmappedCards > 0) && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>
                {mfSummary.unmappedAccounts > 0 && mfSummary.unmappedCards > 0
                  ? `Há ${mfSummary.unmappedAccounts} conta(s) e ${mfSummary.unmappedCards} cartão(ões) sem associação. Associe-os antes de confirmar.`
                  : mfSummary.unmappedAccounts > 0
                    ? `Há ${mfSummary.unmappedAccounts} conta(s) sem associação. Associe todas antes de confirmar.`
                    : `Há ${mfSummary.unmappedCards} cartão(ões) sem associação. Associe todos antes de confirmar.`}
              </span>
            </div>
          )}

          {inlineError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{inlineError}</p>
          )}

          {/* 1. Contas do arquivo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                1. Contas do arquivo ({statement.mfFile.accounts.length})
              </h3>
              {mfSummary && (
                <span className="text-xs">
                  {mfSummary.unmappedAccounts === 0 ? (
                    <span className="font-medium text-emerald-700">✓ Todas mapeadas</span>
                  ) : (
                    <span className="font-medium text-amber-700">{mfSummary.unmappedAccounts} pendente(s)</span>
                  )}
                </span>
              )}
            </div>
            <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {statement.mfFile.accounts.map((acc) => {
                const selectedId = statement.mfMapping?.accounts[acc] ?? null
                const source = statement.mfMappingSources?.accounts[acc]
                const isMapped = selectedId !== null
                return (
                  <div key={acc} className={`space-y-2 p-3 ${!isMapped ? 'bg-amber-50/25' : ''}`}>
                    <div className="grid items-center gap-3 sm:grid-cols-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
                        <span>
                          Conta no CSV: <span className="font-semibold">{acc}</span>
                        </span>
                        <MappingBadge source={source} isMapped={isMapped} />
                      </div>
                      <select
                        className={fieldClass}
                        value={selectedId ?? ''}
                        onChange={(event) =>
                          statement.setAccountMapping(acc, event.target.value ? Number(event.target.value) : null)
                        }
                      >
                        <option value="">Escolha uma conta</option>
                        {bankAccounts.map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bank.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={quietClass}
                          type="button"
                          onClick={() => {
                            setInlineError(null)
                            setNewAccountFor(newAccountFor === acc ? null : acc)
                            setNewAccountName(acc)
                          }}
                        >
                          + Criar conta
                        </button>
                      </div>
                    </div>
                    {newAccountFor === acc && (
                      <div className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-50 p-3">
                        <label className="block flex-1 text-sm">
                          <span className="mb-1 block text-zinc-600">Nome da nova conta</span>
                          <input
                            className={fieldClass}
                            value={newAccountName}
                            onChange={(event) => setNewAccountName(event.target.value)}
                          />
                        </label>
                        <button
                          className={primaryClass}
                          type="button"
                          disabled={savingInline}
                          onClick={() => void handleCreateInlineAccount(acc)}
                        >
                          Salvar conta
                        </button>
                        <button className={quietClass} type="button" onClick={() => setNewAccountFor(null)}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2. Cartões do arquivo */}
          {statement.mfFile.cards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  2. Cartões de crédito do arquivo ({statement.mfFile.cards.length})
                </h3>
                {mfSummary && (
                  <span className="text-xs">
                    {mfSummary.unmappedCards === 0 ? (
                      <span className="font-medium text-emerald-700">✓ Todos mapeados</span>
                    ) : (
                      <span className="font-medium text-amber-700">{mfSummary.unmappedCards} pendente(s)</span>
                    )}
                  </span>
                )}
              </div>
              <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
                {statement.mfFile.cards.map((card) => {
                  const selectedId = statement.mfMapping?.cards[card.name] ?? null
                  const source = statement.mfMappingSources?.cards[card.name]
                  const isMapped = selectedId !== null
                  const defaultParentId =
                    card.defaultAccount && statement.mfMapping?.accounts[card.defaultAccount]
                      ? String(statement.mfMapping.accounts[card.defaultAccount])
                      : bankAccounts[0]
                        ? String(bankAccounts[0].id)
                        : ''
                  return (
                    <div key={card.name} className={`space-y-2 p-3 ${!isMapped ? 'bg-amber-50/25' : ''}`}>
                      <div className="grid items-center gap-3 sm:grid-cols-3">
                        <div className="text-sm font-medium text-zinc-900">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              Cartão no CSV: <span className="font-semibold">{card.name}</span>
                            </span>
                            <MappingBadge source={source} isMapped={isMapped} />
                          </div>
                          {card.defaultAccount && (
                            <span className="block text-xs text-zinc-500">Conta associada: {card.defaultAccount}</span>
                          )}
                        </div>
                        <select
                          className={fieldClass}
                          value={selectedId ?? ''}
                          onChange={(event) =>
                            statement.setCardMapping(card.name, event.target.value ? Number(event.target.value) : null)
                          }
                        >
                          <option value="">Escolha um cartão</option>
                          {creditCards.map((item) => (
                            <option key={item.id} value={item.id}>
                              {bankDisplayName(item)}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={quietClass}
                            type="button"
                            onClick={() => {
                              setInlineError(null)
                              setNewCardFor(newCardFor === card.name ? null : card.name)
                              setNewCardName(card.name)
                              setNewCardParentId(defaultParentId)
                              setNewCardClosingDay('10')
                              setNewCardLimit('')
                            }}
                          >
                            + Criar cartão
                          </button>
                        </div>
                      </div>
                      {newCardFor === card.name && (
                        <div className="grid gap-3 rounded-md bg-zinc-50 p-3 sm:grid-cols-4">
                          <label className="block text-sm">
                            <span className="mb-1 block text-zinc-600">Nome do cartão</span>
                            <input
                              className={fieldClass}
                              value={newCardName}
                              onChange={(event) => setNewCardName(event.target.value)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-zinc-600">Conta vinculada</span>
                            <select
                              className={fieldClass}
                              value={newCardParentId}
                              onChange={(event) => setNewCardParentId(event.target.value)}
                            >
                              <option value="">Escolha</option>
                              {bankAccounts.map((bank) => (
                                <option key={bank.id} value={bank.id}>
                                   {bank.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-zinc-600">Dia de fechamento</span>
                            <input
                              className={fieldClass}
                              type="number"
                              min={1}
                              max={31}
                              value={newCardClosingDay}
                              onChange={(event) => setNewCardClosingDay(event.target.value)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-zinc-600">Limite (R$, opcional)</span>
                            <input
                              className={fieldClass}
                              placeholder="Ex.: 2500,00"
                              value={newCardLimit}
                              onChange={(event) => setNewCardLimit(event.target.value)}
                            />
                          </label>
                          <div className="flex gap-2 sm:col-span-4">
                            <button
                              className={primaryClass}
                              type="button"
                              disabled={savingInline}
                              onClick={() => void handleCreateInlineCard(card.name)}
                            >
                              Salvar cartão
                            </button>
                            <button className={quietClass} type="button" onClick={() => setNewCardFor(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 3. Categorias e Subcategorias do arquivo */}
          {statement.mfFile.categories.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                3. Categorias e Subcategorias do arquivo ({statement.mfFile.categories.length})
              </h3>
              {mfSummary && (
                <span className="text-xs">
                  {mfSummary.mappedCategories === statement.mfFile.categories.length ? (
                    <span className="font-medium text-emerald-700">✓ Todas mapeadas</span>
                  ) : (
                    <span className="font-medium text-zinc-600">
                      {mfSummary.mappedCategories} de {statement.mfFile.categories.length} mapeada(s)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {statement.mfFile.categories.map((item) => {
                const mapped = statement.mfMapping?.categories[item.key] ?? { classId: null, subclassId: null }
                const source = statement.mfMappingSources?.categories[item.key]
                const isMapped = mapped.classId !== null
                const availableClasses = classes.filter((c) =>
                  classFitsType(c.scope, statement.mfFile!.defaultType, c.id, mapped.classId),
                )
                const availableSubclasses = subclasses.filter((s) => s.classId === mapped.classId)

                return (
                  <div key={item.key} className={`space-y-2 p-3 ${!isMapped ? 'bg-amber-50/20' : ''}`}>
                    <div className="grid items-center gap-3 sm:grid-cols-4">
                      <div className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-zinc-900">{item.category}</span>
                          {item.subcategory && <span className="text-zinc-600"> / {item.subcategory}</span>}
                          <MappingBadge source={source} isMapped={isMapped} />
                        </div>
                      </div>
                      <select
                        className={fieldClass}
                        value={mapped.classId ?? ''}
                        onChange={(event) => {
                          const nextClassId = event.target.value ? Number(event.target.value) : null
                          statement.setCategoryMapping(item.key, nextClassId, null)
                        }}
                      >
                        <option value="">Sem classe</option>
                        {availableClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className={fieldClass}
                        value={mapped.subclassId ?? ''}
                        disabled={mapped.classId === null}
                        onChange={(event) => {
                          const nextSubId = event.target.value ? Number(event.target.value) : null
                          statement.setCategoryMapping(item.key, mapped.classId, nextSubId)
                        }}
                      >
                        <option value="">Sem subclasse</option>
                        {availableSubclasses.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-1">
                        <button
                          className={quietClass}
                          type="button"
                          onClick={() => {
                            setInlineError(null)
                            setNewSubclassForKey(null)
                            setNewClassForKey(newClassForKey === item.key ? null : item.key)
                            setNewClassName(item.category)
                          }}
                        >
                          + Classe
                        </button>
                        {mapped.classId !== null && (
                          <button
                            className={quietClass}
                            type="button"
                            onClick={() => {
                              setInlineError(null)
                              setNewClassForKey(null)
                              setNewSubclassForKey(newSubclassForKey === item.key ? null : item.key)
                              setNewSubclassName(item.subcategory || '')
                            }}
                          >
                            + Subclasse
                          </button>
                        )}
                      </div>
                    </div>

                    {newClassForKey === item.key && (
                      <div className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-50 p-3">
                        <label className="block flex-1 text-sm">
                          <span className="mb-1 block text-zinc-600">
                            Nova classe ({statement.mfFile?.defaultType === 'credit' ? 'Crédito' : 'Débito'})
                            {item.subcategory ? ` + subclasse "${item.subcategory}"` : ''}
                          </span>
                          <input
                            className={fieldClass}
                            value={newClassName}
                            onChange={(event) => setNewClassName(event.target.value)}
                          />
                        </label>
                        <button
                          className={primaryClass}
                          type="button"
                          disabled={savingInline}
                          onClick={() => void handleCreateInlineClass(item.key, item.subcategory)}
                        >
                          Salvar classe
                        </button>
                        <button className={quietClass} type="button" onClick={() => setNewClassForKey(null)}>
                          Cancelar
                        </button>
                      </div>
                    )}

                    {newSubclassForKey === item.key && mapped.classId !== null && (
                      <div className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-50 p-3">
                        <label className="block flex-1 text-sm">
                          <span className="mb-1 block text-zinc-600">Nova subclasse</span>
                          <input
                            className={fieldClass}
                            value={newSubclassName}
                            onChange={(event) => setNewSubclassName(event.target.value)}
                          />
                        </label>
                        <button
                          className={primaryClass}
                          type="button"
                          disabled={savingInline}
                          onClick={() => void handleCreateInlineSubclass(item.key, mapped.classId!)}
                        >
                          Salvar subclasse
                        </button>
                        <button className={quietClass} type="button" onClick={() => setNewSubclassForKey(null)}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )}

          <div className="flex justify-end border-t border-zinc-200 pt-3">
            <button className={primaryClass} type="button" onClick={() => void statement.confirmMapping()}>
              Confirmar De-Para e revisar
            </button>
          </div>
        </div>
      )}

      {statement.drafts && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              <button
                className={statement.tab === 'review' ? primaryClass : quietClass}
                type="button"
                onClick={() => statement.setTab('review')}
              >
                A revisar ({statement.drafts.filter((draft) => !draft.ignored && !draft.inferred).length})
              </button>
              <button
                className={statement.tab === 'inferred' ? primaryClass : quietClass}
                type="button"
                onClick={() => statement.setTab('inferred')}
              >
                Inferidas ({statement.drafts.filter((draft) => draft.inferred && !draft.ignored).length})
              </button>
              <button
                className={statement.tab === 'ignored' ? primaryClass : quietClass}
                type="button"
                onClick={() => statement.setTab('ignored')}
              >
                Ignorados ({statement.drafts.filter((draft) => draft.ignored).length})
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statement.mfFile && (
                <button className={quietClass} type="button" onClick={() => statement.reopenMapping()}>
                  Voltar ao De-Para
                </button>
              )}
              <button
                className={primaryClass}
                type="button"
                disabled={statement.finishing || statement.readyCount === 0}
                onClick={() => void statement.finalize()}
              >
                Finalizar importação ({statement.readyCount})
              </button>
            </div>
          </div>
          {statement.inferenceNote && <p className="text-sm text-sky-800">{statement.inferenceNote}</p>}
          {statement.tab === 'inferred' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-600">
                Classificadas por uma regra ou pelo mesmo texto. Entram na finalização quando estão feitas.
              </p>
              <button
                className={quietClass}
                type="button"
                disabled={!statement.drafts.some((draft) => draft.inferred && !draft.ignored && !draft.done)}
                onClick={() => statement.markInferredDone()}
              >
                Marcar todas como feitas
              </button>
            </div>
          )}

          {statement.view === 'list' ? (
            statement.visible.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhum lançamento nesta aba.</p>
            ) : (
              <div className="space-y-4">
                {groupedVisible.map((group) => {
                  const doneInGroup = group.items.filter((item) => item.done).length
                  const hasPendingInGroup = group.items.some((item) => !item.ignored && !item.done)
                  return (
                    <div key={group.bankId} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              group.kind === 'card'
                                ? 'rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900'
                                : 'rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800'
                            }
                          >
                            {group.kind === 'card' ? 'Cartão' : 'Conta'}
                          </span>
                          <span className="font-semibold text-zinc-900">{group.name}</span>
                          <span className="text-xs text-zinc-500">
                            ({doneInGroup} de {group.items.length} feitos)
                          </span>
                        </div>
                        {statement.tab !== 'ignored' && (
                          <button
                            className={quietClass}
                            type="button"
                            disabled={!hasPendingInGroup}
                            onClick={() => statement.markGroupDone(group.bankId)}
                          >
                            Marcar todos como feitos
                          </button>
                        )}
                      </div>
                      <ul className="divide-y divide-zinc-200">
                        {group.items.map((draft) => (
                          <li key={draft.key}>
                            <button
                              className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-zinc-50"
                              type="button"
                              onClick={() => statement.openOne(draft.key)}
                            >
                              <span className="flex items-center justify-between gap-3">
                                <span className="flex flex-wrap items-center gap-2 font-medium">
                                  <span>
                                    {draft.done ? '● ' : '○ '}
                                    {draft.title || 'Sem título'}
                                  </span>
                                  {!draft.paid && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                                      Pendente
                                    </span>
                                  )}
                                  {draft.inferred && (
                                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900">
                                      Inferida
                                    </span>
                                  )}
                                  {draft.skipped && (
                                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                                      Não inferir
                                    </span>
                                  )}
                                </span>
                                <span className={amountClass(draft.type)}>
                                  {draft.amountCents > 0 ? formatCents(draft.amountCents) : '—'}
                                </span>
                              </span>
                              <span className="text-sm text-zinc-600">
                                {draft.occurredOn ? formatDate(draft.occurredOn) : 'Sem data'} ·{' '}
                                {draft.type ? typeLabels[draft.type] : 'Tipo a escolher'} · {draftBankName(draft)}
                              </span>
                              {draft.notice && <span className="text-sm text-amber-800">{draft.notice}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )
          ) : statement.current ? (
            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-600">
                  {statement.cursor + 1} de {statement.visible.length}
                  {statement.current.done ? ' · feito' : ''}
                  {statement.current.inferred ? ' · inferida' : ''}
                  {statement.current.skipped ? ' · não inferir' : ''}
                </p>
                <button className={quietClass} type="button" onClick={statement.showList}>
                  Ver listagem
                </button>
              </div>
              <p className="text-sm text-zinc-600">{statement.current.statementBalanceLabel}</p>
              {statement.current.notice && <p className="text-sm text-amber-800">{statement.current.notice}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-600">Tipo</span>
                  <select
                    className={fieldClass}
                    value={
                      statement.current.type === 'transfer' && statement.current.incoming
                        ? 'transfer-in'
                        : (statement.current.type ?? '')
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      const current = statement.current
                      if (!current) return
                      if (value === '') {
                        statement.edit(current.key, { type: null, incoming: false, destinationBankId: null })
                        return
                      }
                      if (value === 'transfer' || value === 'transfer-in') {
                        statement.edit(current.key, {
                          type: 'transfer',
                          incoming: value === 'transfer-in',
                          destinationBankId: current.destinationBankId,
                        })
                        return
                      }
                      if (statement.isTransactionType(value)) {
                        statement.edit(current.key, { type: value, incoming: false, destinationBankId: null })
                      }
                    }}
                  >
                    <option value="">Escolha</option>
                    {typeOptions.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-600">Data</span>
                  <input
                    className={fieldClass}
                    value={statement.current.occurredOn ? formatDate(statement.current.occurredOn) : 'Sem data'}
                    readOnly
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-600">Situação</span>
                  <select
                    className={fieldClass}
                    value={statement.current.paid ? 'paid' : 'pending'}
                    onChange={(event) =>
                      statement.edit(statement.current!.key, { paid: event.target.value === 'paid' })
                    }
                  >
                    <option value="paid">Pago</option>
                    <option value="pending">Pendente</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-zinc-600">
                    {statement.current.type === 'transfer'
                      ? statement.current.incoming
                        ? 'Banco de destino'
                        : 'Banco de origem'
                      : 'Banco / Cartão'}
                  </span>
                  <input className={fieldClass} value={currentBankName} readOnly />
                </label>
                {statement.current.type === 'transfer' && (
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1 block text-zinc-600">
                      {statement.current.incoming ? 'Banco de origem' : 'Banco de destino'}
                    </span>
                    <select
                      className={fieldClass}
                      value={statement.current.destinationBankId ?? ''}
                      onChange={(event) =>
                        statement.edit(statement.current!.key, {
                          destinationBankId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    >
                      <option value="">Escolha</option>
                      {banks
                        .filter((bank) => bank.id !== currentBankId)
                        .map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bankDisplayName(bank)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-zinc-600">Título</span>
                  <input
                    className={fieldClass}
                    value={statement.current.title}
                    onChange={(event) => statement.edit(statement.current!.key, { title: event.target.value })}
                  />
                </label>
                <DescriptionField
                  value={statement.current.description}
                  type={statement.current.type}
                  excludeId={null}
                  onChange={(description) => statement.edit(statement.current!.key, { description })}
                  onPick={(suggestion) => {
                    const current = statement.current
                    if (!current) return
                    const total = current.amountCents > 0 ? current.amountCents : null
                    statement.edit(current.key, {
                      description: suggestion.description,
                      lines: linesForSuggestion(suggestion.parts, total),
                    })
                  }}
                />
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-zinc-600">Observação</span>
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={statement.current.notes}
                    onChange={(event) => statement.edit(statement.current!.key, { notes: event.target.value })}
                  />
                </label>
                <SplitEditor
                  type={statement.current.type ?? 'demonstrative'}
                  totalCents={statement.current.amountCents > 0 ? statement.current.amountCents : null}
                  classes={classes}
                  subclasses={subclasses}
                  lines={statement.current.lines}
                  onChange={(lines) => statement.edit(statement.current!.key, { lines })}
                  onCreateClass={createClass}
                  onCreateSubclass={createChild}
                />
              </div>
              {ruleOpen && (
                <div className="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-600">Efeito</span>
                    <select
                      className={fieldClass}
                      value={ruleEffect}
                      onChange={(event) => setRuleEffect(event.target.value === 'skip' ? 'skip' : 'classify')}
                    >
                      <option value="classify">Classificar</option>
                      <option value="skip">Não inferir</option>
                    </select>
                  </label>
                  {ruleEffect === 'skip' && (
                    <p className="text-sm text-zinc-600">
                      O texto segue na revisão. Lançamento anterior e outro igual neste extrato não preenchem a classe.
                    </p>
                  )}
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-600">Regra</span>
                    <select
                      className={fieldClass}
                      value={ruleKind}
                      onChange={(event) => changeRuleKind(event.target.value === 'contains' ? 'contains' : 'equals')}
                    >
                      <option value="equals">Igual</option>
                      <option value="contains">Contém</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-600">{ruleKind === 'equals' ? 'Igual a' : 'Contém'}</span>
                    <input
                      className={fieldClass}
                      value={rulePattern}
                      onChange={(event) => setRulePattern(event.target.value)}
                      placeholder={ruleKind === 'contains' ? '%casa%quiosque%franks%' : ''}
                      autoComplete="off"
                    />
                  </label>
                  {ruleKind === 'contains' && (
                    <p className="text-sm text-zinc-600">% vale por qualquer trecho. Exemplo: %casa%quiosque%franks%.</p>
                  )}
                  {ruleEffect === 'classify' && (
                    <>
                      <label className="block text-sm">
                        <span className="mb-1 block text-zinc-600">Classe</span>
                        <select
                          className={fieldClass}
                          value={ruleClassId}
                          onChange={(event) => {
                            setRuleClassId(event.target.value)
                            setRuleSubclassId('')
                          }}
                        >
                          <option value="">Escolha</option>
                          {ruleClasses.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-zinc-600">Subclasse</span>
                        <select
                          className={fieldClass}
                          value={ruleSubclassId}
                          disabled={!ruleClassId}
                          onChange={(event) => setRuleSubclassId(event.target.value)}
                        >
                          <option value="">Sem subclasse</option>
                          {ruleSubclasses.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-zinc-600">Descrição</span>
                        <textarea
                          className={fieldClass}
                          rows={2}
                          value={ruleDescription}
                          onChange={(event) => setRuleDescription(event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {ruleError && <p className="text-sm text-rose-700">{ruleError}</p>}
                  <div className="flex gap-1">
                    <button className={primaryClass} type="button" disabled={savingRule} onClick={() => void onSaveRule()}>
                      Salvar regra
                    </button>
                    <button className={quietClass} type="button" onClick={() => setRuleOpen(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className={quietClass} type="button" onClick={() => statement.move(-1)} disabled={statement.cursor === 0}>
                  Anterior
                </button>
                <button
                  className={primaryClass}
                  type="button"
                  onClick={() => {
                    setRuleOpen(false)
                    statement.move(1)
                  }}
                >
                  Próximo
                </button>
                <button className={quietClass} type="button" onClick={openRule}>
                  Criar regra
                </button>
                {!statement.current.ignored && (
                  <button className={quietClass} type="button" onClick={() => statement.toggleDone(statement.current!.key)}>
                    {statement.current.done ? 'Desmarcar feito' : 'Marcar feito'}
                  </button>
                )}
                {statement.current.lockedIgnored ? null : statement.current.ignored ? (
                  <button className={quietClass} type="button" onClick={() => statement.markIgnored(statement.current!.key, false)}>
                    Trazer de volta
                  </button>
                ) : (
                  <button className={quietClass} type="button" onClick={() => statement.markIgnored(statement.current!.key, true)}>
                    Ignorar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">Nenhum lançamento nesta aba.</p>
          )}
        </div>
      )}

      <ImportHistory revision={statement.savedCount ?? 0} />
    </section>
  )
}
