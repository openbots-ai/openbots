import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useRun } from './use-run'
import { Btn } from './ui'

type CheckIn = NonNullable<Doc<'agents'>['checkIns']>[number]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fresh = (): CheckIn => ({ id: crypto.randomUUID().slice(0, 8), days: [1, 2, 3, 4, 5], time: '08:00', what: '', on: true })

// Texts this agent sends you on a schedule, in your timezone (Settings). Saved as a whole with its own button, so
// editing the agent elsewhere never touches them.
export function CheckIns({ agent }: { agent: Doc<'agents'> }) {
    const save = useMutation(api.agents.setCheckIns)
    const run = useRun()
    const [list, setList] = useState<CheckIn[]>(agent.checkIns ?? [])
    const dirty = JSON.stringify(list.map((c) => ({ ...c, what: c.what.trim() }))) !== JSON.stringify(agent.checkIns ?? [])
    const edit = (i: number, patch: Partial<CheckIn>) => setList(list.map((c, j) => (j === i ? { ...c, ...patch } : c)))

    return (
        <div className="space-y-3">
            {list.map((c, i) => (
                <div key={c.id} className="space-y-2 rounded-md border border-neutral-200 p-2.5">
                    <div className="flex items-center gap-2">
                        <Input aria-label="Time" type="time" value={c.time} onChange={(e) => edit(i, { time: e.target.value })} className="h-8 w-28" />
                        <div className="flex flex-wrap gap-1">
                            {DAYS.map((d, n) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={c.days.includes(n)}
                                    onClick={() => edit(i, { days: c.days.includes(n) ? c.days.filter((x) => x !== n) : [...c.days, n].sort() })}
                                    className={cn('rounded px-1.5 py-0.5 text-[11px]', c.days.includes(n) ? 'bg-primary text-primary-foreground' : 'bg-neutral-100 text-neutral-500')}>
                                    {d}
                                </button>
                            ))}
                        </div>
                        <Switch size="sm" aria-label="On" checked={c.on} onCheckedChange={(on) => edit(i, { on })} className="ml-auto" />
                        <Btn variant="ghost" size="icon-sm" aria-label="Remove check-in" onClick={() => setList(list.filter((_, j) => j !== i))}>
                            <Trash2 />
                        </Btn>
                    </div>
                    <Input aria-label="What to send" value={c.what} onChange={(e) => edit(i, { what: e.target.value })} placeholder="e.g. today's weather in Saskatoon and my first meeting" className="h-8" />
                </div>
            ))}
            <div className="flex gap-2">
                {list.length < 5 && (
                    <Btn onClick={() => setList([...list, fresh()])}>
                        <Plus />
                        Add check-in
                    </Btn>
                )}
                {dirty && (
                    <Btn variant="primary" onClick={() => void run(save({ id: agent._id, checkIns: list.map((c) => ({ ...c, what: c.what.trim() })) }))}>
                        Save check-ins
                    </Btn>
                )}
            </div>
        </div>
    )
}
