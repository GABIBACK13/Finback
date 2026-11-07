import type { ClassScope, TransactionType } from '../db/types.ts'

export function scopeForType(type: TransactionType): ClassScope {
  if (type === 'demonstrative') return null
  return type
}

export function scopeLabel(scope: ClassScope): string {
  if (scope === 'debit') return 'Débito'
  if (scope === 'credit') return 'Crédito'
  if (scope === 'transfer') return 'Transferência'
  return 'Todos'
}

export function classFitsType(
  scope: ClassScope,
  type: TransactionType,
  classId: number,
  selectedClassId: number | null,
): boolean {
  if (selectedClassId === classId) return true
  if (type === 'demonstrative' || scope === null) return true
  return scope === type
}
