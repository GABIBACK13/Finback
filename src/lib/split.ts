import type { PartInput } from '../db/types.ts'
import { centsToInput, parseReais } from './money.ts'

export type SplitAmount = {
  amountCents: number
}

export type SplitLine = {
  key: string
  classId: string
  subclassId: string
  amount: string
}

export function emptySplitLine(): SplitLine {
  return { key: crypto.randomUUID(), classId: '', subclassId: '', amount: '' }
}

export function splitLinesFromParts(
  parts: readonly { classId: number; subclassId: number | null; amountCents: number }[],
): SplitLine[] {
  return parts.map((part) => ({
    key: crypto.randomUUID(),
    classId: String(part.classId),
    subclassId: part.subclassId ? String(part.subclassId) : '',
    amount: centsToInput(part.amountCents),
  }))
}

export function withAnchor(lines: readonly SplitLine[], totalCents: number | null): SplitLine[] {
  if (lines.length === 0) return []
  const next = lines.map((line) => ({ ...line }))
  const first = next[0]
  if (!first || totalCents === null || totalCents <= 0) return next

  let used = 0
  for (const line of next.slice(1)) {
    const cents = parseReais(line.amount)
    if (cents !== null) used += cents
  }
  first.amount = centsToInput(Math.max(0, totalCents - used))
  return next
}

export function partsFromSplitLines(
  lines: readonly SplitLine[],
): { ok: true; parts: PartInput[] } | { ok: false; error: string } {
  if (lines.length === 0) return { ok: true, parts: [] }
  const [anchor, ...rest] = lines
  if (!anchor) return { ok: true, parts: [] }

  const parts: PartInput[] = []
  for (const line of rest) {
    if (!line.classId && !line.subclassId && !line.amount.trim()) continue
    if (!line.classId) return { ok: false, error: 'Escolha a classe de cada parte.' }
    const amountCents = parseReais(line.amount)
    if (amountCents === null) return { ok: false, error: 'Informe o valor de cada classe.' }
    parts.push({
      classId: Number(line.classId),
      subclassId: line.subclassId ? Number(line.subclassId) : null,
      amountCents,
    })
  }

  const anchorCents = parseReais(anchor.amount)
  if (anchorCents === null) {
    if (anchor.classId || anchor.subclassId) {
      if (anchor.amount.trim() && anchor.amount.trim() !== '0,00') {
        return { ok: false, error: 'Informe o valor de cada classe.' }
      }
    }
    return { ok: true, parts }
  }
  if (!anchor.classId) {
    if (parts.length === 0 && !anchor.subclassId) return { ok: true, parts: [] }
    return { ok: false, error: 'Escolha a classe do valor restante.' }
  }
  parts.unshift({
    classId: Number(anchor.classId),
    subclassId: anchor.subclassId ? Number(anchor.subclassId) : null,
    amountCents: anchorCents,
  })
  return { ok: true, parts }
}

export function remainderCents(totalCents: number, amounts: readonly number[]): number {
  const used = amounts.reduce((sum, amount) => sum + amount, 0)
  return totalCents - used
}

export function linesForSuggestion(
  parts: readonly { classId: number; subclassId: number | null; amountCents: number }[],
  totalCents: number | null,
): SplitLine[] {
  if (parts.length === 0) return []
  if (totalCents !== null && totalCents > 0) {
    return withAnchor(splitLinesFromParts(scaleParts(parts, totalCents)), totalCents)
  }
  const main = [...parts].sort((left, right) => right.amountCents - left.amountCents)[0]
  if (!main) return []
  return [
    {
      key: crypto.randomUUID(),
      classId: String(main.classId),
      subclassId: main.subclassId ? String(main.subclassId) : '',
      amount: '',
    },
  ]
}

export function scaleParts<T extends SplitAmount>(parts: readonly T[], totalCents: number): T[] {
  if (parts.length === 0 || totalCents <= 0) return []
  const source = parts.reduce((sum, part) => sum + part.amountCents, 0)
  if (source <= 0) return []

  const scaled = parts.map((part) => Math.floor((part.amountCents * totalCents) / source))
  const assigned = scaled.reduce((sum, amount) => sum + amount, 0)
  scaled[scaled.length - 1] += totalCents - assigned

  return parts.flatMap((part, index) => {
    const amountCents = scaled[index] ?? 0
    if (amountCents <= 0) return []
    return [{ ...part, amountCents }]
  })
}
