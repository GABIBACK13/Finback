import type { PartInput, TransactionType } from '../../db/types.ts'
import type { SplitLine } from '../../lib/split.ts'

export type StatementFormat = 'pdf' | 'csv' | 'excel'

export type StatementStandard = {
  id: string
  label: string
}

export type ParsedStatementRow = {
  occurredOn: string
  title: string
  externalId: string
  type: 'debit' | 'credit' | null
  amountCents: number
  description: string
  statementBalanceLabel: string
  typeNeedsChoice: boolean
  missingExternalId: boolean
  invalidAmount: boolean
}

export type StatementDraft = {
  key: string
  occurredOn: string
  title: string
  description: string
  balanceDescription: string
  notes: string
  type: TransactionType | null
  amountCents: number
  externalId: string
  statementBalanceLabel: string
  destinationBankId: number | null
  incoming: boolean
  lines: SplitLine[]
  parts: PartInput[]
  ignored: boolean
  lockedIgnored: boolean
  duplicate: boolean
  done: boolean
  inferred: boolean
  skipped: boolean
  touched: boolean
  typeNeedsChoice: boolean
  notice: string | null
}

export type SavedTitleMatch = {
  title: string
  type: TransactionType
  description: string | null
  occurredOn: string
  id: number
  parts: PartInput[]
}
