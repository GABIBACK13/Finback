export const chartColors = {
  credit: '#047857',
  debit: '#be123c',
  transfer: '#b45309',
  balance: '#18181b',
  pace: '#a1a1aa',
  other: '#d4d4d8',
  unclassified: '#a1a1aa',
  slices: ['#0f766e', '#1d4ed8', '#b45309', '#6d28d9', '#c2410c', '#0e7490', '#be123c', '#4338ca', '#3f6212', '#9f1239'],
}

export function colorMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>()
  let index = 0
  for (const name of names) {
    if (map.has(name)) continue
    if (name === 'Outras') {
      map.set(name, chartColors.other)
      continue
    }
    if (name === 'Sem classe') {
      map.set(name, chartColors.unclassified)
      continue
    }
    map.set(name, chartColors.slices[index % chartColors.slices.length])
    index += 1
  }
  return map
}
