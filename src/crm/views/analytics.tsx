import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProviderMark } from '@/components/agent-config-bar'
import { DEFAULT_CONFIG, PLAN_LIMITS, costOf, modelOf } from '@/lib/agent-options'
import { dayLabel } from '../lib/time'
import { AgentAvatar, Content, Scroll, Toolbar } from '../ui'
import { useNow } from '../use-now'

// 1234 → "1.2k", 3_400_000 → "3.4M"
const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const money = (n: number) => (n > 0 && n < 0.01 ? '<$0.01' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n))
const percent = (n: number) => `${Math.round(n * 100)}%`

// Usage meter in the style of Claude Code's /usage: a row of small segments that fill left to right
function Meter({ label, used, limit, unit, note }: { label: string; used: number; limit: number; unit: string; note: string }) {
    const share = Math.min(1, used / limit)
    const SEGMENTS = 40
    const filled = Math.round(share * SEGMENTS)
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-medium text-neutral-900">{label}</span>
                <span className="font-mono text-[12px] text-neutral-500 tabular-nums">
                    {compact(used)} / {compact(limit)} {unit}
                </span>
            </div>
            <div className="flex gap-[3px]" role="meter" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
                {Array.from({ length: SEGMENTS }, (_, i) => (
                    <span key={i} className={cn('h-3 flex-1 rounded-[2px]', i < filled ? (share >= 0.9 ? 'bg-amber-500' : 'bg-primary') : 'bg-neutral-200/80')} />
                ))}
            </div>
            <div className="flex justify-between font-mono text-[11px] text-neutral-500">
                <span>{note}</span>
                <span className="tabular-nums">{percent(share)} used</span>
            </div>
        </div>
    )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <Card className="flex flex-col gap-1 rounded-lg p-4">
            <p className="text-[12px] text-neutral-500">{label}</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{value ?? '–'}</p>
            {sub && <p className="text-[11px] text-neutral-500">{sub}</p>}
        </Card>
    )
}

// Sequential single-hue steps for the heatmap: empty, then four levels of the brand indigo
const HEAT = ['bg-neutral-100', 'bg-primary/20', 'bg-primary/40', 'bg-primary/65', 'bg-primary']

function Heatmap({ days }: { days: { day: string; count: number }[] }) {
    const max = Math.max(1, ...days.map((d) => d.count))
    const level = (count: number) => (count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4)))
    // Pad the front so each column is one Sunday-to-Saturday week, like a contribution graph
    const offset = days.length ? new Date(`${days[0].day}T00:00:00Z`).getUTCDay() : 0
    const cells: ({ day: string; count: number } | null)[] = [...Array<null>(offset).fill(null), ...days]

    return (
        <div className="flex items-start gap-2">
            <div className="grid grid-rows-7 gap-1 pt-0 text-[10px] leading-3.5 text-neutral-400">
                {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                    <span key={i} className="h-3.5">
                        {d}
                    </span>
                ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label="Messages per day over the last eight weeks">
                {cells.map((c, i) =>
                    c ? (
                        <Tooltip key={c.day}>
                            <TooltipTrigger render={<span className={cn('size-3.5 rounded-[3px]', HEAT[level(c.count)])} />} />
                            <TooltipContent className="text-[11px]">
                                {dayLabel(c.day)}: {c.count} {c.count === 1 ? 'message' : 'messages'}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <span key={`pad-${i}`} className="size-3.5" />
                    ),
                )}
            </div>
        </div>
    )
}

// Consecutive days with activity, counting back from today (or yesterday, if today is still quiet)
function streak(days: { count: number }[]) {
    let i = days.length - 1
    if (i >= 0 && days[i].count === 0) i--
    let n = 0
    while (i >= 0 && days[i].count > 0) {
        n++
        i--
    }
    return n
}

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <Card className={cn('rounded-lg', className)}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-neutral-200/70 px-4 py-3">
                <CardTitle className="text-[13px] font-medium">{title}</CardTitle>
                {aside && <span className="text-[11px] text-neutral-500">{aside}</span>}
            </CardHeader>
            <CardContent className="p-4">{children}</CardContent>
        </Card>
    )
}

export function AnalyticsView() {
    const data = useQuery(api.analytics.overview)
    const now = useNow()

    const agents = (data?.perAgent ?? []).map((a) => ({ ...a, model: a.model ?? DEFAULT_CONFIG.model, cost: costOf(a.model, a.input, a.output) }))
    const totals = agents.reduce((t, a) => ({ input: t.input + a.input, output: t.output + a.output, cost: t.cost + a.cost, replies: t.replies + a.replies30d }), { input: 0, output: 0, cost: 0, replies: 0 })

    // Roll agents up by model, biggest spend first, like Claude Code's per-model cost breakdown
    const byModel = [...new Set(agents.map((a) => a.model))]
        .map((id) => {
            const mine = agents.filter((a) => a.model === id)
            return {
                model: modelOf(id),
                agents: mine.length,
                input: mine.reduce((s, a) => s + a.input, 0),
                output: mine.reduce((s, a) => s + a.output, 0),
                cost: mine.reduce((s, a) => s + a.cost, 0),
            }
        })
        .sort((a, b) => b.cost - a.cost)

    const activity = data?.activity ?? []
    const busiest = activity.reduce<{ day: string; count: number } | null>((best, d) => (d.count > (best?.count ?? 0) ? d : best), null)
    const topAgent = agents.reduce<(typeof agents)[number] | null>((best, a) => (a.replies30d > (best?.replies30d ?? 0) ? a : best), null)
    const maxDay = Math.max(1, ...(data?.perDay.map((d) => d.count) ?? []))
    const maxAgentTokens = Math.max(1, ...agents.map((a) => a.input + a.output))
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
    const resets = `Resets ${nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

    return (
        <Content>
            <Toolbar title="Analytics">
                <span className="text-[12px] text-neutral-500">Last 30 days · tokens and cost are estimates</span>
            </Toolbar>
            <Scroll>
                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat label="Est. spend" value={data && money(totals.cost)} sub="Last 30 days, all agents" />
                        <Stat label="AI tokens" value={data && compact(totals.input + totals.output)} sub={data && `${compact(totals.input)} in · ${compact(totals.output)} out`} />
                        <Stat label="Agent replies" value={data && compact(totals.replies)} sub={data && `${data.conversations} conversations`} />
                        <Stat label="Agents live" value={data && `${data.agentsLive} / ${data.agents}`} sub={data && `${data.contacts} contacts`} />
                    </div>

                    <Section title="Usage" aside="Personal plan">
                        <div className="grid gap-6 md:grid-cols-3">
                            <Meter label="Messages" used={data?.messages30d ?? 0} limit={PLAN_LIMITS.messages} unit="msgs" note={resets} />
                            <Meter label="AI tokens" used={totals.input + totals.output} limit={PLAN_LIMITS.tokens} unit="tokens" note={resets} />
                            <Meter label="Agents" used={data?.agents ?? 0} limit={PLAN_LIMITS.agents} unit="agents" note="Upgrade for more" />
                        </div>
                    </Section>

                    <Section title="Tokens by model" aside="US$ at list price (placeholder rates)">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-left text-[13px]">
                                <thead className="text-[12px] text-neutral-500">
                                    <tr>
                                        <th className="pb-2 font-normal">Model</th>
                                        <th className="pb-2 text-right font-normal">Agents</th>
                                        <th className="pb-2 text-right font-normal">Input</th>
                                        <th className="pb-2 text-right font-normal">Output</th>
                                        <th className="pb-2 text-right font-normal">Est. cost</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-[12px] tabular-nums">
                                    {byModel.map((m) => (
                                        <tr key={m.model.id} className="border-t border-neutral-100">
                                            <td className="py-2 font-sans text-[13px]">
                                                <span className="flex items-center gap-2">
                                                    <ProviderMark provider={m.model.provider} />
                                                    {m.model.label}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right">{m.agents}</td>
                                            <td className="py-2 text-right">{compact(m.input)}</td>
                                            <td className="py-2 text-right">{compact(m.output)}</td>
                                            <td className="py-2 text-right">{money(m.cost)}</td>
                                        </tr>
                                    ))}
                                    {data && (
                                        <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
                                            <td className="pt-2 font-sans text-[13px]">Total</td>
                                            <td className="pt-2 text-right">{agents.length}</td>
                                            <td className="pt-2 text-right">{compact(totals.input)}</td>
                                            <td className="pt-2 text-right">{compact(totals.output)}</td>
                                            <td className="pt-2 text-right">{money(totals.cost)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <Section title="Activity" aside="Last 8 weeks">
                            <div className="flex flex-wrap items-start justify-between gap-6">
                                <div className="space-y-2">
                                    <Heatmap days={activity} />
                                    <div className="flex items-center justify-end gap-1 text-[10px] text-neutral-400">
                                        Less
                                        {HEAT.map((c) => (
                                            <span key={c} className={cn('size-2.5 rounded-[2px]', c)} />
                                        ))}
                                        More
                                    </div>
                                </div>
                                <dl className="grid min-w-44 gap-2.5 font-mono text-[12px]">
                                    {[
                                        ['Busiest day', busiest ? `${dayLabel(busiest.day)} (${busiest.count})` : '–'],
                                        ['Current streak', `${streak(activity)} days`],
                                        ['Most active agent', topAgent?.name ?? '–'],
                                        ['Top model by spend', byModel[0]?.model.label ?? '–'],
                                    ].map(([k, v]) => (
                                        <div key={k} className="flex justify-between gap-4">
                                            <dt className="text-neutral-500">{k}</dt>
                                            <dd className="text-right text-neutral-900">{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        </Section>

                        <Section title="Messages per day" aside="Last 14 days">
                            <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Bar chart of messages per day">
                                {(data?.perDay ?? Array.from({ length: 14 }, (_, i) => ({ day: String(i), count: 0 }))).map((d) => (
                                    <Tooltip key={d.day} disabled={!data}>
                                        <TooltipTrigger render={<div className="group flex h-full flex-1 items-end" />}>
                                            <div className="w-full rounded-t-[4px] bg-primary/85 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(2, (d.count / maxDay) * 100)}%` }} />
                                        </TooltipTrigger>
                                        <TooltipContent className="text-[11px]">
                                            {data && dayLabel(d.day)}: {d.count}
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                            {data && (
                                <div className="mt-2 flex justify-between text-[11px] text-neutral-400">
                                    <span>{dayLabel(data.perDay[0].day)}</span>
                                    <span>{dayLabel(data.perDay[data.perDay.length - 1].day)}</span>
                                </div>
                            )}
                        </Section>
                    </div>

                    <Section title="Usage by agent" aside="Last 30 days">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-left text-[13px]">
                                <thead className="text-[12px] text-neutral-500">
                                    <tr>
                                        <th className="pb-2 font-normal">Agent</th>
                                        <th className="pb-2 font-normal">Model</th>
                                        <th className="pb-2 text-right font-normal">Replies</th>
                                        <th className="w-[30%] pb-2 pl-6 font-normal">Tokens</th>
                                        <th className="pb-2 text-right font-normal">Est. cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agents.map((a) => (
                                        <tr key={a.agentId} className="border-t border-neutral-100">
                                            <td className="py-2">
                                                <span className="flex items-center gap-2.5">
                                                    <AgentAvatar agent={a} size={22} />
                                                    {a.name}
                                                </span>
                                            </td>
                                            <td className="py-2 text-neutral-600">
                                                <span className="flex items-center gap-1.5">
                                                    <ProviderMark provider={modelOf(a.model).provider} className="size-3.5" />
                                                    {modelOf(a.model).label}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right font-mono text-[12px] tabular-nums">{a.replies30d}</td>
                                            <td className="py-2 pl-6">
                                                <span className="flex items-center gap-2">
                                                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                                                        <span className="block h-full rounded-full bg-primary/85" style={{ width: `${((a.input + a.output) / maxAgentTokens) * 100}%` }} />
                                                    </span>
                                                    <span className="w-12 text-right font-mono text-[12px] text-neutral-600 tabular-nums">{compact(a.input + a.output)}</span>
                                                </span>
                                            </td>
                                            <td className="py-2 text-right font-mono text-[12px] tabular-nums">{money(a.cost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>
                </div>
            </Scroll>
        </Content>
    )
}
