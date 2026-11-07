import type { ImportRule } from '../../db/types.ts'
import { scaleParts, splitLinesFromParts } from '../../lib/split.ts'
import { titleKey } from './classify.ts'
import type { StatementDraft } from './types.ts'

// % é um trecho qualquer e _ é um caractere, como o texto digitado na regra.
export function containsPattern(text: string, pattern: string): boolean {
  const source = titleKey(text)
  const raw = titleKey(pattern)
  if (!source || !raw) return false
  let expression = '^'
  for (const char of raw) {
    if (char === '%') expression += '.*'
    else if (char === '_') expression += '.'
    else expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  expression += '$'
  return new RegExp(expression, 'u').test(source)
}

export function ruleMatches(rule: ImportRule, title: string): boolean {
  if (rule.matchKind === 'equals') return titleKey(title) === titleKey(rule.pattern) && titleKey(title) !== ''
  return containsPattern(title, rule.pattern)
}

// Igual vence contém, e o padrão mais longo vence o mais curto. Não inferir entra nessa mesma ordem.
export function bestRule(rules: readonly ImportRule[], title: string): ImportRule | null {
  const matches = rules.filter((rule) => ruleMatches(rule, title))
  matches.sort((left, right) => {
    if (left.matchKind !== right.matchKind) return left.matchKind === 'equals' ? -1 : 1
    const byLength = right.pattern.length - left.pattern.length
    if (byLength !== 0) return byLength
    return right.id - left.id
  })
  return matches[0] ?? null
}

export function skipsInference(rules: readonly ImportRule[], title: string): boolean {
  return bestRule(rules, title)?.effect === 'skip'
}

export function applyRules(drafts: readonly StatementDraft[], rules: readonly ImportRule[]): StatementDraft[] {
  return drafts.map((draft) => {
    const rule = bestRule(rules, draft.title)
    const skipped = rule?.effect === 'skip'
    if (draft.touched || draft.ignored || draft.lockedIgnored) return { ...draft, skipped }
    if (!rule || draft.amountCents <= 0) return { ...draft, skipped: false }
    if (rule.effect === 'skip' || rule.classId === null) {
      const automatic = draft.inferred || draft.parts.length > 0
      return {
        ...draft,
        description: automatic ? '' : draft.description,
        parts: [],
        lines: automatic ? [] : draft.lines,
        inferred: false,
        skipped: true,
        done: automatic ? false : draft.done,
      }
    }
    const parts = [{ classId: rule.classId, subclassId: rule.subclassId, amountCents: draft.amountCents }]
    return {
      ...draft,
      description: rule.description,
      parts,
      lines: splitLinesFromParts(parts),
      inferred: true,
      skipped: false,
    }
  })
}

export function inferEquals(
  drafts: readonly StatementDraft[],
  sourceKey: string,
  rules: readonly ImportRule[],
): StatementDraft[] {
  const source = drafts.find((draft) => draft.key === sourceKey)
  if (!source) return [...drafts]
  const key = titleKey(source.title)
  if (!key || source.parts.length === 0) return [...drafts]
  return drafts.map((draft) => {
    if (draft.key === source.key || draft.touched || draft.ignored || draft.lockedIgnored) return draft
    if (skipsInference(rules, draft.title)) return draft
    if (titleKey(draft.title) !== key || draft.amountCents <= 0) return draft
    const parts = scaleParts(source.parts, draft.amountCents).map((part) => ({
      classId: part.classId,
      subclassId: part.subclassId,
      amountCents: part.amountCents,
    }))
    return {
      ...draft,
      description: source.description,
      parts,
      lines: splitLinesFromParts(parts),
      inferred: true,
    }
  })
}
