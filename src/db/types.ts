export type TransactionType = 'debit' | 'credit' | 'transfer' | 'demonstrative'

export type ClassScope = 'debit' | 'credit' | 'transfer' | null

export type BankKind = 'bank' | 'card'

export type Bank = {
  id: number
  name: string
  kind: BankKind
  parentBankId: number | null
  parentBankName: string | null
  closingDay: number | null
  limitCents: number | null
  usedLimitCents: number | null
  availableLimitCents: number | null
  balanceCents: number
}

export type BankInput = {
  name: string
  kind?: BankKind
  parentBankId?: number | null
  closingDay?: number | null
  limitCents?: number | null
}

export type ClassRecord = {
  id: number
  name: string
  scope: ClassScope
}

export type SubclassRecord = {
  id: number
  classId: number
  name: string
}

export type PartInput = {
  classId: number
  subclassId: number | null
  amountCents: number
}

export type PartRecord = PartInput & {
  className: string
  subclassName: string | null
}

export type TransactionInput = {
  id: number | null
  type: TransactionType
  bankId: number
  destinationBankId: number | null
  title: string
  description: string
  notes: string
  amountCents: number
  occurredOn: string
  paid?: boolean
  parts: PartInput[]
}

export type TransactionRecord = {
  id: number
  type: TransactionType
  bankId: number
  bankName: string
  destinationBankId: number | null
  destinationBankName: string | null
  externalBankId: number | null
  externalId: string | null
  title: string
  description: string | null
  notes: string | null
  amountCents: number
  occurredOn: string
  paid: boolean
  parts: PartRecord[]
}

export type DescriptionSuggestion = {
  description: string
  parts: PartRecord[]
}

export type ImportRow = {
  type: TransactionType
  bankId: number
  destinationBankId: number | null
  externalBankId: number | null
  externalId: string
  title: string
  description: string
  notes: string
  amountCents: number
  occurredOn: string
  paid: boolean
  parts: PartInput[]
}

export type ImportRequest = {
  bankId: number
  rows: ImportRow[]
}

export type ImportChangeAction = 'create' | 'update' | 'delete'

export type ImportBatch = {
  id: number
  bankId: number
  bankName: string
  createdAt: string
  createdDebit: number
  createdCredit: number
  createdTransfer: number
  createdDemonstrative: number
  pending: number
}

export type ImportChange = {
  id: number
  action: ImportChangeAction
  type: TransactionType
  title: string
  amountCents: number
  occurredOn: string
  revertedAt: string | null
  missing: boolean
}

export type ImportMatchKind = 'equals' | 'contains'

export type ImportRuleEffect = 'classify' | 'skip'

export type ImportRule = {
  id: number
  bankId: number
  matchKind: ImportMatchKind
  pattern: string
  effect: ImportRuleEffect
  classId: number | null
  subclassId: number | null
  description: string
}

export type ImportRuleInput = {
  bankId: number
  matchKind: ImportMatchKind
  pattern: string
  effect: ImportRuleEffect
  classId: number | null
  subclassId: number | null
  description: string
}

export type DashboardQuery = {
  bankId: number | null
  from: string | null
  to: string | null
}

export type FlowMonth = {
  month: string
  creditCents: number
  debitCents: number
  transferInCents: number
  transferOutCents: number
  demonstrativeCents: number
  creditCount: number
  debitCount: number
}

export type ClassAmount = {
  classId: number
  className: string
  amountCents: number
  count: number
}

export type SubclassAmount = {
  className: string
  subclassName: string
  amountCents: number
}

export type StackedFlow = {
  months: string[]
  series: { name: string; values: number[] }[]
}

export type BankPeriod = {
  bankId: number
  bankName: string
  kind: BankKind
  parentBankName: string | null
  balanceCents: number
  creditCents: number
  debitCents: number
  transferInCents: number
  transferOutCents: number
}

export type TitleAmount = {
  title: string
  amountCents: number
  count: number
}

export type WeekdayFlow = {
  weekday: number
  creditCents: number
  debitCents: number
}

export type DailyFlow = {
  day: string
  creditCents: number
  debitCents: number
}

export type BalancePoint = {
  label: string
  balanceCents: number
}

export type TransferPeer = {
  bankName: string
  direction: 'in' | 'out'
  amountCents: number
}

export type LargestMovement = {
  title: string
  amountCents: number
  occurredOn: string
}

export type DashboardSnapshot = {
  balanceCents: number
  openingCents: number
  creditCents: number
  debitCents: number
  transferInCents: number
  transferOutCents: number
  demonstrativeCents: number
  creditCount: number
  debitCount: number
  unclassifiedDebitCents: number
  unclassifiedDebitCount: number
  unclassifiedCreditCents: number
  unclassifiedCreditCount: number
  largestDebit: LargestMovement | null
  largestCredit: LargestMovement | null
  months: FlowMonth[]
  balanceSeries: BalancePoint[]
  days: DailyFlow[]
  weekdays: WeekdayFlow[]
  debitClasses: ClassAmount[]
  creditClasses: ClassAmount[]
  transferClasses: ClassAmount[]
  debitSubclasses: SubclassAmount[]
  creditSubclasses: SubclassAmount[]
  debitStack: StackedFlow
  banks: BankPeriod[]
  debitTitles: TitleAmount[]
  creditTitles: TitleAmount[]
  transferPeers: TransferPeer[]
}

export type ImportMappingKind = 'account' | 'card' | 'category'

export type ImportMappingRecord = {
  id: number
  kind: ImportMappingKind
  sourceName: string
  targetBankId: number | null
  targetClassId: number | null
  targetSubclassId: number | null
}

export type ImportMappingInput = {
  kind: ImportMappingKind
  sourceName: string
  targetBankId?: number | null
  targetClassId?: number | null
  targetSubclassId?: number | null
}
