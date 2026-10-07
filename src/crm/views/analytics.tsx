import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { BRAIN_MODELS, SLOTS, slotOf, type SlotId } from '@convex/lib/models'
import { PLAN_CREDITS, SLOT_UNITS, addDays, dayKey } from '@convex/lib/usage'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { UsageGauge } from '@/components/usage-gauge'
import { ProviderMark } from '@/components/agent-config-bar'
import { SLOT_ICONS } from '@/components/slot-icons'
import { dayLabel } from '../lib/time'
import { useNav } from '../nav'
import { Content, Scroll, Toolbar } from '../ui'
import { useNow } from '../use-now'

type Row = { agentId: Id<'agents'>; slot: string; model: string; day: string; count: number }

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const credits = (r: Row) => r.count * (SLOT_UNITS[r.slot as SlotId]?.weight ?? 1)
const sum = (rows: Row[], f: (r: Row) => number = (r) => r.count) => rows.reduce((s, r) => s + f(r), 0)
const unit = (slot: SlotId, n: number) => (n === 1 ? SLOT_UNITS[slot].one : SLOT_UNITS[slot].many)
// Vision can follow the brain onto a model outside its own list, so fall back to every brain model
const optionOf = (slot: string, model: string) => slotOf(slot)?.options.find((o) => o.id === model) ?? BRAIN_MODELS.find((o) => o.id === model)

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <Card className={cn('rounded-lg', className)}>
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200/70 px-4 py-3">
                <h2 className="text-[13px] font-medium">{title}</h2>
                {aside && <span className="text-[11px] text-neutral-500">{aside}</span>}
            </div>
            <div className="p-4">{children}</div>
        </Card>
    )
}

// The last 14 days for one slot, as a small shadcn bar chart
function Spark({ days, slot }: { days: { day: string; count: number }[]; slot: SlotId }) {
    const config = { count: { label: SLOT_UNITS[slot].many, color: 'var(--primary)' } } satisfies ChartConfig
    return (
        <ChartContainer config={config} className="aspect-auto h-9 w-32">
            <BarChart data={days} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Bar dataKey="count" fill="var(--color-count)" radius={2} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_, payload) => dayLabel(payload[0]?.payload.day ?? '')} />} />
            </BarChart>
        </ChartContainer>
    )
}

const pctConfig = { pct: { label: '% of plan', color: 'var(--primary)' } } satisfies ChartConfig

export function AnalyticsView() {
    const go = useNav()
    const now = useNow()
    const today = dayKey(now)
    const rows = useQuery(api.usage.summary, { today }) as Row[] | undefined
    const agents = useQuery(api.agents.list)
    const all = rows ?? []

    // Windows like Claude Code's: today, and the week that started on Monday
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
    const weekStart = addDays(today, -weekday)
    const month = all.filter((r) => r.day > addDays(today, -30))
    const week = all.filter((r) => r.day >= weekStart)
    const todays = all.filter((r) => r.day === today)
    const heaviest = SLOTS.map((s) => ({ slot: s, used: sum(week.filter((r) => r.slot === s.id), credits) })).sort((a, b) => b.used - a.used)[0]
    const nextMonday = new Date(`${addDays(weekStart, 7)}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const fourteen = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))

    const tiles: { slot: SlotId; label: string }[] = [
        { slot: 'brain', label: 'Replies written' },
        { slot: 'computer', label: 'Actions in your apps' },
        { slot: 'decisions', label: 'Decisions made' },
        { slot: 'calls', label: 'Minutes on calls' },
    ]

    return (
        <Content>
            <Toolbar title="Analytics">
                <span className="text-[12px] text-neutral-500">What your team did, and which models did it</span>
            </Toolbar>
            <Scroll>
                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {tiles.map((t) => {
                            const Icon = SLOT_ICONS[t.slot]
                            const mine = month.filter((r) => r.slot === t.slot)
                            const top = [...new Set(mine.map((r) => r.model))].map((m) => ({ m, n: sum(mine.filter((r) => r.model === m)) })).sort((a, b) => b.n - a.n)[0]
                            const option = top && optionOf(t.slot, top.m)
                            return (
                                <Card key={t.slot} className="flex flex-col gap-1 rounded-lg p-4">
                                    <span className="flex items-center gap-1.5 text-[12px] text-neutral-500">
                                        <Icon className="size-3.5" />
                                        {t.label}
                                    </span>
                                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{rows ? compact(sum(mine)) : '–'}</span>
                                    <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                                        {option ? (
                                            <>
                                                mostly <ProviderMark provider={option.provider} className="size-3" /> {option.label}
                                            </>
                                        ) : (
                                            'Last 30 days'
                                        )}
                                    </span>
                                </Card>
                            )
                        })}
                    </div>

                    <Section title="Plan usage" aside="Personal plan">
                        <div className="grid gap-6 sm:grid-cols-3">
                            <UsageGauge label="Today" used={sum(todays, credits)} limit={PLAN_CREDITS.day} note="Resets at midnight UTC" />
                            <UsageGauge label="This week · all models" used={sum(week, credits)} limit={PLAN_CREDITS.week} note={`Resets ${nextMonday}`} />
                            <UsageGauge label={`This week · ${heaviest?.slot.label ?? 'Computer use'}`} used={heaviest?.used ?? 0} limit={PLAN_CREDITS.week} note="Your heaviest part this week" />
                        </div>
                    </Section>

                    <Section title="What each model did" aside="Last 30 days">
                        <div className="divide-y divide-neutral-100">
                            {SLOTS.map((slot) => {
                                const Icon = SLOT_ICONS[slot.id]
                                const mine = month.filter((r) => r.slot === slot.id)
                                const total = sum(mine)
                                const byModel = [...new Set(mine.map((r) => r.model))]
                                    .map((m) => ({ option: optionOf(slot.id, m), n: sum(mine.filter((r) => r.model === m)) }))
                                    .filter((x) => x.option)
                                    .sort((a, b) => b.n - a.n)
                                const spark = fourteen.map((day) => ({ day, count: sum(mine.filter((r) => r.day === day)) }))
                                return (
                                    <div key={slot.id} className="grid items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[180px_minmax(0,1fr)_120px_auto]">
                                        <span className="flex items-center gap-2.5">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                                                <Icon className="size-4" />
                                            </span>
                                            <span>
                                                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                                                    {slot.label}
                                                    {slot.isNew && <Badge variant="secondary" className="h-4 px-1 text-[9px]">New</Badge>}
                                                </span>
                                                <span className="block font-mono text-[11px] text-neutral-500 tabular-nums">
                                                    {compact(total)} {unit(slot.id, total)}
                                                </span>
                                            </span>
                                        </span>
                                        {/* Each model's share of this part's work, labelled so identity never rests on colour */}
                                        <span className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                                            {byModel.length ? (
                                                byModel.map(({ option, n }) => (
                                                    <span key={option!.id} className="flex min-w-0 items-center gap-2 text-[12px]">
                                                        <ProviderMark provider={option!.provider} className="size-3.5" />
                                                        <span className="w-32 shrink-0 truncate text-neutral-800">{option!.label}</span>
                                                        <Progress value={Math.round((n / total) * 100)} aria-label={`${option!.label} share`} className="min-w-8 flex-1" />
                                                        <span className="w-9 text-right font-mono text-[11px] text-neutral-500 tabular-nums">{Math.round((n / total) * 100)}%</span>
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-[12px] text-neutral-400">{rows ? 'Not used in the last 30 days' : '…'}</span>
                                            )}
                                        </span>
                                        <Spark days={spark} slot={slot.id} />
                                        <button type="button" onClick={() => go('models')} className="cursor-pointer justify-self-end text-[11px] text-neutral-500 hover:text-neutral-900">
                                            Change →
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </Section>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                        <Section title="This week by agent" aside="Share of the weekly plan">
                            {(() => {
                                const data = (agents ?? [])
                                    .map((a) => ({ id: a._id, name: a.name, pct: Math.round((sum(week.filter((r) => r.agentId === a._id), credits) / PLAN_CREDITS.week) * 100) }))
                                    .sort((a, b) => b.pct - a.pct)
                                return (
                                    <ChartContainer config={pctConfig} className="aspect-auto w-full" style={{ height: Math.max(120, data.length * 34) }}>
                                        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36 }} onClick={(e) => e?.activeIndex != null && go('agents', data[Number(e.activeIndex)].id)}>
                                            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={64} />
                                            <XAxis type="number" dataKey="pct" hide domain={[0, 'dataMax']} />
                                            <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator formatter={(v) => `${v}% of the weekly plan`} />} />
                                            <Bar dataKey="pct" fill="var(--color-pct)" radius={4} className="cursor-pointer">
                                                <LabelList dataKey="pct" position="right" formatter={(v: unknown) => `${v}%`} className="fill-foreground" fontSize={12} />
                                            </Bar>
                                        </BarChart>
                                    </ChartContainer>
                                )
                            })()}
                        </Section>
                        <Section title="Daily plan usage" aside="Last 8 weeks">
                            <ChartContainer config={pctConfig} className="aspect-auto h-56 w-full">
                                <AreaChart data={Array.from({ length: 56 }, (_, i) => addDays(today, i - 55)).map((day) => ({ day, pct: Math.round((sum(all.filter((r) => r.day === day), credits) / PLAN_CREDITS.day) * 100) }))} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={dayLabel} />
                                    <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}%`} />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => dayLabel(payload[0]?.payload.day ?? '')} formatter={(v) => `${v}% of the daily plan`} />} />
                                    <Area dataKey="pct" type="monotone" fill="var(--color-pct)" fillOpacity={0.2} stroke="var(--color-pct)" strokeWidth={2} />
                                </AreaChart>
                            </ChartContainer>
                        </Section>
                    </div>
                </div>
            </Scroll>
        </Content>
    )
}
