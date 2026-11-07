import { useState } from 'react'
import { useDescriptionSuggestions } from '../hooks/useDescriptionSuggestions.ts'
import type { DescriptionSuggestion, TransactionType } from '../db/types.ts'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'

function partLabel(suggestion: DescriptionSuggestion) {
  if (suggestion.parts.length === 0) return 'Sem classe'
  return suggestion.parts
    .map((part) => (part.subclassName ? `${part.className} / ${part.subclassName}` : part.className))
    .join(', ')
}

export default function DescriptionField({
  value,
  type,
  excludeId,
  onChange,
  onPick,
}: {
  value: string
  type: TransactionType | null
  excludeId: number | null
  onChange: (value: string) => void
  onPick: (suggestion: DescriptionSuggestion) => void
}) {
  const [open, setOpen] = useState(false)
  const items = useDescriptionSuggestions(type, value, excludeId, open)

  return (
    <label className="relative block text-sm sm:col-span-2">
      <span className="mb-1 block text-zinc-600">Descrição</span>
      <textarea
        className={fieldClass}
        rows={2}
        value={value}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-sm">
          {items.map((item) => (
            <li key={item.description}>
              <button
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-50"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(item)
                  setOpen(false)
                }}
              >
                <span className="text-sm text-zinc-900">{item.description}</span>
                <span className="text-xs text-zinc-500">{partLabel(item)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
