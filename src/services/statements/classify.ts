import type { PartInput } from '../../db/types.ts'
import { partsFromSplitLines, scaleParts, splitLinesFromParts } from '../../lib/split.ts'
import type { SavedTitleMatch, StatementDraft } from './types.ts'

export function titleKey(title: string): string {
  return title.trim().toLocaleLowerCase('pt-BR')
}

function historyKey(type: string | null, title: string) {
  return `${type ?? ''}|${titleKey(title)}`
}

function newestSaved(saved: readonly SavedTitleMatch[]): Map<string, SavedTitleMatch> {
  const ranked = [...saved].sort((left, right) => left.occurredOn.localeCompare(right.occurredOn) || left.id - right.id)
  const byTitle = new Map<string, SavedTitleMatch>()
  for (const row of ranked) {
    if (row.parts.length === 0) continue
    byTitle.set(historyKey(row.type, row.title), row)
  }
  return byTitle
}

export function applyTitleSuggestions(
  drafts: readonly StatementDraft[],
  saved: readonly SavedTitleMatch[],
  blocked: (title: string) => boolean = () => false,
  markInferred = false,
): StatementDraft[] {
  const savedByTitle = newestSaved(saved)
  const touchedByTitle = new Map<string, StatementDraft>()
  for (const draft of drafts) {
    if (!draft.touched || draft.parts.length === 0) continue
    touchedByTitle.set(historyKey(draft.type, draft.title), draft)
  }

  return drafts.map((draft) => {
    if (draft.touched || draft.inferred || blocked(draft.title)) return draft
    const source = touchedByTitle.get(historyKey(draft.type, draft.title)) ?? savedByTitle.get(historyKey(draft.type, draft.title))
    if (!source || source.parts.length === 0) {
      return { ...draft, description: '', parts: [], lines: [] }
    }
    const parts = scaleParts(source.parts, draft.amountCents).map((part) => ({
      classId: part.classId,
      subclassId: part.subclassId,
      amountCents: part.amountCents,
    }))
    if (parts.length === 0) return draft
    const description = source.description?.trim() ? source.description : ''
    return {
      ...draft,
      description,
      parts,
      lines: splitLinesFromParts(parts),
      inferred: markInferred,
    }
  })
}

export function draftIssue(draft: StatementDraft, bankId: number): string | null {
  if (!draft.title.trim()) return 'Informe um título.'
  if (!draft.occurredOn) return 'Informe uma data válida.'
  if (draft.amountCents <= 0) return 'Informe um valor maior que zero.'
  if (draft.type === null) return 'Escolha o tipo do lançamento.'
  if (draft.type === 'transfer') {
    if (draft.destinationBankId === null) {
      return draft.incoming ? 'Escolha o banco de origem.' : 'Escolha o banco de destino.'
    }
    if (draft.destinationBankId === bankId) return 'A transferência precisa de dois bancos diferentes.'
  }
  const parsed = partsFromSplitLines(draft.lines)
  if (!parsed.ok) return parsed.error
  if (parsed.parts.length > 0) {
    const sum = parsed.parts.reduce((total, part) => total + part.amountCents, 0)
    if (sum !== draft.amountCents) return 'A soma das classes tem de ser igual ao valor do lançamento.'
  }
  return null
}

export function partsFromDraft(parts: readonly PartInput[]): PartInput[] {
  return parts.map((part) => ({
    classId: part.classId,
    subclassId: part.subclassId,
    amountCents: part.amountCents,
  }))
}
