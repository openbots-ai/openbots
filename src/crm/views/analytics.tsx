import type { ReactNode } from 'react'
import { Hand, MessagesSquare, Users, type LucideIcon } from 'lucide-react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { LIVE_SLOTS as SLOTS, slotOf, type SlotId } from '@convex/lib/models'
import { optionFromId } from '@/lib/agent-options'
import { SLOT_UNITS, addDays, creditsFor, dayKey, weekStart as weekStartOf } from '@convex/lib/usage'
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
const credits = (r: Row) => creditsFor(r.slot, r.count)
const sum = (rows: Row[], f: (r: Row) => number = (r) => r.count) => rows.reduce((s, r) => s + f(r), 0)
const unit = (slot: SlotId, n: number) => (n === 1 ? SLOT_UNITS[slot].one : SLOT_UNITS[slot].many)
// Usage names the model as "provider:model" (older rows used a catalog id); both read as a labelled option
const optionOf = (slot: string, model: string) => slotOf(slot)?.options.find((o) => o.id === model) ?? optionFromId(model)

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

function Tile({ icon: Icon, label, value, note, onClick }: { icon: LucideIcon; label: string; value?: string; note: ReactNode; onClick?: () => void }) {
    return (
        <Card onClick={onClick} className={cn('flex flex-col gap-1 rounded-lg p-4', onClick && 'cursor-pointer transition-colors hover:bg-neutral-50')}>
            <span className="flex items-center gap-1.5 text-[12px] text-neutral-500">
                <Icon className="size-3.5" />
                {label}
            </span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{value ?? '–'}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">{note}</span>
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

const creditConfig = { credits: { label: 'Credits', color: 'var(--primary)' } } satisfies ChartConfig

// A budget gauge when a budget is set; otherwise just what was used
function BudgetTile({ label, used, limit, note }: { label: string; used: number; limit?: number; note: string }) {
    const go = useNav()
    if (limit) return <UsageGauge label={label} used={used} limit={limit} note={note} />
    return (
        <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{compact(Math.round(used))}</span>
            <span className="text-[12px] text-neutral-500">credits · {label.toLowerCase()}</span>
            <button type="button" onClick={() => go('settings')} className="cursor-pointer text-[11px] text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">
                No budget set
            </button>
        </div>
    )
}

export function AnalyticsView() {
    const go = useNav()
    const now = useNow()
    const today = dayKey(now)
    const rows = useQuery(api.usage.summary, { today }) as Row[] | undefined
    const agents = useQuery(api.agents.list)
    const workspace = useQuery(api.workspace.get)
    // Daily totals your agents report; the conversations themselves stay on your engine
    const activity = useQuery(api.usage.activity, { since: addDays(today, -29) })
    const all = rows ?? []

    // Windows like Claude Code's: today, and the week that started on Monday
    const weekStart = weekStartOf(today)
    const month = all.filter((r) => r.day > addDays(today, -30))
    const week = all.filter((r) => r.day >= weekStart)
    const todays = all.filter((r) => r.day === today)
    const heaviest = SLOTS.map((s) => ({ slot: s, used: sum(week.filter((r) => r.slot === s.id), credits) })).sort((a, b) => b.used - a.used)[0]
    const nextMonday = new Date(`${addDays(weekStart, 7)}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const fourteen = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))

    // Replies come from Brain, or from Backup when it took over
    const replies = month.filter((r) => r.slot === 'brain' || r.slot === 'backup')
    const topId = [...new Set(replies.map((r) => r.model))].map((m) => ({ m, n: sum(replies.filter((r) => r.model === m)) })).sort((a, b) => b.n - a.n)[0]?.m
    const topModel = topId ? optionFromId(topId) : undefined

    return (
        <Content>
            <Toolbar title="Analytics">
                <span className="text-[12px] text-neutral-500">What your team did, and which models did it</span>
            </Toolbar>
            <Scroll>
                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Tile icon={SLOT_ICONS.brain} label="Replies written" value={rows && compact(sum(replies))} note={topModel ? <>mostly <ProviderMark provider={topModel.provider} className="size-3" /> {topModel.label}</> : 'By your agents, last 30 days'} />
                        <Tile icon={MessagesSquare} label="Conversation days" value={activity && compact(activity.conversations)} note={activity ? `${compact(activity.messagesIn)} texts in, ${compact(activity.messagesOut)} out` : 'Last 30 days'} />
                        <Tile icon={Hand} label="Handoffs" value={activity && compact(activity.handoffs)} note="Texted to you, last 30 days" />
                        <Tile icon={Users} label="New contacts" value={activity && compact(activity.newContacts)} note="First texts, last 30 days" />
                    </div>

                    <Section title="Usage budget" aside="Set your budget in Settings">
                        <div className="grid gap-6 sm:grid-cols-3">
                            <BudgetTile label="Today" used={sum(todays, credits)} limit={workspace?.dailyBudget} note="Resets at midnight UTC" />
                            <BudgetTile label="This week" used={sum(week, credits)} limit={workspace?.weeklyBudget} note={`Resets ${nextMonday}`} />
                            {heaviest && heaviest.used > 0 ? (
                                <BudgetTile label={`This week · ${heaviest.slot.label}`} used={heaviest.used} limit={workspace?.weeklyBudget} note="Your heaviest part this week" />
                            ) : (
                                <div className="flex items-center justify-center py-6 text-center text-[12px] text-neutral-400">No usage this week yet</div>
                            )}
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
                        <Section title="This week by agent" aside="Credits used">
                            {(() => {
                                const data = (agents ?? [])
                                    .map((a) => ({ id: a._id, name: a.name, credits: Math.round(sum(week.filter((r) => r.agentId === a._id), credits)) }))
                                    .sort((a, b) => b.credits - a.credits)
                                return (
                                    <ChartContainer config={creditConfig} className="aspect-auto w-full" style={{ height: Math.max(120, data.length * 34) }}>
                                        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36 }} onClick={(e) => e?.activeIndex != null && go('agents', data[Number(e.activeIndex)].id)}>
                                            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={64} />
                                            <XAxis type="number" dataKey="credits" hide domain={[0, 'dataMax']} />
                                            <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator formatter={(v) => `${v} credits this week`} />} />
                                            <Bar dataKey="credits" fill="var(--color-credits)" radius={4} className="cursor-pointer">
                                                <LabelList dataKey="credits" position="right" className="fill-foreground" fontSize={12} />
                                            </Bar>
                                        </BarChart>
                                    </ChartContainer>
                                )
                            })()}
                        </Section>
                        <Section title="Daily usage" aside="Credits, last 8 weeks">
                            <ChartContainer config={creditConfig} className="aspect-auto h-56 w-full">
                                <AreaChart data={Array.from({ length: 56 }, (_, i) => addDays(today, i - 55)).map((day) => ({ day, credits: Math.round(sum(all.filter((r) => r.day === day), credits)) }))} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={dayLabel} />
                                    <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => dayLabel(payload[0]?.payload.day ?? '')} formatter={(v) => `${v} credits`} />} />
                                    <Area dataKey="credits" type="monotone" fill="var(--color-credits)" fillOpacity={0.2} stroke="var(--color-credits)" strokeWidth={2} />
                                </AreaChart>
                            </ChartContainer>
                        </Section>
                    </div>
                </div>
            </Scroll>
        </Content>
    )
}
