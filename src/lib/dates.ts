export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  return `${match[3]}/${match[2]}/${match[1]}`
}

const stampFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function formatStamp(isoStamp: string): string {
  const date = new Date(isoStamp)
  if (Number.isNaN(date.getTime())) return isoStamp
  return stampFormat.format(date)
}

// Data civil local. toISOString mudaria o dia à noite no Brasil.
export function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const monthShort = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

export type PeriodPreset = 'month' | 'previous' | '3' | '6' | '12' | 'year' | 'all'

export function formatMonth(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(isoMonth)
  if (!match) return isoMonth
  const name = monthShort[Number(match[2]) - 1]
  if (!name) return isoMonth
  return `${name} ${match[1].slice(2)}`
}

export function formatDay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  return `${match[3]}/${match[2]}`
}

export function periodBounds(preset: PeriodPreset, today = todayISO()): { from: string | null; to: string | null } {
  if (preset === 'all') return { from: null, to: null }
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const current = monthIndex(year, month)
  if (preset === 'month') return { from: monthStart(current), to: today }
  if (preset === 'year') return { from: `${year}-01-01`, to: today }
  if (preset === 'previous') {
    return { from: monthStart(current - 1), to: dayBefore(monthStart(current)) }
  }
  const span = preset === '3' ? 3 : preset === '6' ? 6 : 12
  return { from: monthStart(current - (span - 1)), to: today }
}

export function eachMonth(from: string, to: string): string[] {
  const start = Number(from.slice(0, 4)) * 12 + (Number(from.slice(5, 7)) - 1)
  const end = Number(to.slice(0, 4)) * 12 + (Number(to.slice(5, 7)) - 1)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return []
  const months: string[] = []
  for (let index = start; index <= end; index += 1) months.push(monthKey(index))
  return months
}

export function eachDay(from: string, to: string): string[] {
  if (from > to) return []
  const cursor = utcDate(from)
  const end = utcDate(to).getTime()
  const days: string[] = []
  while (cursor.getTime() <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function daySpan(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000)
}

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

function monthStart(index: number): string {
  return `${monthKey(index)}-01`
}

function monthKey(index: number): string {
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function dayBefore(iso: string): string {
  const date = utcDate(iso)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function utcDate(iso: string): Date {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))
}
