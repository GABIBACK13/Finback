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
  bankId?: number
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
  paid: boolean
  notice: string | null
}

export type MinhasFinancasRow = {
  lineIndex: number
  title: string
  amountCents: number
  occurredOn: string
  notes: string
  category: string
  subcategory: string
  card: string | null
  account: string
  destinationAccount: string | null
  externalId: string
  invalidAmount: boolean
}

export type MinhasFinancasCardInfo = {
  name: string
  defaultAccount: string | null
}

export type MinhasFinancasCategoryItem = {
  key: string
  category: string
  subcategory: string
}

export type MinhasFinancasFile = {
  defaultType: 'debit' | 'credit' | 'transfer'
  rows: MinhasFinancasRow[]
  accounts: string[]
  cards: MinhasFinancasCardInfo[]
  categories: MinhasFinancasCategoryItem[]
}

export type MappingSource = 'saved' | 'exact' | 'manual'

export type MinhasFinancasMappingSources = {
  accounts: Record<string, MappingSource>
  cards: Record<string, MappingSource>
  categories: Record<string, MappingSource>
}

export type MinhasFinancasMapping = {
  accounts: Record<string, number | null>
  cards: Record<string, number | null>
  categories: Record<string, { classId: number | null; subclassId: number | null }>
}

export type SavedTitleMatch = {
  title: string
  type: TransactionType
  description: string | null
  occurredOn: string
  id: number
  parts: PartInput[]
}
