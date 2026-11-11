import type { BankKind } from '../db/types.ts'

export function bankDisplayName(bank: {
  name: string
  kind?: BankKind
  parentBankName?: string | null
}): string {
  return bank.kind === 'card' && bank.parentBankName ? `${bank.name} · ${bank.parentBankName}` : bank.name
}
