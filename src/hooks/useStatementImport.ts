import { useMemo, useState } from 'react'
import {
  importTransactions,
  listImportMappings,
  listImportRules,
  saveImportMappings,
  saveImportRule,
} from '../db/client.ts'
import type {
  Bank,
  ClassRecord,
  ImportMappingInput,
  ImportRule,
  ImportRuleInput,
  SubclassRecord,
} from '../db/types.ts'
import type { ImportRow, TransactionType } from '../db/types.ts'
import { classFitsType } from '../lib/classes.ts'
import { partsFromSplitLines, type SplitLine } from '../lib/split.ts'
import { applyTitleSuggestions, draftIssue } from '../services/statements/classify.ts'
import { applyRules, bestRule, inferEquals, skipsInference } from '../services/statements/rules.ts'
import { draftsFromParsed, statementStandards, type StatementFormat } from '../services/statements/index.ts'
import {
  categoryMapKey,
  draftsFromMinhasFinancas,
  parseMinhasFinancasCsv,
} from '../services/statements/minhas-financas-csv.ts'
import { decodeStatement, parseSicrediCsv } from '../services/statements/sicredi-csv.ts'
import type {
  MinhasFinancasFile,
  MinhasFinancasMapping,
  MinhasFinancasMappingSources,
  SavedTitleMatch,
  StatementDraft,
} from '../services/statements/types.ts'
import { useTransactions } from './useTransactions.ts'

export type { StatementDraft, StatementFormat }

function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

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

function groupReadySentence(marked: number, blocked: number) {
  if (marked === 0 && blocked === 0) return 'Nenhum lançamento pendente nesta seção.'
  if (marked === 0) {
    return blocked === 1
      ? 'Nenhum lançamento pôde ser marcado. 1 ainda precisa de ajuste.'
      : `Nenhum lançamento pôde ser marcado. ${blocked} ainda precisam de ajuste.`
  }
  const ready = marked === 1 ? '1 lançamento marcado como feito' : `${marked} lançamentos marcados como feitos`
  if (blocked === 0) return `${ready}.`
  const left = blocked === 1 ? '1 ainda precisa de ajuste.' : `${blocked} ainda precisam de ajuste.`
  return `${ready}. ${left}`
}

function isTransactionType(value: string): value is TransactionType {
  return value === 'debit' || value === 'credit' || value === 'transfer' || value === 'demonstrative'
}

export function isMinhasFinancasStandard(format: StatementFormat, standardId: string): boolean {
  return (
    format === 'csv' &&
    (standardId === 'minhas-financas-debito' ||
      standardId === 'minhas-financas-credito' ||
      standardId === 'minhas-financas-transferencia')
  )
}

export function useStatementImport() {
  const { transactions, reload } = useTransactions()
  const [bankId, setBankId] = useState<number | null>(null)
  const [format, setFormat] = useState<StatementFormat>('csv')
  const [standardId, setStandardId] = useState('sicredi')
  const [mfFile, setMfFile] = useState<MinhasFinancasFile | null>(null)
  const [mfMapping, setMfMapping] = useState<MinhasFinancasMapping | null>(null)
  const [mfMappingSources, setMfMappingSources] = useState<MinhasFinancasMappingSources | null>(null)
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
  const isMultiBank = isMinhasFinancasStandard(format, standardId)
  const visible = useMemo(() => rowsInTab(drafts ?? [], tab), [drafts, tab])
  const current = visible[cursor] ?? null
  const readyCount = (drafts ?? []).filter((draft) => draft.done && !draft.ignored).length

  function effectiveBankId(draft: StatementDraft): number | null {
    return draft.bankId ?? bankId
  }

  function suggest(next: StatementDraft[], fallbackBankId: number | null) {
    if (fallbackBankId === null) {
      return applyRules(next, rules)
    }
    const saved = matchesOf(transactions, fallbackBankId)
    return applyRules(
      applyTitleSuggestions(next, saved, (title) => skipsInference(rules, title)),
      rules,
    )
  }

  async function loadFile(
    file: File,
    catalog?: {
      banks: readonly Bank[]
      classes: readonly ClassRecord[]
      subclasses: readonly SubclassRecord[]
    },
  ) {
    const text = decodeStatement(await file.arrayBuffer())
    if (isMinhasFinancasStandard(format, standardId)) {
      try {
        const requestedType =
          standardId === 'minhas-financas-credito'
            ? 'credit'
            : standardId === 'minhas-financas-transferencia'
              ? 'transfer'
              : 'debit'
        const parsed = parseMinhasFinancasCsv(text, requestedType)
        const defaultType = parsed.defaultType
        const accountsMap: Record<string, number | null> = {}
        const cardsMap: Record<string, number | null> = {}
        const categoriesMap: Record<string, { classId: number | null; subclassId: number | null }> = {}

        const systemBanks = (catalog?.banks ?? []).filter((b) => b.kind === 'bank')
        const systemCards = (catalog?.banks ?? []).filter((b) => b.kind === 'card')
        const systemClasses = catalog?.classes ?? []
        const systemSubclasses = catalog?.subclasses ?? []

        const savedMappings = await listImportMappings()
        const savedAccounts = new Map<string, number>()
        const savedCards = new Map<string, number>()
        const savedCategories = new Map<string, { classId: number; subclassId: number | null }>()
        const savedCategoriesFold = new Map<string, { classId: number; subclassId: number | null }>()

        for (const m of savedMappings) {
          if (m.kind === 'account' && m.targetBankId) {
            savedAccounts.set(foldName(m.sourceName), m.targetBankId)
          } else if (m.kind === 'card' && m.targetBankId) {
            savedCards.set(foldName(m.sourceName), m.targetBankId)
          } else if (m.kind === 'category' && m.targetClassId) {
            savedCategories.set(m.sourceName, { classId: m.targetClassId, subclassId: m.targetSubclassId })
            savedCategoriesFold.set(foldName(m.sourceName), { classId: m.targetClassId, subclassId: m.targetSubclassId })
          }
        }

        const mappingSources: MinhasFinancasMappingSources = {
          accounts: {},
          cards: {},
          categories: {},
        }

        for (const acc of parsed.accounts) {
          const savedBankId = savedAccounts.get(foldName(acc))
          const savedBank = savedBankId ? systemBanks.find((b) => b.id === savedBankId) : null
          if (savedBank) {
            accountsMap[acc] = savedBank.id
            mappingSources.accounts[acc] = 'saved'
          } else {
            const match = systemBanks.find((b) => foldName(b.name) === foldName(acc))
            if (match) {
              accountsMap[acc] = match.id
              mappingSources.accounts[acc] = 'exact'
            } else {
              accountsMap[acc] = null
              mappingSources.accounts[acc] = 'manual'
            }
          }
        }

        for (const card of parsed.cards) {
          const savedCardId = savedCards.get(foldName(card.name))
          const savedCard = savedCardId ? systemCards.find((b) => b.id === savedCardId) : null
          if (savedCard) {
            cardsMap[card.name] = savedCard.id
            mappingSources.cards[card.name] = 'saved'
          } else {
            const match = systemCards.find((b) => foldName(b.name) === foldName(card.name))
            if (match) {
              cardsMap[card.name] = match.id
              mappingSources.cards[card.name] = 'exact'
            } else {
              cardsMap[card.name] = null
              mappingSources.cards[card.name] = 'manual'
            }
          }
        }

        for (const item of parsed.categories) {
          const catKey = categoryMapKey(item.category, item.subcategory)
          const savedCat =
            savedCategories.get(catKey) ??
            savedCategoriesFold.get(foldName(catKey)) ??
            (item.subcategory
              ? savedCategories.get(categoryMapKey(item.category, '')) ??
                savedCategoriesFold.get(foldName(categoryMapKey(item.category, '')))
              : null)

          const savedClass = savedCat ? systemClasses.find((c) => c.id === savedCat.classId) : null
          if (savedClass && savedCat) {
            const validSub = savedCat.subclassId
              ? systemSubclasses.find((s) => s.id === savedCat.subclassId && s.classId === savedClass.id)
              : null
            categoriesMap[catKey] = {
              classId: savedClass.id,
              subclassId: validSub ? validSub.id : null,
            }
            mappingSources.categories[catKey] = 'saved'
          } else {
            const matchedClass = systemClasses.find(
              (c) => classFitsType(c.scope, defaultType, c.id, null) && foldName(c.name) === foldName(item.category),
            )
            const matchedSub =
              matchedClass && item.subcategory
                ? systemSubclasses.find(
                    (s) => s.classId === matchedClass.id && foldName(s.name) === foldName(item.subcategory),
                  )
                : null
            if (matchedClass) {
              categoriesMap[catKey] = {
                classId: matchedClass.id,
                subclassId: matchedSub ? matchedSub.id : null,
              }
              mappingSources.categories[catKey] = 'exact'
            } else {
              categoriesMap[catKey] = {
                classId: null,
                subclassId: null,
              }
              mappingSources.categories[catKey] = 'manual'
            }
          }
        }

        setMfFile(parsed)
        setMfMapping({
          accounts: accountsMap,
          cards: cardsMap,
          categories: categoriesMap,
        })
        setMfMappingSources(mappingSources)
        setDrafts(null)
        setError(null)
        setSavedCount(null)
        setInferenceNote(null)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível ler o extrato.')
      }
      return
    }

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
      setMfFile(null)
      setMfMapping(null)
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

  function setAccountMapping(accountName: string, targetBankId: number | null) {
    setMfMapping((prev) => (prev ? { ...prev, accounts: { ...prev.accounts, [accountName]: targetBankId } } : prev))
    setMfMappingSources((prev) =>
      prev ? { ...prev, accounts: { ...prev.accounts, [accountName]: 'manual' } } : prev,
    )
  }

  function setCardMapping(cardName: string, targetCardId: number | null) {
    setMfMapping((prev) => (prev ? { ...prev, cards: { ...prev.cards, [cardName]: targetCardId } } : prev))
    setMfMappingSources((prev) =>
      prev ? { ...prev, cards: { ...prev.cards, [cardName]: 'manual' } } : prev,
    )
  }

  function setCategoryMapping(catKey: string, classId: number | null, subclassId: number | null) {
    setMfMapping((prev) =>
      prev
        ? {
            ...prev,
            categories: {
              ...prev.categories,
              [catKey]: { classId, subclassId },
            },
          }
        : prev,
    )
    setMfMappingSources((prev) =>
      prev ? { ...prev, categories: { ...prev.categories, [catKey]: 'manual' } } : prev,
    )
  }

  function reopenMapping() {
    if (!mfFile || !mfMapping) return
    setDrafts(null)
    setError(null)
  }

  async function confirmMapping() {
    if (!mfFile || !mfMapping) return
    const unmappedAccount = mfFile.accounts.find((acc) => !mfMapping.accounts[acc])
    if (unmappedAccount) {
      setError(`Escolha ou crie a conta correspondente para "${unmappedAccount}".`)
      return
    }
    const unmappedCard = mfFile.cards.find((card) => !mfMapping.cards[card.name])
    if (unmappedCard) {
      setError(`Escolha ou crie o cartão correspondente para "${unmappedCard.name}".`)
      return
    }

    try {
      const toSave: ImportMappingInput[] = []
      for (const [acc, targetBankId] of Object.entries(mfMapping.accounts)) {
        if (targetBankId) {
          toSave.push({ kind: 'account', sourceName: acc, targetBankId })
        }
      }
      for (const [cardName, targetCardId] of Object.entries(mfMapping.cards)) {
        if (targetCardId) {
          toSave.push({ kind: 'card', sourceName: cardName, targetBankId: targetCardId })
        }
      }
      for (const [catKey, catMapping] of Object.entries(mfMapping.categories)) {
        if (catMapping.classId) {
          toSave.push({
            kind: 'category',
            sourceName: catKey,
            targetClassId: catMapping.classId,
            targetSubclassId: catMapping.subclassId,
          })
        }
      }
      if (toSave.length > 0) {
        await saveImportMappings(toSave)
      }

      const fresh = await reload()
      const targetBankIds = new Set<number>()
      for (const id of Object.values(mfMapping.accounts)) {
        if (id !== null) targetBankIds.add(id)
      }
      for (const id of Object.values(mfMapping.cards)) {
        if (id !== null) targetBankIds.add(id)
      }

      const existingByBank = new Map<number, Set<string>>()
      for (const id of targetBankIds) {
        existingByBank.set(
          id,
          new Set(fresh.flatMap((tx) => (ownsStatement(tx, id) ? [tx.externalId as string] : []))),
        )
      }

      const built = draftsFromMinhasFinancas(mfFile, mfMapping, existingByBank)
      setDrafts(built)
      setTabState('review')
      setView('list')
      setCursor(0)
      setError(null)
      setSavedCount(null)
      setInferenceNote(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível preparar a revisão.')
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
    patch: Partial<Pick<StatementDraft, 'title' | 'description' | 'notes' | 'type' | 'destinationBankId' | 'incoming' | 'lines' | 'paid'>>,
  ) {
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
    if (!drafts) return
    const draft = drafts.find((item) => item.key === key)
    if (!draft || draft.ignored) return
    const ownerId = effectiveBankId(draft)
    if (ownerId === null) return
    if (draft.done) {
      setDrafts(drafts.map((item) => (item.key === key ? { ...item, done: false } : item)))
      return
    }
    const issue = draftIssue(syncParts(draft), ownerId)
    setDrafts(
      drafts.map((item) =>
        item.key === key ? { ...syncParts(item), done: issue === null, notice: issue } : item,
      ),
    )
  }

  function markGroupDone(targetBankId: number) {
    if (!drafts) return
    let marked = 0
    let blocked = 0
    const next = drafts.map((draft) => {
      if (draft.ignored || draft.done || effectiveBankId(draft) !== targetBankId) return draft
      if (tab === 'inferred' && !draft.inferred) return draft
      if (tab === 'review' && draft.inferred) return draft
      const synced = syncParts(draft)
      const issue = draftIssue(synced, targetBankId)
      if (issue) {
        blocked += 1
        return { ...synced, notice: issue }
      }
      marked += 1
      return { ...synced, done: true, notice: null }
    })
    setDrafts(next)
    setInferenceNote(groupReadySentence(marked, blocked))
  }

  function markInferredDone() {
    if (!drafts) return
    let marked = 0
    let blocked = 0
    const next = drafts.map((draft) => {
      const ownerId = effectiveBankId(draft)
      if (!draft.inferred || draft.ignored || draft.done || ownerId === null) return draft
      const synced = syncParts(draft)
      const issue = draftIssue(synced, ownerId)
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
    if (!current || !drafts) return
    const ownerId = effectiveBankId(current)
    if (ownerId === null) return
    if (direction < 0) {
      setCursor((value) => Math.max(0, value - 1))
      return
    }
    const issue = draftIssue(syncParts(current), ownerId)
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
    const ownerId = current ? effectiveBankId(current) : bankId
    if (ownerId === null || !drafts) throw new Error('Importe um extrato antes de criar a regra.')
    const created = await saveImportRule({ ...input, bankId: ownerId })
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
    if (!drafts) return
    setFinishing(true)
    setError(null)
    const seen = new Set<string>()
    const rows: ImportRow[] = []
    const sendBack = new Set<string>()
    const blocked = new Map<string, string>()

    for (const draft of drafts) {
      if (draft.ignored || !draft.done) continue
      const ownerId = effectiveBankId(draft)
      if (ownerId === null) {
        blocked.set(draft.key, 'Escolha um banco.')
        continue
      }
      const synced = syncParts(draft)
      const issue = draftIssue(synced, ownerId)
      if (issue) {
        blocked.set(draft.key, issue)
        continue
      }
      const existingInOwner = transactions.some(
        (tx) => ownsStatement(tx, ownerId) && tx.externalId === draft.externalId,
      )
      const seenKey = `${ownerId}:${draft.externalId}`
      if (existingInOwner || seen.has(seenKey)) {
        sendBack.add(draft.key)
        continue
      }
      seen.add(seenKey)
      const creditTransfer = synced.type === 'transfer' && synced.incoming
      rows.push({
        type: synced.type as TransactionType,
        bankId: creditTransfer ? (synced.destinationBankId as number) : ownerId,
        destinationBankId:
          synced.type === 'transfer' ? (creditTransfer ? ownerId : synced.destinationBankId) : null,
        externalBankId: creditTransfer ? ownerId : null,
        externalId: synced.externalId,
        title: synced.title.trim(),
        description: synced.description,
        notes: synced.notes,
        amountCents: synced.amountCents,
        occurredOn: synced.occurredOn,
        paid: synced.paid,
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
      const requestBankId = bankId ?? rows[0]?.externalBankId ?? rows[0]?.bankId ?? 0
      const count = await importTransactions({ bankId: requestBankId, rows })
      const savedKeys = new Set(rows.map((row) => `${row.externalBankId ?? row.bankId}:${row.externalId}`))
      const remaining = drafts
        .filter((draft) => {
          const ownerId = effectiveBankId(draft)
          return !savedKeys.has(`${ownerId}:${draft.externalId}`)
        })
        .map(keep)
      setDrafts(suggest(remaining, bankId))
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
      setMfFile(null)
      setMfMapping(null)
      setMfMappingSources(null)
      setDrafts(null)
    },
    standardId,
    setStandardId: (next: string) => {
      setStandardId(next)
      setMfFile(null)
      setMfMapping(null)
      setMfMappingSources(null)
      setDrafts(null)
    },
    standards,
    isMultiBank,
    mfFile,
    mfMapping,
    mfMappingSources,
    setAccountMapping,
    setCardMapping,
    setCategoryMapping,
    reopenMapping,
    confirmMapping,
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
    markGroupDone,
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
