import { useMemo, useState } from 'react'
import { importTransactions, listImportRules, saveImportRule } from '../db/client.ts'
import type { ImportRule, ImportRuleInput } from '../db/types.ts'
import type { ImportRow, TransactionType } from '../db/types.ts'
import { partsFromSplitLines, type SplitLine } from '../lib/split.ts'
import { applyTitleSuggestions, draftIssue } from '../services/statements/classify.ts'
import { applyRules, bestRule, inferEquals, skipsInference } from '../services/statements/rules.ts'
import { draftsFromParsed, statementStandards, type StatementFormat } from '../services/statements/index.ts'
import { decodeStatement, parseSicrediCsv } from '../services/statements/sicredi-csv.ts'
import type { SavedTitleMatch, StatementDraft } from '../services/statements/types.ts'
import { useTransactions } from './useTransactions.ts'

export type { StatementDraft, StatementFormat }

function matchesOf(
  transactions: readonly {
    bankId: number
    destinationBankId: number | null
    type: TransactionType
    title: string
    description: string | null
    occurredOn: string
    id: number
    parts: StatementDraft['parts']
  }[],
  bankId: number,
): SavedTitleMatch[] {
  return transactions
    .filter((transaction) => transaction.bankId === bankId || transaction.destinationBankId === bankId)
    .filter((transaction) => transaction.parts.length > 0)
    .map((transaction) => ({
      title: transaction.title,
      type: transaction.type,
      description: transaction.description,
      occurredOn: transaction.occurredOn,
      id: transaction.id,
      parts: transaction.parts.map((part) => ({
        classId: part.classId,
        subclassId: part.subclassId,
        amountCents: part.amountCents,
      })),
    }))
}

export type ImportTab = 'review' | 'inferred' | 'ignored'

function rowsInTab(rows: readonly StatementDraft[], selected: ImportTab) {
  if (selected === 'ignored') return rows.filter((draft) => draft.ignored)
  if (selected === 'inferred') return rows.filter((draft) => draft.inferred && !draft.ignored)
  return rows.filter((draft) => !draft.ignored && !draft.inferred)
}

function inferredSentence(count: number, sameText: boolean) {
  const subject = count === 1 ? '1 lançamento' : `${count} lançamentos`
  const verb = count === 1 ? 'foi inferido' : 'foram inferidos'
  return sameText ? `${subject} com o mesmo texto ${verb}.` : `Regra salva. ${subject} ${verb}.`
}

function loadedInferenceSentence(count: number) {
  if (count === 0) return null
  return count === 1
    ? '1 lançamento foi inferido pelas regras e pelo histórico deste banco.'
    : `${count} lançamentos foram inferidos pelas regras e pelo histórico deste banco.`
}

function inferredReadySentence(marked: number, blocked: number) {
  if (marked === 0 && blocked === 0) return 'Nenhuma inferida pendente.'
  if (marked === 0) {
    return blocked === 1
      ? 'Nenhuma inferida pôde ser marcada. 1 ainda precisa de ajuste.'
      : `Nenhuma inferida pôde ser marcada. ${blocked} ainda precisam de ajuste.`
  }
  const ready = marked === 1 ? '1 lançamento inferido ficou pronto' : `${marked} lançamentos inferidos ficaram prontos`
  if (blocked === 0) return `${ready} para finalizar.`
  const left = blocked === 1 ? '1 ainda precisa de ajuste.' : `${blocked} ainda precisam de ajuste.`
  return `${ready}. ${left}`
}

function isTransactionType(value: string): value is TransactionType {
  return value === 'debit' || value === 'credit' || value === 'transfer' || value === 'demonstrative'
}

export function useStatementImport() {
  const { transactions, reload } = useTransactions()
  const [bankId, setBankId] = useState<number | null>(null)
  const [format, setFormat] = useState<StatementFormat>('csv')
  const [standardId, setStandardId] = useState('sicredi')
  const [drafts, setDrafts] = useState<StatementDraft[] | null>(null)
  const [rules, setRules] = useState<ImportRule[]>([])
  const [tab, setTabState] = useState<ImportTab>('review')
  const [view, setView] = useState<'list' | 'one'>('list')
  const [cursor, setCursor] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [inferenceNote, setInferenceNote] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  const standards = statementStandards[format]
  const visible = useMemo(() => rowsInTab(drafts ?? [], tab), [drafts, tab])
  const current = visible[cursor] ?? null
  const readyCount = (drafts ?? []).filter((draft) => draft.done && !draft.ignored).length

  function suggest(next: StatementDraft[], selectedBankId: number) {
    const saved = matchesOf(transactions, selectedBankId)
    return applyRules(
      applyTitleSuggestions(next, saved, (title) => skipsInference(rules, title)),
      rules,
    )
  }

  async function loadFile(file: File) {
    const text = decodeStatement(await file.arrayBuffer())
    if (bankId === null) {
      setError('Escolha o banco antes de importar.')
      return
    }
    if (format !== 'csv' || standardId !== 'sicredi') {
      setError(format === 'csv' ? 'Escolha o padrão do CSV.' : `Ainda não há padrão para ${format === 'pdf' ? 'PDF' : 'Excel'}.`)
      return
    }
    try {
      const parsed = parseSicrediCsv(text)
      const fresh = await reload()
      const existing = new Set(
        fresh.flatMap((transaction) => (ownsStatement(transaction, bankId) ? [transaction.externalId as string] : [])),
      )
      const savedRules = await listImportRules(bankId)
      setRules(savedRules)
      const suggested = applyTitleSuggestions(
        draftsFromParsed(parsed, existing),
        matchesOf(fresh, bankId),
        (title) => skipsInference(savedRules, title),
        true,
      )
      const inferred = applyRules(suggested, savedRules)
      const inferredCount = inferred.filter((draft) => draft.inferred && !draft.ignored).length
      setDrafts(inferred)
      setTabState('review')
      setView('list')
      setCursor(0)
      setError(null)
      setSavedCount(null)
      setInferenceNote(loadedInferenceSentence(inferredCount))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível ler o extrato.')
    }
  }

  function setTab(next: ImportTab) {
    setTabState(next)
    setCursor(0)
    setView('list')
  }

  function openOne(key: string) {
    const index = visible.findIndex((draft) => draft.key === key)
    if (index < 0) return
    setCursor(index)
    setView('one')
  }

  function edit(
    key: string,
    patch: Partial<Pick<StatementDraft, 'title' | 'description' | 'notes' | 'type' | 'destinationBankId' | 'incoming' | 'lines'>>,
  ) {
    if (bankId === null) return
    setDrafts((currentDrafts) => {
      if (!currentDrafts) return currentDrafts
      const next = currentDrafts.map((draft) => {
        if (draft.key !== key) return draft
        const lines = patch.lines ?? draft.lines
        const parsed = partsFromSplitLines(lines)
        return {
          ...draft,
          ...patch,
          lines,
          touched: true,
          parts: parsed.ok ? parsed.parts : [],
          notice: null,
        }
      })
      return suggest(next, bankId)
    })
  }

  function markIgnored(key: string, ignored: boolean) {
    setDrafts((currentDrafts) => {
      if (!currentDrafts) return currentDrafts
      const next = currentDrafts.map((draft) => {
        if (draft.key !== key || draft.lockedIgnored) return draft
        return { ...draft, ignored, done: ignored ? false : draft.done }
      })
      return ignored ? next : applyRules(next, rules)
    })
    setCursor(0)
  }

  function toggleDone(key: string) {
    if (bankId === null || !drafts) return
    const draft = drafts.find((item) => item.key === key)
    if (!draft || draft.ignored) return
    if (draft.done) {
      setDrafts(drafts.map((item) => (item.key === key ? { ...item, done: false } : item)))
      return
    }
    const issue = draftIssue(syncParts(draft), bankId)
    setDrafts(
      drafts.map((item) =>
        item.key === key ? { ...syncParts(item), done: issue === null, notice: issue } : item,
      ),
    )
  }

  function markInferredDone() {
    if (bankId === null || !drafts) return
    let marked = 0
    let blocked = 0
    const next = drafts.map((draft) => {
      if (!draft.inferred || draft.ignored || draft.done) return draft
      const synced = syncParts(draft)
      const issue = draftIssue(synced, bankId)
      if (issue) {
        blocked += 1
        return { ...synced, notice: issue }
      }
      marked += 1
      return { ...synced, done: true, notice: null }
    })
    setDrafts(next)
    setView('list')
    setInferenceNote(inferredReadySentence(marked, blocked))
  }

  function move(direction: -1 | 1) {
    if (!current || bankId === null || !drafts) return
    if (direction < 0) {
      setCursor((value) => Math.max(0, value - 1))
      return
    }
    const issue = draftIssue(syncParts(current), bankId)
    const marked = drafts.map((item) =>
      item.key === current.key ? { ...syncParts(item), done: issue === null, notice: issue } : item,
    )
    const inferred = inferEquals(marked, current.key, rules)
    const moved = inferred.filter((item, index) => item.inferred && !marked[index]?.inferred).length
    setDrafts(inferred)
    setInferenceNote(moved > 0 ? inferredSentence(moved, true) : null)
    const nextVisible = rowsInTab(inferred, tab)
    const index = nextVisible.findIndex((item) => item.key === current.key)
    if (index < 0) return
    if (issue === null && index < nextVisible.length - 1) setCursor(index + 1)
    else setCursor(index)
  }

  async function createRule(input: Omit<ImportRuleInput, 'bankId'>) {
    if (bankId === null || !drafts) throw new Error('Importe um extrato antes de criar a regra.')
    const created = await saveImportRule({ ...input, bankId })
    const nextRules = rules.some((rule) => rule.id === created.id)
      ? rules.map((rule) => (rule.id === created.id ? created : rule))
      : [...rules, created]
    const nextDrafts = applyRules(drafts, nextRules)
    const applied = nextDrafts.filter(
      (draft) =>
        !draft.touched &&
        !draft.ignored &&
        draft.amountCents > 0 &&
        bestRule(nextRules, draft.title)?.id === created.id,
    ).length
    setRules(nextRules)
    setDrafts(nextDrafts)
    if (created.effect === 'skip') {
      const held = nextDrafts.filter((draft) => draft.skipped && !draft.ignored && !draft.lockedIgnored).length
      setInferenceNote(
        held === 0
          ? 'Regra salva. Ela vale para os próximos extratos deste banco.'
          : held === 1
            ? 'Regra salva. 1 lançamento deste extrato não será inferido.'
            : `Regra salva. ${held} lançamentos deste extrato não serão inferidos.`,
      )
      if (held > 0) {
        setTabState('review')
        setView('list')
        setCursor(0)
      }
      return held
    }
    if (applied > 0) {
      setTabState('inferred')
      setView('list')
      setCursor(0)
      setInferenceNote(inferredSentence(applied, false))
    } else {
      setInferenceNote('Regra salva. Ela vale para os próximos extratos deste banco.')
    }
    return applied
  }

  async function finalize() {
    if (bankId === null || !drafts) return
    setFinishing(true)
    setError(null)
    const existing = new Set(
      transactions.flatMap((transaction) => (ownsStatement(transaction, bankId) ? [transaction.externalId as string] : [])),
    )
    const seen = new Set<string>()
    const rows: ImportRow[] = []
    const sendBack = new Set<string>()
    const blocked = new Map<string, string>()
    for (const draft of drafts) {
      if (draft.ignored || !draft.done) continue
      const synced = syncParts(draft)
      const issue = draftIssue(synced, bankId)
      if (issue) {
        blocked.set(draft.key, issue)
        continue
      }
      if (existing.has(draft.externalId) || seen.has(draft.externalId)) {
        sendBack.add(draft.key)
        continue
      }
      seen.add(draft.externalId)
      const creditTransfer = synced.type === 'transfer' && synced.incoming
      rows.push({
        type: synced.type as TransactionType,
        bankId: creditTransfer ? (synced.destinationBankId as number) : bankId,
        destinationBankId:
          synced.type === 'transfer' ? (creditTransfer ? bankId : synced.destinationBankId) : null,
        externalBankId: creditTransfer ? bankId : null,
        externalId: synced.externalId,
        title: synced.title.trim(),
        description: synced.description,
        notes: synced.notes,
        amountCents: synced.amountCents,
        occurredOn: synced.occurredOn,
        parts: synced.parts,
      })
    }

    const keep = (draft: StatementDraft): StatementDraft => {
      if (blocked.has(draft.key)) return { ...draft, done: false, notice: blocked.get(draft.key) ?? null }
      if (!sendBack.has(draft.key)) return draft
      return {
        ...draft,
        ignored: true,
        done: false,
        notice: 'Este identificador já existe neste banco.',
      }
    }

    if (rows.length === 0) {
      setDrafts(drafts.map(keep))
      setTabState(sendBack.size > 0 ? 'ignored' : tab)
      setError(sendBack.size > 0 ? null : 'Marque como feito o que deve entrar.')
      setFinishing(false)
      return
    }

    try {
      const count = await importTransactions({ bankId, rows })
      const savedIds = new Set(rows.map((row) => row.externalId))
      setDrafts(suggest(drafts.filter((draft) => !savedIds.has(draft.externalId)).map(keep), bankId))
      setSavedCount(count)
      setView('list')
      setCursor(0)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível finalizar a importação.')
    } finally {
      setFinishing(false)
    }
  }

  return {
    bankId,
    setBankId,
    format,
    setFormat: (next: StatementFormat) => {
      setFormat(next)
      setStandardId(statementStandards[next][0]?.id ?? '')
    },
    standardId,
    setStandardId,
    standards,
    drafts,
    visible,
    current,
    tab,
    setTab,
    view,
    showList: () => setView('list'),
    cursor,
    readyCount,
    error,
    inferenceNote,
    finishing,
    savedCount,
    loadFile,
    openOne,
    edit,
    markIgnored,
    toggleDone,
    markInferredDone,
    move,
    createRule,
    finalize,
    isTransactionType,
  }
}

function ownsStatement(
  transaction: { bankId: number; externalBankId: number | null; externalId: string | null },
  bankId: number,
) {
  if (!transaction.externalId) return false
  return (transaction.externalBankId ?? transaction.bankId) === bankId
}

function syncParts(draft: StatementDraft): StatementDraft {
  const parsed = partsFromSplitLines(draft.lines)
  return { ...draft, parts: parsed.ok ? parsed.parts : draft.parts }
}

export type { SplitLine }
