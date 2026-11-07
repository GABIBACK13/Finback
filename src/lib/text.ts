export function foldText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function descriptionScore(query: string, candidate: string): number {
  const left = foldText(query)
  const right = foldText(candidate)
  if (left.length < 2 || !right) return 0
  if (left === right) return 1000
  if (right.startsWith(left)) return 800
  if (right.includes(left)) return 600
  const tokens = left.split(' ').filter((token) => token.length >= 2)
  if (tokens.length === 0) return 0
  const hits = tokens.filter((token) => right.includes(token)).length
  if (hits === 0) return 0
  if (hits === tokens.length) return 400 + hits
  return 100 + hits * 20
}
