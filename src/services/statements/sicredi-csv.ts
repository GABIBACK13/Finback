import { formatCents, parseSignedReais } from '../../lib/money.ts'
import type { ParsedStatementRow } from './types.ts'

const header = 'Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo'

function isCivilDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function civilDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (!isCivilDate(year, month, day)) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).trim()
  return trimmed
}

function balanceLabel(raw: string): string {
  const signed = parseSignedReais(raw)
  const shown = signed === null ? raw.trim() : formatCents(Math.abs(signed))
  return `Saldo após o lançamento: ${shown}`
}

export function decodeStatement(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export function parseSicrediCsv(text: string): ParsedStatementRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const [first, ...rest] = lines
  if (!first || first.split(';').map(unquote).join(';') !== header) {
    throw new Error('Este CSV não está no padrão Sicredi.')
  }
  if (rest.length === 0) throw new Error('O extrato não tem lançamentos.')

  return rest.map((line) => {
    const columns = line.split(';').map(unquote)
    const [dateRaw = '', title = '', , externalId = '', kind = '', amountRaw = '', balanceRaw = ''] = columns
    const occurredOn = civilDate(dateRaw)
    const signed = parseSignedReais(amountRaw)
    const invalidAmount = signed === null || signed === 0 || columns.length < 7 || occurredOn === null
    const normalizedKind = kind.trim().toUpperCase()
    const type = normalizedKind === 'CREDITO' ? 'credit' : normalizedKind === 'DEBITO' ? 'debit' : null
    const label = balanceLabel(balanceRaw)
    return {
      occurredOn: occurredOn ?? '',
      title: title.trim(),
      externalId: externalId.trim(),
      type,
      amountCents: signed === null ? 0 : Math.abs(signed),
      description: '',
      statementBalanceLabel: label,
      typeNeedsChoice: type === null,
      missingExternalId: externalId.trim().length === 0,
      invalidAmount,
    }
  })
}
