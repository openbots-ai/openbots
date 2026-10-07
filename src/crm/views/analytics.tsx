import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { dayLabel } from '../lib/time'
import { AgentAvatar, Content, Scroll, Toolbar } from '../ui'

export function AnalyticsView() {
    const data = useQuery(api.analytics.overview)
    const tiles = [
        { label: 'Agents live', value: data && `${data.agentsLive} / ${data.agents}` },
        { label: 'Contacts', value: data?.contacts },
        { label: 'Conversations', value: data?.conversations },
        { label: 'Messages, last 7 days', value: data?.messages7d },
    ]
    const maxDay = Math.max(1, ...(data?.perDay.map((d) => d.count) ?? []))
    const maxAgent = Math.max(1, ...(data?.perAgent.map((a) => a.count) ?? []))

    return (
        <Content>
            <Toolbar title="Analytics">
                <span className="text-[12px] text-neutral-500">Last 14 days</span>
            </Toolbar>
            <Scroll>
                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {tiles.map((t) => (
                            <div key={t.label} className="rounded-lg border border-neutral-200 p-4">
                                <p className="text-[12px] text-neutral-500">{t.label}</p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value ?? '–'}</p>
                            </div>
                        ))}
                    </div>

                    <section className="rounded-lg border border-neutral-200 p-4">
                        <h2 className="text-[13px] font-medium">Messages per day</h2>
                        <div className="mt-4 flex h-44 items-end gap-1.5" role="img" aria-label="Bar chart of messages per day">
                            {(data?.perDay ?? Array.from({ length: 14 }, (_, i) => ({ day: String(i), count: 0 }))).map((d) => (
                                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                                    <div className="w-full rounded-t-sm bg-primary/85 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(2, (d.count / maxDay) * 100)}%` }} />
                                    {data && (
                                        <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white group-hover:block">
                                            {dayLabel(d.day)}: {d.count}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        {data && (
                            <div className="mt-2 flex justify-between text-[11px] text-neutral-400">
                                <span>{dayLabel(data.perDay[0].day)}</span>
                                <span>{dayLabel(data.perDay[data.perDay.length - 1].day)}</span>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-neutral-200 p-4">
                        <h2 className="text-[13px] font-medium">Messages by agent</h2>
                        <ul className="mt-3 space-y-2.5">
                            {data?.perAgent.map((a) => (
                                <li key={a.agentId} className="flex items-center gap-3 text-[13px]">
                                    <AgentAvatar agent={a} size={22} />
                                    <span className="w-20 shrink-0 truncate">{a.name}</span>
                                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                                        <span className="block h-full rounded-full bg-primary/85" style={{ width: `${(a.count / maxAgent) * 100}%` }} />
                                    </span>
                                    <span className="w-8 text-right tabular-nums text-neutral-500">{a.count}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </Scroll>
        </Content>
    )
}
