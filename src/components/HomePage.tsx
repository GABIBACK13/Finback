import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Columns, DeltaBars, DeltaColumns, Donut, Lines, PairBars, RankBars, StackedColumns } from './charts.tsx'
import { useBanks } from '../hooks/useBanks.ts'
import { useDashboard } from '../hooks/useDashboard.ts'
import type { ClassAmount, DashboardSnapshot, FlowMonth } from '../db/types.ts'
import { formatDate, formatDay, formatMonth, periodBounds, todayISO, type PeriodPreset } from '../lib/dates.ts'
import { formatCents } from '../lib/money.ts'
import { chartColors, colorMap } from '../lib/palette.ts'

const fieldClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500'

const presets: { id: PeriodPreset; label: string }[] = [
  { id: 'month', label: 'Este mês' },
  { id: 'previous', label: 'Mês anterior' },
  { id: '3', label: '3 meses' },
  { id: '6', label: '6 meses' },
  { id: '12', label: '12 meses' },
  { id: 'year', label: 'Este ano' },
  { id: 'all', label: 'Tudo' },
]

const tabs = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'fluxo', label: 'Fluxo' },
  { id: 'classes', label: 'Classes' },
  { id: 'contas', label: 'Contas' },
] as const

type TabId = (typeof tabs)[number]['id']

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
const weekdayName = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function periodCaption(from: string | null, to: string | null): string {
  if (!from || !to) return 'Todo o histórico'
  return `${formatDate(from)} – ${formatDate(to)}`
}

function countLabel(count: number): string {
  return count === 1 ? '1 lançamento' : `${count} lançamentos`
}

function share(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%'
  const pct = (part / total) * 100
  if (pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}

function toneOf(cents: number): string {
  if (cents > 0) return 'text-emerald-700'
  if (cents < 0) return 'text-rose-700'
  return 'text-zinc-900'
}

function monthStory(months: FlowMonth[], field: 'debitCents' | 'creditCents', today: string): string | null {
  if (months.length < 2) return null
  const last = months[months.length - 1]
  const previous = months[months.length - 2]
  const subject = field === 'debitCents' ? 'saídas' : 'entradas'
  const prior = formatMonth(previous.month)
  const current = formatMonth(last.month)
  const prefix = last.month === today.slice(0, 7) ? `Até agora, as ${subject} de ${current}` : `As ${subject} de ${current}`
  if (previous[field] <= 0 && last[field] <= 0) return null
  if (previous[field] <= 0) return `${prefix} não têm base no mês anterior.`
  const pct = Math.round(((last[field] - previous[field]) / previous[field]) * 100)
  if (pct === 0) return `${prefix} ficaram no mesmo nível de ${prior}.`
  if (pct > 0) return `${prefix} ficaram ${pct}% acima de ${prior}.`
  return `${prefix} ficaram ${Math.abs(pct)}% abaixo de ${prior}.`
}

function topSlices(items: { name: string; value: number }[], limit: number) {
  const sorted = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value)
  if (sorted.length <= limit) return sorted
  const rest = sorted.slice(limit).reduce((sum, item) => sum + item.value, 0)
  return rest > 0 ? [...sorted.slice(0, limit), { name: 'Outras', value: rest }] : sorted.slice(0, limit)
}

function slicesOf(classes: ClassAmount[], unclassified: number, colors: Map<string, string>) {
  const items = classes.map((item) => ({ name: item.className, value: item.amountCents }))
  if (unclassified > 0) items.push({ name: 'Sem classe', value: unclassified })
  return topSlices(items, 6).map((item) => ({
    name: item.name,
    value: item.value,
    color: colors.get(item.name) ?? chartColors.slices[0],
  }))
}

function Panel({ title, caption, children, wide }: { title: string; caption?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-lg border border-zinc-200 bg-white p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <h2 className="text-sm font-medium">{title}</h2>
      {caption && <p className="mt-1 text-xs leading-5 text-zinc-500">{caption}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function EmptyNote() {
  return <p className="py-8 text-center text-sm text-zinc-500">Sem movimentos neste período.</p>
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  )
}

function Reconciliation({ snapshot, singleBank }: { snapshot: DashboardSnapshot; singleBank: boolean }) {
  const closing = snapshot.balanceSeries.at(-1)?.balanceCents ?? snapshot.openingCents
  const rows = [
    { label: 'Saldo no início', value: formatCents(snapshot.openingCents), tone: 'text-zinc-900' },
    { label: 'Entradas', value: `+ ${formatCents(snapshot.creditCents)}`, tone: 'text-emerald-700' },
    { label: 'Saídas', value: `− ${formatCents(snapshot.debitCents)}`, tone: 'text-rose-700' },
  ]
  if (singleBank) {
    rows.push(
      { label: 'Transferências recebidas', value: `+ ${formatCents(snapshot.transferInCents)}`, tone: 'text-amber-700' },
      { label: 'Transferências enviadas', value: `− ${formatCents(snapshot.transferOutCents)}`, tone: 'text-amber-700' },
    )
  }
  rows.push({ label: 'Saldo no fim', value: formatCents(closing), tone: 'text-zinc-900' })

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-zinc-600">{row.label}</span>
            <span className={`font-medium ${row.tone}`}>{row.value}</span>
          </li>
        ))}
      </ul>
      {!singleBank && snapshot.transferInCents > 0 && (
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {formatCents(snapshot.transferInCents)} foram de uma conta para outra. O total não muda.
        </p>
      )}
      {closing !== snapshot.balanceCents && (
        <p className="mt-3 text-xs leading-5 text-zinc-500">O saldo de hoje é {formatCents(snapshot.balanceCents)}.</p>
      )}
    </div>
  )
}

function Overview({ snapshot, singleBank }: { snapshot: DashboardSnapshot; singleBank: boolean }) {
  const today = todayISO()
  const closing = snapshot.balanceSeries.at(-1)?.balanceCents ?? snapshot.openingCents
  const variation = closing - snapshot.openingCents
  const result = snapshot.creditCents - snapshot.debitCents
  const average = snapshot.months.length > 0 ? Math.round(snapshot.debitCents / snapshot.months.length) : 0
  const colors = colorMap([
    ...snapshot.debitClasses.map((item) => item.className),
    ...snapshot.creditClasses.map((item) => item.className),
    'Sem classe',
    'Outras',
  ])
  const debitSlices = slicesOf(snapshot.debitClasses, snapshot.unclassifiedDebitCents, colors)
  const creditSlices = slicesOf(snapshot.creditClasses, snapshot.unclassifiedCreditCents, colors)
  const labels = snapshot.months.map((month) => month.month)
  const outflowStory = monthStory(snapshot.months, 'debitCents', today)
  const inflowStory = monthStory(snapshot.months, 'creditCents', today)
  const savings =
    snapshot.creditCents > 0 ? `sobrou ${share(Math.max(result, 0), snapshot.creditCents)} do que entrou` : 'sem entradas no período'
  const transferNet = snapshot.transferInCents - snapshot.transferOutCents
  const transferHint = singleBank
    ? snapshot.transferInCents === 0 && snapshot.transferOutCents === 0
      ? 'nada neste período'
      : `recebidas ${formatCents(snapshot.transferInCents)} · enviadas ${formatCents(snapshot.transferOutCents)}`
    : 'não entra no resultado'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Saldo atual" value={formatCents(snapshot.balanceCents)} hint="posição de hoje" tone={toneOf(snapshot.balanceCents)} />
        <Stat
          label="Variação no período"
          value={formatCents(variation)}
          hint={variation === result ? 'igual ao resultado' : 'o saldo mudou com transferência'}
          tone={toneOf(variation)}
        />
        <Stat label="Entradas" value={formatCents(snapshot.creditCents)} hint={countLabel(snapshot.creditCount)} tone="text-emerald-700" />
        <Stat
          label="Saídas"
          value={formatCents(snapshot.debitCents)}
          hint={snapshot.months.length > 0 ? `${countLabel(snapshot.debitCount)} · média ${formatCents(average)}/mês` : countLabel(snapshot.debitCount)}
          tone="text-rose-700"
        />
        <Stat
          label="Resultado"
          value={formatCents(result)}
          hint={result < 0 && snapshot.creditCents > 0 ? `as saídas passaram as entradas em ${share(-result, snapshot.creditCents)}` : savings}
          tone={toneOf(result)}
        />
        <Stat
          label={singleBank ? 'Transferências' : 'Entre contas'}
          value={formatCents(singleBank ? transferNet : snapshot.transferInCents)}
          hint={transferHint}
          tone={singleBank ? toneOf(transferNet) : 'text-amber-700'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="De onde sai o saldo" caption="O fim do período fecha com o saldo de hoje quando o recorte vai até o último lançamento.">
          <Reconciliation snapshot={snapshot} singleBank={singleBank} />
        </Panel>
        <Panel
          title="Entradas e saídas"
          caption={[inflowStory, outflowStory].filter(Boolean).join(' ') || 'Créditos e débitos de cada mês.'}
        >
          {labels.length === 0 ? (
            <EmptyNote />
          ) : (
            <Columns
              ariaLabel="Entradas e saídas por mês"
              labels={labels}
              labelOf={formatMonth}
              format={formatCents}
              series={[
                { name: 'Entradas', color: chartColors.credit, values: snapshot.months.map((month) => month.creditCents) },
                { name: 'Saídas', color: chartColors.debit, values: snapshot.months.map((month) => month.debitCents) },
              ]}
            />
          )}
        </Panel>
        <Panel
          title="Saldo no fim do mês"
          caption={
            singleBank
              ? 'Inclui transferência recebida e enviada.'
              : 'Transferência entre as suas contas entra no saldo de cada banco e fica de fora desta linha, porque o total não muda.'
          }
          wide
        >
          {snapshot.balanceSeries.length < 2 ? (
            <EmptyNote />
          ) : (
            <Lines
              ariaLabel="Saldo no fim de cada mês"
              labels={snapshot.balanceSeries.map((point) => point.label)}
              labelOf={formatMonth}
              format={formatCents}
              series={[{ name: 'Saldo', color: chartColors.balance, values: snapshot.balanceSeries.map((point) => point.balanceCents) }]}
            />
          )}
        </Panel>
        <Panel title="Para onde foi" caption="Saídas pelo valor classificado em cada lançamento.">
          {debitSlices.length === 0 ? <EmptyNote /> : <Donut ariaLabel="Saídas por classe" slices={debitSlices} format={formatCents} />}
        </Panel>
        <Panel title="De onde veio" caption="Entradas pelo valor classificado em cada lançamento.">
          {creditSlices.length === 0 ? <EmptyNote /> : <Donut ariaLabel="Entradas por classe" slices={creditSlices} format={formatCents} />}
        </Panel>
      </div>
    </div>
  )
}

function FlowTab({ snapshot }: { snapshot: DashboardSnapshot }) {
  const labels = snapshot.months.map((month) => month.month)
  const result = snapshot.months.map((month) => month.creditCents - month.debitCents)
  let creditRun = 0
  let debitRun = 0
  const creditLine: number[] = []
  const debitLine: number[] = []
  const pace: number[] = []
  for (const month of snapshot.months) {
    creditRun += month.creditCents
    debitRun += month.debitCents
    creditLine.push(creditRun)
    debitLine.push(debitRun)
  }
  const paceTotal = debitRun
  snapshot.months.forEach((_, index) => {
    pace.push(snapshot.months.length > 0 ? Math.round((paceTotal * (index + 1)) / snapshot.months.length) : 0)
  })
  const weekdayLabels = weekdayOrder.map((day) => weekdayName[day] ?? '')
  const weekdayCredit = weekdayOrder.map((day) => snapshot.weekdays.find((item) => item.weekday === day)?.creditCents ?? 0)
  const weekdayDebit = weekdayOrder.map((day) => snapshot.weekdays.find((item) => item.weekday === day)?.debitCents ?? 0)
  const weekdayActive = weekdayCredit.some((value) => value > 0) || weekdayDebit.some((value) => value > 0)
  const dailyActive = snapshot.days.some((day) => day.creditCents > 0 || day.debitCents > 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Resultado por mês" caption="Entradas menos saídas. Abaixo de zero, o mês gastou mais do que entrou." wide>
        {labels.length === 0 ? (
          <EmptyNote />
        ) : (
          <DeltaColumns
            ariaLabel="Resultado por mês"
            labels={labels}
            labelOf={formatMonth}
            values={result}
            format={formatCents}
            positiveColor={chartColors.credit}
            negativeColor={chartColors.debit}
          />
        )}
      </Panel>
      <Panel title="Acumulado" caption="Quando a linha das saídas passa a das entradas, o período fica no negativo.">
        {paceTotal === 0 && creditRun === 0 ? (
          <EmptyNote />
        ) : (
          <Lines
            ariaLabel="Entradas e saídas acumuladas"
            labels={labels}
            labelOf={formatMonth}
            format={formatCents}
            series={[
              { name: 'Entradas', color: chartColors.credit, values: creditLine },
              { name: 'Saídas', color: chartColors.debit, values: debitLine },
            ]}
          />
        )}
      </Panel>
      <Panel title="Ritmo das saídas" caption="A linha reta espalha o gasto do período por igual. Acima dela, o dinheiro saiu mais cedo.">
        {paceTotal === 0 ? (
          <EmptyNote />
        ) : (
          <Lines
            ariaLabel="Ritmo das saídas"
            labels={labels}
            labelOf={formatMonth}
            format={formatCents}
            series={[
              { name: 'Saídas acumuladas', color: chartColors.debit, values: debitLine },
              { name: 'Ritmo constante', color: chartColors.pace, values: pace },
            ]}
          />
        )}
      </Panel>
      <Panel title="Dias da semana" caption="Soma do período, de segunda a domingo." wide>
        {weekdayActive ? (
          <Columns
            ariaLabel="Entradas e saídas por dia da semana"
            labels={weekdayLabels}
            format={formatCents}
            series={[
              { name: 'Entradas', color: chartColors.credit, values: weekdayCredit },
              { name: 'Saídas', color: chartColors.debit, values: weekdayDebit },
            ]}
          />
        ) : (
          <EmptyNote />
        )}
      </Panel>
      {snapshot.days.length > 0 && (
        <Panel title="Dia a dia" caption="Entra quando o recorte tem até cem dias." wide>
          {dailyActive ? (
            <Lines
              ariaLabel="Entradas e saídas por dia"
              labels={snapshot.days.map((day) => day.day)}
              labelOf={formatDay}
              format={formatCents}
              series={[
                { name: 'Entradas', color: chartColors.credit, values: snapshot.days.map((day) => day.creditCents) },
                { name: 'Saídas', color: chartColors.debit, values: snapshot.days.map((day) => day.debitCents) },
              ]}
            />
          ) : (
            <EmptyNote />
          )}
        </Panel>
      )}
      <Panel title="Maiores saídas" caption={snapshot.largestDebit ? `A maior foi ${snapshot.largestDebit.title}, ${formatCents(snapshot.largestDebit.amountCents)} em ${formatDate(snapshot.largestDebit.occurredOn)}.` : undefined}>
        {snapshot.debitTitles.length === 0 ? (
          <EmptyNote />
        ) : (
          <RankBars
            format={formatCents}
            items={snapshot.debitTitles.map((item) => ({
              label: item.title,
              value: item.amountCents,
              hint: countLabel(item.count),
              color: chartColors.debit,
            }))}
          />
        )}
      </Panel>
      <Panel title="Maiores entradas" caption={snapshot.largestCredit ? `A maior foi ${snapshot.largestCredit.title}, ${formatCents(snapshot.largestCredit.amountCents)} em ${formatDate(snapshot.largestCredit.occurredOn)}.` : undefined}>
        {snapshot.creditTitles.length === 0 ? (
          <EmptyNote />
        ) : (
          <RankBars
            format={formatCents}
            items={snapshot.creditTitles.map((item) => ({
              label: item.title,
              value: item.amountCents,
              hint: countLabel(item.count),
              color: chartColors.credit,
            }))}
          />
        )}
      </Panel>
    </div>
  )
}

function classRows(classes: ClassAmount[], unclassifiedCents: number, unclassifiedCount: number, total: number, colors: Map<string, string>) {
  const rows = classes.map((item) => ({
    label: item.className,
    value: item.amountCents,
    hint: `${countLabel(item.count)} · ${share(item.amountCents, total)}`,
    color: colors.get(item.className) ?? chartColors.slices[0],
  }))
  if (unclassifiedCents > 0) {
    rows.push({
      label: 'Sem classe',
      value: unclassifiedCents,
      hint: `${countLabel(unclassifiedCount)} · ${share(unclassifiedCents, total)}`,
      color: chartColors.unclassified,
    })
  }
  return rows.sort((a, b) => b.value - a.value)
}

function ClassesTab({ snapshot }: { snapshot: DashboardSnapshot }) {
  const colors = colorMap([
    ...snapshot.debitClasses.map((item) => item.className),
    ...snapshot.creditClasses.map((item) => item.className),
    ...snapshot.debitStack.series.map((item) => item.name),
    'Sem classe',
    'Outras',
  ])
  const debitTotal = snapshot.debitCents
  const creditTotal = snapshot.creditCents
  const debitRows = classRows(snapshot.debitClasses, snapshot.unclassifiedDebitCents, snapshot.unclassifiedDebitCount, debitTotal, colors)
  const creditRows = classRows(snapshot.creditClasses, snapshot.unclassifiedCreditCents, snapshot.unclassifiedCreditCount, creditTotal, colors)
  const lead = debitRows[0]
  const stackSeries = snapshot.debitStack.series.map((item) => ({
    name: item.name,
    color: colors.get(item.name) ?? chartColors.other,
    values: item.values,
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Saídas por classe"
        caption={lead ? `${lead.label} concentra ${share(lead.value, debitTotal)} das saídas.` : 'Nenhuma saída neste período.'}
      >
        {debitRows.length === 0 ? <EmptyNote /> : <RankBars format={formatCents} items={debitRows} />}
      </Panel>
      <Panel title="Entradas por classe">
        {creditRows.length === 0 ? <EmptyNote /> : <RankBars format={formatCents} items={creditRows} />}
      </Panel>
      <Panel title="Subclasses das saídas">
        {snapshot.debitSubclasses.length === 0 ? (
          <EmptyNote />
        ) : (
          <RankBars
            format={formatCents}
            items={snapshot.debitSubclasses.map((item) => ({
              label: `${item.className} · ${item.subclassName}`,
              value: item.amountCents,
              color: colors.get(item.className) ?? chartColors.debit,
            }))}
          />
        )}
      </Panel>
      <Panel title="Subclasses das entradas">
        {snapshot.creditSubclasses.length === 0 ? (
          <EmptyNote />
        ) : (
          <RankBars
            format={formatCents}
            items={snapshot.creditSubclasses.map((item) => ({
              label: `${item.className} · ${item.subclassName}`,
              value: item.amountCents,
              color: colors.get(item.className) ?? chartColors.credit,
            }))}
          />
        )}
      </Panel>
      <Panel title="Saídas mês a mês" caption="As cinco maiores classes ficam separadas. O resto entra em Outras." wide>
        {stackSeries.length === 0 ? (
          <EmptyNote />
        ) : (
          <StackedColumns
            ariaLabel="Saídas por classe e mês"
            labels={snapshot.debitStack.months}
            labelOf={formatMonth}
            format={formatCents}
            series={stackSeries}
          />
        )}
      </Panel>
    </div>
  )
}

function AccountsTab({ snapshot, bankId }: { snapshot: DashboardSnapshot; bankId: number | null }) {
  const selected = bankId === null ? null : (snapshot.banks.find((bank) => bank.bankId === bankId) ?? null)
  const byBalance = [...snapshot.banks].sort((a, b) => b.balanceCents - a.balanceCents || a.bankName.localeCompare(b.bankName, 'pt-BR'))
  const byFlow = [...snapshot.banks].sort(
    (a, b) => b.debitCents + b.transferOutCents - (a.debitCents + a.transferOutCents) || a.bankName.localeCompare(b.bankName, 'pt-BR'),
  )
  const incoming = snapshot.transferPeers.filter((peer) => peer.direction === 'in')
  const outgoing = snapshot.transferPeers.filter((peer) => peer.direction === 'out')
  const labels = snapshot.months.map((month) => month.month)
  const transferActive = snapshot.months.some((month) => month.transferInCents > 0 || month.transferOutCents > 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {selected && (
        <Panel title={selected.bankName} caption="Saldo de hoje e o que passou por esta conta no período.">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3"><span className="text-zinc-600">Saldo atual</span><span className={toneOf(selected.balanceCents)}>{formatCents(selected.balanceCents)}</span></li>
            <li className="flex justify-between gap-3"><span className="text-zinc-600">Entradas</span><span className="text-emerald-700">{formatCents(selected.creditCents)}</span></li>
            <li className="flex justify-between gap-3"><span className="text-zinc-600">Saídas</span><span className="text-rose-700">{formatCents(selected.debitCents)}</span></li>
            <li className="flex justify-between gap-3"><span className="text-zinc-600">Transferências recebidas</span><span className="text-amber-700">{formatCents(selected.transferInCents)}</span></li>
            <li className="flex justify-between gap-3"><span className="text-zinc-600">Transferências enviadas</span><span className="text-amber-700">{formatCents(selected.transferOutCents)}</span></li>
          </ul>
        </Panel>
      )}
      {bankId === null && (
        <>
          <Panel title="Saldo atual" caption="Posição de hoje. O período não altera este gráfico.">
            {byBalance.length === 0 ? (
              <EmptyNote />
            ) : (
              <DeltaBars format={formatCents} rows={byBalance.map((bank) => ({ label: bank.bankName, value: bank.balanceCents }))} />
            )}
          </Panel>
          <Panel title="Variação no período" caption="O que entrou na conta menos o que saiu, com transferência.">
            {byFlow.length === 0 ? (
              <EmptyNote />
            ) : (
              <DeltaBars
                format={formatCents}
                rows={byFlow.map((bank) => ({
                  label: bank.bankName,
                  value: bank.creditCents + bank.transferInCents - bank.debitCents - bank.transferOutCents,
                }))}
              />
            )}
          </Panel>
          <Panel title="Movimento de cada conta" caption="Entrou: crédito e transferência recebida. Saiu: débito e transferência enviada." wide>
            {byFlow.length === 0 ? (
              <EmptyNote />
            ) : (
              <PairBars
                format={formatCents}
                leftName="Entrou"
                rightName="Saiu"
                leftColor={chartColors.credit}
                rightColor={chartColors.debit}
                rows={byFlow.map((bank) => ({
                  label: bank.bankName,
                  left: bank.creditCents + bank.transferInCents,
                  right: bank.debitCents + bank.transferOutCents,
                }))}
              />
            )}
          </Panel>
        </>
      )}
      {bankId !== null && (
        <Panel title="Transferências por mês" caption="O que esta conta recebeu e o que ela enviou." wide>
          {!transferActive ? (
            <EmptyNote />
          ) : (
            <Columns
              ariaLabel="Transferências por mês"
              labels={labels}
              labelOf={formatMonth}
              format={formatCents}
              series={[
                { name: 'Recebidas', color: chartColors.credit, values: snapshot.months.map((month) => month.transferInCents) },
                { name: 'Enviadas', color: chartColors.transfer, values: snapshot.months.map((month) => month.transferOutCents) },
              ]}
            />
          )}
        </Panel>
      )}
      {bankId !== null && (
        <Panel title="De quais contas veio">
          {incoming.length === 0 ? (
            <EmptyNote />
          ) : (
            <RankBars
              format={formatCents}
              items={incoming.map((peer) => ({ label: peer.bankName, value: peer.amountCents, color: chartColors.credit }))}
            />
          )}
        </Panel>
      )}
      {bankId !== null && (
        <Panel title="Para quais contas foi">
          {outgoing.length === 0 ? (
            <EmptyNote />
          ) : (
            <RankBars
              format={formatCents}
              items={outgoing.map((peer) => ({ label: peer.bankName, value: peer.amountCents, color: chartColors.transfer }))}
            />
          )}
        </Panel>
      )}
      {(bankId !== null || snapshot.transferClasses.length > 0) && (
        <Panel title="Classes das transferências" wide>
          {snapshot.transferClasses.length === 0 ? (
            <EmptyNote />
          ) : (
            <RankBars
              format={formatCents}
              items={snapshot.transferClasses.map((item) => ({
                label: item.className,
                value: item.amountCents,
                hint: countLabel(item.count),
                color: chartColors.transfer,
              }))}
            />
          )}
        </Panel>
      )}
    </div>
  )
}

export default function HomePage() {
  const { banks, loaded: banksLoaded } = useBanks()
  const [bankId, setBankId] = useState<number | null>(null)
  const [preset, setPreset] = useState<PeriodPreset>('12')
  const [tab, setTab] = useState<TabId>('geral')
  const bounds = periodBounds(preset)
  const activeBankId = bankId !== null && banksLoaded && !banks.some((bank) => bank.id === bankId) ? null : bankId
  const { snapshot, error, loaded, pending } = useDashboard(activeBankId, bounds.from, bounds.to)
  const bankName = banks.find((bank) => bank.id === activeBankId)?.name ?? null

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Início</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {bankName ?? 'Todos os bancos'} · {periodCaption(bounds.from, bounds.to)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {activeBankId === null
            ? 'Transferência entre as contas não entra em entradas nem saídas.'
            : 'Nesta conta, transferência recebida e enviada entra no saldo.'}
        </p>
      </div>

      <div className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-zinc-100/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="text-sm lg:w-64">
            <span className="mb-1 block text-zinc-600">Banco</span>
            <select
              className={fieldClass}
              value={activeBankId ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setBankId(value ? Number(value) : null)
              }}
            >
              <option value="">Todos os bancos</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm text-zinc-600">Período</p>
            <div className="flex flex-wrap gap-1">
              {presets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={preset === item.id}
                  className={
                    preset === item.id
                      ? 'rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white'
                      : 'rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200'
                  }
                  onClick={() => setPreset(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {pending && <p className="text-xs text-zinc-500 lg:pb-2">Atualizando…</p>}
        </div>
      </div>

      {banksLoaded && banks.length === 0 && (
        <p className="text-sm text-zinc-600">
          Nenhum banco ainda. <Link className="underline" to="/bancos">Cadastrar um banco</Link>
        </p>
      )}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {!loaded && <p className="text-sm text-zinc-600">Montando o resumo…</p>}

      {snapshot && (
        <>
          <div role="tablist" className="flex flex-wrap gap-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={
                  tab === item.id
                    ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm'
                    : 'rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200'
                }
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {snapshot.demonstrativeCents > 0 && (
            <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
              Há {formatCents(snapshot.demonstrativeCents)} em demonstrativo neste período. Esse valor não entra no saldo.
            </p>
          )}
          {!pending && snapshot.creditCents === 0 && snapshot.debitCents === 0 && snapshot.transferInCents === 0 && banks.length > 0 && (
            <p className="text-sm text-zinc-600">
              Nenhum lançamento neste período. <Link className="underline" to="/transacoes">Criar um lançamento</Link>
            </p>
          )}
          {tab === 'geral' && <Overview snapshot={snapshot} singleBank={activeBankId !== null} />}
          {tab === 'fluxo' && <FlowTab snapshot={snapshot} />}
          {tab === 'classes' && <ClassesTab snapshot={snapshot} />}
          {tab === 'contas' && <AccountsTab snapshot={snapshot} bankId={activeBankId} />}
        </>
      )}
    </section>
  )
}
