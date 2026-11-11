import type { PartInput } from '../../db/types.ts'
import { parseReais } from '../../lib/money.ts'
import { splitLinesFromParts } from '../../lib/split.ts'
import type {
  MinhasFinancasCardInfo,
  MinhasFinancasCategoryItem,
  MinhasFinancasFile,
  MinhasFinancasMapping,
  MinhasFinancasRow,
  StatementDraft,
} from './types.ts'

function isCivilDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function civilDateFromBr(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (!isCivilDate(year, month, day)) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

function foldHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

// Lê registros CSV respeitando quebras de linha dentro de campos entre aspas (ex.: Observações com ISPB).
export function parseCsvRecords(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i]
    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else if (char === '\r') {
        if (cleaned[i + 1] === '\n') i += 1
        current += ' '
      } else if (char === '\n') {
        current += ' '
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(current.trim())
      current = ''
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && cleaned[i + 1] === '\n') i += 1
      row.push(current.trim())
      current = ''
      if (row.some((cell) => cell.length > 0)) {
        records.push(row)
      }
      row = []
    } else {
      current += char
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim())
    if (row.some((cell) => cell.length > 0)) {
      records.push(row)
    }
  }

  return records
}

function parseZeroOrPositiveCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/^[+-]/, '')
  if (!trimmed || trimmed === '-' || /^0+([.,]0+)?$/.test(trimmed)) return 0
  return parseReais(trimmed)
}

export function categoryMapKey(category: string, subcategory: string): string {
  return `${category.trim()}::${subcategory.trim()}`
}

export function parseMinhasFinancasCsv(
  text: string,
  requestedType: 'debit' | 'credit' | 'transfer',
): MinhasFinancasFile {
  const records = parseCsvRecords(text)
  const [headerRow, ...rest] = records
  if (!headerRow || headerRow.length < 5) {
    throw new Error('Este CSV não está no padrão Minhas Finanças.')
  }

  const colIndex = new Map<string, number>()
  headerRow.forEach((col, index) => {
    const key = foldHeader(col)
    if (key && !colIndex.has(key)) {
      colIndex.set(key, index)
    }
  })

  const hasDescricao = colIndex.has('descricao')
  const hasValor = colIndex.has('valor')
  const hasVencimento = colIndex.has('vencimento')
  const hasOrigem = colIndex.has('origem')
  const hasDestino = colIndex.has('destino')
  const hasConta = colIndex.has('conta')

  if (!hasDescricao || !hasValor || !hasVencimento || (!hasConta && (!hasOrigem || !hasDestino))) {
    throw new Error('Este CSV não está no padrão Minhas Finanças.')
  }
  if (rest.length === 0) {
    throw new Error('O extrato não tem lançamentos.')
  }

  const effectiveType: 'debit' | 'credit' | 'transfer' =
    hasOrigem && hasDestino ? 'transfer' : requestedType === 'transfer' ? 'debit' : requestedType

  const getCell = (cols: readonly string[], name: string): string => {
    const idx = colIndex.get(name)
    return idx !== undefined ? (cols[idx] ?? '').trim() : ''
  }

  const accountsSet = new Set<string>()
  const cardsMap = new Map<string, string | null>()
  const categoriesMap = new Map<string, MinhasFinancasCategoryItem>()
  const seenKeyCounts = new Map<string, number>()

  const rows: MinhasFinancasRow[] = rest.map((cols, index) => {
    const title = getCell(cols, 'descricao')
    const valorRaw = getCell(cols, 'valor')
    const encargosRaw = getCell(cols, 'encargos')
    const lancamentoRaw = getCell(cols, 'lancamento')
    const vencimentoRaw = getCell(cols, 'vencimento')
    const recorrenciaRaw = getCell(cols, 'recorrencia')
    const parcelaRaw = getCell(cols, 'parcela')
    const parcelasRaw = getCell(cols, 'parcelas')
    const categoriaRaw = getCell(cols, 'categoria')
    const subcategoriaRaw = getCell(cols, 'subcategoria')
    const cartaoRaw = getCell(cols, 'cartao')
    const contaRaw = getCell(cols, 'conta')
    const origemRaw = getCell(cols, 'origem')
    const destinoRaw = getCell(cols, 'destino')
    const obsRaw = getCell(cols, 'observacoes').replace(/\s+/g, ' ').trim()
    const tagsRaw = getCell(cols, 'tags')

    const valorCents = parseZeroOrPositiveCents(valorRaw)
    const encargosCents = parseZeroOrPositiveCents(encargosRaw)
    const totalCents = valorCents !== null && encargosCents !== null ? valorCents + encargosCents : 0
    const occurredOn = civilDateFromBr(vencimentoRaw) ?? civilDateFromBr(lancamentoRaw) ?? ''
    const invalidAmount = valorCents === null || encargosCents === null || totalCents <= 0 || !occurredOn

    const card = cartaoRaw && cartaoRaw !== '-' ? cartaoRaw : null

    let account = ''
    let destinationAccount: string | null = null

    if (effectiveType === 'transfer') {
      account = origemRaw && origemRaw !== '-' ? origemRaw : 'Sem conta'
      destinationAccount = destinoRaw && destinoRaw !== '-' ? destinoRaw : 'Sem conta'
      accountsSet.add(account)
      accountsSet.add(destinationAccount)
    } else {
      account = contaRaw && contaRaw !== '-' ? contaRaw : card ? '' : 'Sem conta'
      if (account) {
        accountsSet.add(account)
      }
      if (card) {
        const existingDefault = cardsMap.get(card)
        if (existingDefault === undefined) {
          cardsMap.set(card, account || null)
        } else if (existingDefault === null && account) {
          cardsMap.set(card, account)
        }
      }
    }

    let category = ''
    let subcategory = ''
    if (effectiveType !== 'transfer') {
      category = categoriaRaw && categoriaRaw !== '-' ? categoriaRaw : 'Sem categoria'
      subcategory = subcategoriaRaw && subcategoriaRaw !== '-' ? subcategoriaRaw : ''
      const catKey = categoryMapKey(category, subcategory)
      if (!categoriesMap.has(catKey)) {
        categoriesMap.set(catKey, { key: catKey, category, subcategory })
      }
    }

    const noteParts: string[] = []
    if (obsRaw) noteParts.push(obsRaw)
    if (tagsRaw) noteParts.push(`Tags: ${tagsRaw}`)
    if (recorrenciaRaw && recorrenciaRaw.toLocaleLowerCase('pt-BR') !== 'nenhuma' && recorrenciaRaw !== '-') {
      noteParts.push(`Recorrência: ${recorrenciaRaw}`)
    }
    const parcelaNum = Number(parcelaRaw)
    const parcelasNum = Number(parcelasRaw)
    if (Number.isInteger(parcelaNum) && parcelaNum > 0 && Number.isInteger(parcelasNum) && parcelasNum > 0) {
      noteParts.push(`Parcela: ${parcelaNum}/${parcelasNum}`)
    } else if (parcelaRaw && parcelaRaw !== '0' && parcelaRaw !== '-') {
      noteParts.push(`Parcela: ${parcelaRaw}${parcelasRaw && parcelasRaw !== '0' ? `/${parcelasRaw}` : ''}`)
    }
    if (lancamentoRaw && lancamentoRaw !== '-') {
      noteParts.push(`Lançamento: ${lancamentoRaw}`)
    }

    const baseSig = `mf:${effectiveType}:${occurredOn}:${lancamentoRaw}:${totalCents}:${title}:${category}:${subcategory}:${card ?? ''}:${account}:${destinationAccount ?? ''}`
    const count = (seenKeyCounts.get(baseSig) ?? 0) + 1
    seenKeyCounts.set(baseSig, count)
    const externalId = `${baseSig}#${count}`

    return {
      lineIndex: index,
      title,
      amountCents: totalCents,
      occurredOn,
      notes: noteParts.join(' · '),
      category,
      subcategory,
      card,
      account,
      destinationAccount,
      externalId,
      invalidAmount,
    }
  })

  const accounts = [...accountsSet].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const cards: MinhasFinancasCardInfo[] = [...cardsMap.entries()]
    .map(([name, defaultAccount]) => ({ name, defaultAccount }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const categories = [...categoriesMap.values()].sort(
    (a, b) => a.category.localeCompare(b.category, 'pt-BR') || a.subcategory.localeCompare(b.subcategory, 'pt-BR'),
  )

  return {
    defaultType: effectiveType,
    rows,
    accounts,
    cards,
    categories,
  }
}

function byOldestDate(rows: readonly MinhasFinancasRow[]): MinhasFinancasRow[] {
  return [...rows].sort((left, right) => {
    if (!left.occurredOn && !right.occurredOn) return left.lineIndex - right.lineIndex
    if (!left.occurredOn) return 1
    if (!right.occurredOn) return -1
    const byDate = left.occurredOn.localeCompare(right.occurredOn)
    return byDate === 0 ? left.lineIndex - right.lineIndex : byDate
  })
}

export function draftsFromMinhasFinancas(
  file: MinhasFinancasFile,
  mapping: MinhasFinancasMapping,
  existingByBank: ReadonlyMap<number, ReadonlySet<string>>,
): StatementDraft[] {
  const seenInFile = new Set<string>()
  return byOldestDate(file.rows).map((row, index) => {
    const targetBankId = row.card ? (mapping.cards[row.card] ?? null) : (mapping.accounts[row.account] ?? null)
    const targetDestBankId =
      file.defaultType === 'transfer' && row.destinationAccount
        ? (mapping.accounts[row.destinationAccount] ?? null)
        : null

    const existing = targetBankId !== null ? existingByBank.get(targetBankId) : undefined
    const inBank = Boolean(row.externalId && existing?.has(row.externalId))
    const fileSig = `${targetBankId ?? 'none'}:${row.externalId}`
    const repeatedInFile = Boolean(row.externalId && seenInFile.has(fileSig))
    if (row.externalId) seenInFile.add(fileSig)

    const missingTransferPeer = file.defaultType === 'transfer' && targetDestBankId === null
    const sameTransferPeer =
      file.defaultType === 'transfer' && targetBankId !== null && targetBankId === targetDestBankId
    const duplicate = inBank || repeatedInFile
    const lockedIgnored = row.invalidAmount || targetBankId === null || missingTransferPeer || sameTransferPeer

    let notice: string | null = null
    if (targetBankId === null || missingTransferPeer) notice = 'Conta ou cartão não mapeado.'
    else if (sameTransferPeer) notice = 'A transferência precisa de dois bancos diferentes.'
    else if (row.invalidAmount) notice = 'Não foi possível ler a data ou o valor.'
    else if (inBank) notice = 'Este identificador já existe neste banco.'
    else if (repeatedInFile) notice = 'Identificador repetido neste arquivo.'

    const catKey = categoryMapKey(row.category, row.subcategory)
    const mappedCat = mapping.categories[catKey]
    const parts: PartInput[] =
      file.defaultType !== 'transfer' && mappedCat && mappedCat.classId !== null && row.amountCents > 0
        ? [{ classId: mappedCat.classId, subclassId: mappedCat.subclassId, amountCents: row.amountCents }]
        : []
    const lines = parts.length > 0 ? splitLinesFromParts(parts) : []

    const statementBalanceLabel =
      file.defaultType === 'transfer'
        ? `Transferência no CSV: ${row.account} → ${row.destinationAccount ?? ''}`
        : `${row.card ? `Cartão: ${row.card}` : `Conta: ${row.account}`} · Categoria no CSV: ${
            row.subcategory ? `${row.category} / ${row.subcategory}` : row.category
          }`

    return {
      key: `${index}-${row.externalId}`,
      bankId: targetBankId ?? undefined,
      occurredOn: row.occurredOn,
      title: row.title,
      description: '',
      balanceDescription: '',
      notes: row.notes,
      type: file.defaultType,
      amountCents: row.amountCents,
      externalId: row.externalId,
      statementBalanceLabel,
      destinationBankId: targetDestBankId,
      incoming: false,
      lines,
      parts,
      ignored: lockedIgnored || duplicate,
      lockedIgnored,
      duplicate,
      done: false,
      inferred: false,
      skipped: false,
      touched: parts.length > 0,
      typeNeedsChoice: false,
      paid: true,
      notice,
    }
  })
}
