import type { ParsedStatementRow, StatementDraft, StatementFormat, StatementStandard } from './types.ts'

export type { StatementFormat, StatementStandard }

export const statementStandards: Record<StatementFormat, readonly StatementStandard[]> = {
  csv: [
    { id: 'sicredi', label: 'Padrão Sicredi' },
    { id: 'minhas-financas-debito', label: 'Débitos Minhas Finanças' },
    { id: 'minhas-financas-credito', label: 'Créditos Minhas Finanças' },
    { id: 'minhas-financas-transferencia', label: 'Transferências Minhas Finanças' },
  ],
  pdf: [],
  excel: [],
}

export function formatLabel(format: StatementFormat): string {
  if (format === 'pdf') return 'PDF'
  if (format === 'excel') return 'Excel'
  return 'CSV'
}

function byOldestDate(rows: readonly ParsedStatementRow[]): ParsedStatementRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      if (!left.row.occurredOn && !right.row.occurredOn) return left.index - right.index
      if (!left.row.occurredOn) return 1
      if (!right.row.occurredOn) return -1
      const byDate = left.row.occurredOn.localeCompare(right.row.occurredOn)
      return byDate === 0 ? left.index - right.index : byDate
    })
    .map((item) => item.row)
}

export function draftsFromParsed(
  rows: readonly ParsedStatementRow[],
  existingExternalIds: ReadonlySet<string>,
): StatementDraft[] {
  const seenInFile = new Set<string>()
  return byOldestDate(rows).map((row, index) => {
    const inBank = row.externalId.length > 0 && existingExternalIds.has(row.externalId)
    const repeatedInFile = row.externalId.length > 0 && seenInFile.has(row.externalId)
    if (row.externalId) seenInFile.add(row.externalId)
    const duplicate = inBank || repeatedInFile
    const lockedIgnored = row.missingExternalId || row.invalidAmount
    let notice: string | null = null
    if (row.missingExternalId) notice = 'Linha sem identificador.'
    else if (row.invalidAmount) notice = 'Não foi possível ler a data ou o valor.'
    else if (inBank) notice = 'Este identificador já existe neste banco.'
    else if (repeatedInFile) notice = 'Identificador repetido neste arquivo.'
    else if (row.typeNeedsChoice) notice = 'Confira o tipo deste lançamento.'
    return {
      key: `${index}-${row.externalId || 'sem-id'}`,
      occurredOn: row.occurredOn,
      title: row.title,
      description: '',
      balanceDescription: '',
      notes: row.statementBalanceLabel,
      type: row.type,
      amountCents: row.amountCents,
      externalId: row.externalId,
      statementBalanceLabel: row.statementBalanceLabel,
      destinationBankId: null,
      incoming: false,
      lines: [],
      parts: [],
      ignored: lockedIgnored || duplicate,
      lockedIgnored,
      duplicate,
      done: false,
      inferred: false,
      skipped: false,
      touched: false,
      typeNeedsChoice: row.typeNeedsChoice,
      paid: true,
      notice,
    }
  })
}
