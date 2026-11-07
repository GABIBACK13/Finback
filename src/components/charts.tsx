import { useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { formatCentsCompact } from '../lib/money.ts'

type Series = {
  name: string
  color: string
  values: number[]
}

type Tip = {
  x: number
  y: number
  alignRight: boolean
  title: string
  lines: string[]
}

function usePlotTip() {
  const host = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  function show(event: PointerEvent<SVGElement>, title: string, lines: string[]) {
    const rect = host.current?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    setTip({
      x: x > rect.width * 0.62 ? x - 8 : x + 12,
      y: Math.max(8, y - 8),
      alignRight: x > rect.width * 0.62,
      title,
      lines,
    })
  }

  function hide() {
    setTip(null)
  }

  return { host, tip, show, hide }
}

function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-56 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
      style={{ left: tip.x, top: tip.y, transform: tip.alignRight ? 'translate(-100%, 0)' : undefined }}
    >
      <p className="font-medium text-zinc-900">{tip.title}</p>
      {tip.lines.map((line, index) => (
        <p key={`${index}-${line}`} className="text-zinc-600">
          {line}
        </p>
      ))}
    </div>
  )
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5 text-xs text-zinc-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}
        </li>
      ))}
    </ul>
  )
}

const viewW = 640
const viewH = 250
const padL = 76
const padR = 12
const padT = 16
const padB = 32

function plotBox() {
  return { x: padL, y: padT, w: viewW - padL - padR, h: viewH - padT - padB }
}

function labelStride(count: number): number {
  if (count > 24) return 3
  if (count > 12) return 2
  return 1
}

function Axis({ lo, hi }: { lo: number; hi: number }) {
  const box = plotBox()
  const ticks = [lo, lo + (hi - lo) / 2, hi]
  return (
    <g>
      {ticks.map((tick, index) => {
        const y = box.y + ((hi - tick) / (hi - lo || 1)) * box.h
        return (
          <g key={`${index}-${tick}`}>
            <line x1={box.x} x2={box.x + box.w} y1={y} y2={y} stroke="#e4e4e7" />
            <text x={box.x - 8} y={y + 4} textAnchor="end" fill="#71717a" fontSize="11">
              {formatCentsCompact(Math.round(tick))}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function XLabels({
  labels,
  labelOf,
  mode,
}: {
  labels: string[]
  labelOf: (label: string) => string
  mode: 'band' | 'point'
}) {
  const box = plotBox()
  const stride = labelStride(labels.length)
  return (
    <g>
      {labels.map((label, index) => {
        if (index % stride !== 0 && index !== labels.length - 1) return null
        const x =
          mode === 'band'
            ? box.x + ((index + 0.5) * box.w) / Math.max(labels.length, 1)
            : labels.length <= 1
              ? box.x + box.w / 2
              : box.x + (index * box.w) / (labels.length - 1)
        const anchor = mode === 'point' && index === 0 ? 'start' : mode === 'point' && index === labels.length - 1 ? 'end' : 'middle'
        return (
          <text key={`${label}-${index}`} x={x} y={viewH - 10} textAnchor={anchor} fill="#71717a" fontSize="11">
            {labelOf(label)}
          </text>
        )
      })}
    </g>
  )
}

function Frame({
  children,
  series,
  tip,
  host,
  label,
}: {
  children: ReactNode
  series?: Series[]
  tip: Tip | null
  host: RefObject<HTMLDivElement | null>
  label: string
}) {
  return (
    <div ref={host} className="relative">
      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-auto w-full" role="img" aria-label={label}>
        {children}
      </svg>
      {series && series.length > 0 && <Legend items={series.map((item) => ({ name: item.name, color: item.color }))} />}
      <ChartTip tip={tip} />
    </div>
  )
}

export function Columns({
  labels,
  series,
  format,
  labelOf = (label) => label,
  ariaLabel,
}: {
  labels: string[]
  series: Series[]
  format: (value: number) => string
  labelOf?: (label: string) => string
  ariaLabel: string
}) {
  const { host, tip, show, hide } = usePlotTip()
  const hi = Math.max(1, ...series.flatMap((item) => item.values))
  const box = plotBox()
  const groupW = box.w / Math.max(labels.length, 1)
  const inner = Math.min(groupW * 0.72, 48)
  const barW = inner / Math.max(series.length, 1)

  return (
    <Frame host={host} tip={tip} series={series} label={ariaLabel}>
      <Axis lo={0} hi={hi} />
      {labels.map((label, index) => {
        const center = box.x + index * groupW + groupW / 2
        const origin = center - inner / 2
        return (
          <g
            key={label}
            onPointerEnter={(event) =>
              show(
                event,
                labelOf(label),
                series.map((item) => `${item.name}: ${format(item.values[index] ?? 0)}`),
              )
            }
            onPointerLeave={hide}
          >
            <rect x={box.x + index * groupW} y={box.y} width={groupW} height={box.h} fill="transparent" />
            {series.map((item, seriesIndex) => {
              const value = item.values[index] ?? 0
              const h = (value / hi) * box.h
              return (
                <rect
                  key={item.name}
                  x={origin + seriesIndex * barW}
                  y={box.y + box.h - h}
                  width={Math.max(barW - 2, 1)}
                  height={Math.max(h, value > 0 ? 1 : 0)}
                  rx={2}
                  fill={item.color}
                />
              )
            })}
          </g>
        )
      })}
      <XLabels labels={labels} labelOf={labelOf} mode="band" />
    </Frame>
  )
}

export function DeltaColumns({
  labels,
  values,
  format,
  labelOf = (label) => label,
  positiveColor,
  negativeColor,
  ariaLabel,
}: {
  labels: string[]
  values: number[]
  format: (value: number) => string
  labelOf?: (label: string) => string
  positiveColor: string
  negativeColor: string
  ariaLabel: string
}) {
  const { host, tip, show, hide } = usePlotTip()
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values, lo === 0 ? 1 : 0)
  const span = hi - lo || 1
  const box = plotBox()
  const yOf = (value: number) => box.y + ((hi - value) / span) * box.h
  const zero = yOf(0)
  const groupW = box.w / Math.max(labels.length, 1)
  const barW = Math.min(groupW * 0.62, 36)

  return (
    <Frame host={host} tip={tip} label={ariaLabel}>
      <Axis lo={lo} hi={hi} />
      <line x1={box.x} x2={box.x + box.w} y1={zero} y2={zero} stroke="#a1a1aa" />
      {labels.map((label, index) => {
        const value = values[index] ?? 0
        const y = yOf(value)
        const top = Math.min(zero, y)
        const height = Math.max(Math.abs(y - zero), value === 0 ? 0 : 1)
        const x = box.x + index * groupW + (groupW - barW) / 2
        return (
          <g key={label} onPointerEnter={(event) => show(event, labelOf(label), [format(value)])} onPointerLeave={hide}>
            <rect x={box.x + index * groupW} y={box.y} width={groupW} height={box.h} fill="transparent" />
            <rect x={x} y={top} width={barW} height={height} rx={2} fill={value < 0 ? negativeColor : positiveColor} />
          </g>
        )
      })}
      <XLabels labels={labels} labelOf={labelOf} mode="band" />
    </Frame>
  )
}

export function Lines({
  labels,
  series,
  format,
  labelOf = (label) => label,
  ariaLabel,
}: {
  labels: string[]
  series: Series[]
  format: (value: number) => string
  labelOf?: (label: string) => string
  ariaLabel: string
}) {
  const { host, tip, show, hide } = usePlotTip()
  const flat = series.flatMap((item) => item.values)
  const lo = Math.min(0, ...flat)
  const hi = Math.max(0, ...flat, 1)
  const span = hi - lo || 1
  const box = plotBox()
  const yOf = (value: number) => box.y + ((hi - value) / span) * box.h
  const xOf = (index: number) => (labels.length <= 1 ? box.x + box.w / 2 : box.x + (index * box.w) / (labels.length - 1))
  const hitW = box.w / Math.max(labels.length, 1)

  return (
    <Frame host={host} tip={tip} series={series} label={ariaLabel}>
      <Axis lo={lo} hi={hi} />
      <line x1={box.x} x2={box.x + box.w} y1={yOf(0)} y2={yOf(0)} stroke="#e4e4e7" />
      {series.map((item) => {
        const points = item.values
          .map((value, index) => `${xOf(index)},${yOf(value)}`)
          .join(' ')
        return (
          <g key={item.name}>
            <polyline points={points} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" />
            {labels.length <= 18 &&
              item.values.map((value, index) => (
                <circle key={`${item.name}-${labels[index]}`} cx={xOf(index)} cy={yOf(value)} r="3" fill={item.color} />
              ))}
          </g>
        )
      })}
      {labels.map((label, index) => (
        <rect
          key={`hit-${label}`}
          x={xOf(index) - hitW / 2}
          y={box.y}
          width={hitW}
          height={box.h}
          fill="transparent"
          onPointerEnter={(event) =>
            show(
              event,
              labelOf(label),
              series.map((item) => `${item.name}: ${format(item.values[index] ?? 0)}`),
            )
          }
          onPointerLeave={hide}
        />
      ))}
      <XLabels labels={labels} labelOf={labelOf} mode="point" />
    </Frame>
  )
}

export function StackedColumns({
  labels,
  series,
  format,
  labelOf = (label) => label,
  ariaLabel,
}: {
  labels: string[]
  series: Series[]
  format: (value: number) => string
  labelOf?: (label: string) => string
  ariaLabel: string
}) {
  const { host, tip, show, hide } = usePlotTip()
  const totals = labels.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0))
  const hi = Math.max(1, ...totals)
  const box = plotBox()
  const groupW = box.w / Math.max(labels.length, 1)
  const barW = Math.min(groupW * 0.62, 36)

  return (
    <Frame host={host} tip={tip} series={series} label={ariaLabel}>
      <Axis lo={0} hi={hi} />
      {labels.map((label, index) => {
        let cursor = 0
        const x = box.x + index * groupW + (groupW - barW) / 2
        const lines = series
          .map((item) => ({ name: item.name, value: item.values[index] ?? 0 }))
          .filter((item) => item.value > 0)
          .map((item) => `${item.name}: ${format(item.value)}`)
        return (
          <g key={label} onPointerEnter={(event) => show(event, labelOf(label), lines.length > 0 ? lines : [format(0)])} onPointerLeave={hide}>
            {series.map((item) => {
              const value = item.values[index] ?? 0
              const h = (value / hi) * box.h
              cursor += h
              const y = box.y + box.h - cursor
              if (value <= 0) return null
              return <rect key={item.name} x={x} y={y} width={barW} height={Math.max(h, 1)} fill={item.color} />
            })}
          </g>
        )
      })}
      <XLabels labels={labels} labelOf={labelOf} mode="band" />
    </Frame>
  )
}

export function Donut({
  slices,
  format,
  ariaLabel,
}: {
  slices: { name: string; value: number; color: string }[]
  format: (value: number) => string
  ariaLabel: string
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 72
  const stroke = 28
  const c = 2 * Math.PI * radius
  const arcs = slices.reduce<{ name: string; value: number; color: string; length: number; offset: number }[]>((list, slice) => {
    const length = total > 0 ? (slice.value / total) * c : 0
    const previous = list[list.length - 1]
    const start = previous ? previous.offset + previous.length : 0
    list.push({ name: slice.name, value: slice.value, color: slice.color, length, offset: start })
    return list
  }, [])
  const center = formatCentsCompact(total)

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44 shrink-0" role="img" aria-label={ariaLabel}>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="#f4f4f5" strokeWidth={stroke} />
        {slices.length === 1 && total > 0 ? (
          <circle cx="100" cy="100" r={radius} fill="none" stroke={slices[0].color} strokeWidth={stroke}>
            <title>{`${slices[0].name}: ${format(slices[0].value)}`}</title>
          </circle>
        ) : (
          arcs.map((slice) => (
            <circle
              key={slice.name}
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${slice.length} ${c - slice.length}`}
              strokeDashoffset={-slice.offset}
              transform="rotate(-90 100 100)"
            >
              <title>{`${slice.name}: ${format(slice.value)}`}</title>
            </circle>
          ))
        )}
        <text x="100" y="96" textAnchor="middle" fill="#18181b" fontSize="13" fontWeight="600">
          {center}
        </text>
        <text x="100" y="114" textAnchor="middle" fill="#71717a" fontSize="11">
          total
        </text>
      </svg>
      <ul className="w-full space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.name} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="truncate text-zinc-700">{slice.name}</span>
            </span>
            <span className="shrink-0 text-zinc-900">{format(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RankBars({
  items,
  format,
}: {
  items: { label: string; value: number; hint?: string; color: string }[]
  format: (value: number) => string
}) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-zinc-800" title={item.label}>
              {item.label}
              {item.hint && <span className="ml-2 text-xs text-zinc-500">{item.hint}</span>}
            </p>
            <p className="shrink-0 text-sm text-zinc-900">{format(item.value)}</p>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div className="h-2 rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PairBars({
  rows,
  leftName,
  rightName,
  leftColor,
  rightColor,
  format,
}: {
  rows: { label: string; left: number; right: number }[]
  leftName: string
  rightName: string
  leftColor: string
  rightColor: string
  format: (value: number) => string
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.left, row.right]))
  return (
    <div>
      <Legend items={[{ name: leftName, color: leftColor }, { name: rightName, color: rightColor }]} />
      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li key={row.label}>
            <p className="mb-1 truncate text-sm text-zinc-800" title={row.label}>
              {row.label}
            </p>
            <Meter label={leftName} value={row.left} max={max} color={leftColor} format={format} />
            <div className="mt-1">
              <Meter label={rightName} value={row.right} max={max} color={rightColor} format={format} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Meter({
  label,
  value,
  max,
  color,
  format,
}: {
  label: string
  value: number
  max: number
  color: string
  format: (value: number) => string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-zinc-100">
        <div className="h-2 rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
      </div>
      <p className="w-28 shrink-0 text-right text-xs text-zinc-600">
        <span className="sr-only">{label}: </span>
        {format(value)}
      </p>
    </div>
  )
}

export function DeltaBars({
  rows,
  format,
}: {
  rows: { label: string; value: number }[]
  format: (value: number) => string
}) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const width = `${(Math.abs(row.value) / max) * 100}%`
        const positive = row.value >= 0
        return (
          <li key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-zinc-800" title={row.label}>
                {row.label}
              </p>
              <p className={positive ? 'shrink-0 text-sm text-emerald-700' : 'shrink-0 text-sm text-rose-700'}>{format(row.value)}</p>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div className="flex justify-end">
                {!positive && <div className="h-2 rounded-full bg-rose-700" style={{ width }} />}
              </div>
              <div>{positive && <div className="h-2 rounded-full bg-emerald-700" style={{ width }} />}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
