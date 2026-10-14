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
// Not randomUUID: that only exists in secure contexts
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')
const fresh = (): CheckIn => ({ id: newId(), days: [1, 2, 3, 4, 5], time: '08:00', what: '', on: true })

const same = (a: CheckIn[], b: CheckIn[]) =>
    a.length === b.length &&
    a.every((x, i) => {
        const y = b[i]
        return x.id === y.id && x.time === y.time && x.what.trim() === y.what.trim() && x.on === y.on && [...x.days].sort().join() === [...y.days].sort().join()
    })

// Texts this agent sends you on a schedule, in your timezone (Settings). Saved as a whole with its own button, so
// editing the agent elsewhere never touches them.
export function CheckIns({ agent }: { agent: Doc<'agents'> }) {
    const save = useMutation(api.agents.setCheckIns)
    const run = useRun()
    const [list, setList] = useState<CheckIn[]>(agent.checkIns ?? [])
    const dirty = !same(list, agent.checkIns ?? [])
    const valid = list.every((c) => c.what.trim() && c.days.length > 0 && c.time)
    const edit = (i: number, patch: Partial<CheckIn>) => setList(list.map((c, j) => (j === i ? { ...c, ...patch } : c)))

    return (
        <div className="space-y-3">
            {list.map((c, i) => (
                <div key={c.id} className="space-y-2 rounded-md border border-neutral-200 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input aria-label="Time" type="time" value={c.time} onChange={(e) => edit(i, { time: e.target.value })} className="h-8 w-28 min-w-0" />
                        <div className="order-last flex w-full flex-wrap gap-1.5">
                            {DAYS.map((d, n) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={c.days.includes(n)}
                                    onClick={() => edit(i, { days: c.days.includes(n) ? c.days.filter((x) => x !== n) : [...c.days, n].sort() })}
                                    className={cn('min-w-9 rounded px-2 py-1.5 text-[12px]', c.days.includes(n) ? 'bg-primary text-primary-foreground' : 'bg-neutral-100 text-neutral-500')}>
                                    {d}
                                </button>
                            ))}
                        </div>
                        <Switch size="sm" aria-label="On" checked={c.on} onCheckedChange={(on) => edit(i, { on })} className="ml-auto" />
                        <Btn variant="ghost" size="icon-sm" aria-label="Remove check-in" onClick={() => setList(list.filter((_, j) => j !== i))}>
                            <Trash2 />
                        </Btn>
                    </div>
                    <Input aria-label="What to send" value={c.what} onChange={(e) => edit(i, { what: e.target.value })} maxLength={500} placeholder="e.g. today's weather in Saskatoon and my first meeting" className="h-8" />
                </div>
            ))}
            <div className="flex gap-2">
                {list.length < 5 && (
                    <Btn variant="primary" onClick={() => setList([...list, fresh()])}>
                        <Plus />
                        Add check-in
                    </Btn>
                )}
                {dirty && (
                    <Btn variant="primary" disabled={!valid} onClick={() => void run(save({ id: agent._id, checkIns: list.map((c) => ({ ...c, what: c.what.trim() })) }))}>
                        Save check-ins
                    </Btn>
                )}
            </div>
        </div>
    )
}
