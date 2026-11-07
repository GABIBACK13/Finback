const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const amountInput = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCents(cents: number): string {
  return brl.format(cents / 100)
}

export function formatCentsCompact(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  if (abs >= 100_000_000) {
    return `${sign}R$ ${(abs / 100_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  }
  if (abs >= 100_000) {
    const digits = abs >= 1_000_000 ? 0 : 1
    return `${sign}R$ ${(abs / 100_000).toLocaleString('pt-BR', { maximumFractionDigits: digits })} mil`
  }
  return formatCents(cents)
}

export function centsToInput(cents: number): string {
  return amountInput.format(cents / 100)
}

// Vírgula é o decimal. Ponto sozinho com 1 ou 2 casas também, para aceitar 10.50.
export function parseReais(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let normalized: string
  if (trimmed.includes(',')) {
    normalized = trimmed.replaceAll('.', '').replace(',', '.')
  } else if (/^\d+\.\d{1,2}$/.test(trimmed)) {
    normalized = trimmed
  } else {
    normalized = trimmed.replaceAll('.', '')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null

  const reais = Number(normalized)
  if (!Number.isFinite(reais) || reais <= 0) return null

  const cents = Math.round(reais * 100)
  if (!Number.isInteger(cents) || cents <= 0) return null
  return cents
}

export function parseSignedReais(input: string): number | null {
  const compact = input.trim().replaceAll(' ', '')
  if (!compact) return null
  const sign = compact.startsWith('-') ? -1 : 1
  const unsigned = compact.replace(/^[+-]/, '').replace(/^R\$/i, '')
  const cents = parseReais(unsigned)
  if (cents === null) return null
  return sign * cents
}
