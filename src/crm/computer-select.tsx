import { Cloud, Monitor } from 'lucide-react'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { kindOf } from '@convex/lib/computers'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useNav } from './nav'
import { useNow } from './use-now'

type Computer = Omit<Doc<'runners'>, 'tokenHash'>

// The engine checks in every minute; a few missed beats and it shows as offline
const ONLINE_MS = 3 * 60_000
// Picker values for "use the workspace's computer" and "add one"
const INHERIT = 'inherit'
const ADD = 'add'

function Choice({ computer, muted }: { computer: Computer; muted?: boolean }) {
    const now = useNow(30_000)
    const online = !!computer.lastSeenAt && now - computer.lastSeenAt < ONLINE_MS
    const Icon = kindOf(computer) === 'orgo' ? Cloud : Monitor
    return (
        <span className={cn('flex min-w-0 items-center gap-2', muted && 'text-neutral-500')}>
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{computer.name}</span>
            <span className={cn('size-1.5 shrink-0 rounded-full', online ? 'bg-emerald-500' : 'bg-neutral-300')} aria-label={online ? 'Online' : 'Offline'} />
        </span>
    )
}

// Pick a computer for computer use, grouped like the model pickers: your own computers, and cloud ones on Orgo. With
// `inherited`, the first option is "use the workspace's computer".
export function ComputerSelect({
    computers,
    value,
    onChange,
    inherited,
    className,
}: {
    computers: Computer[]
    value?: Id<'runners'>
    onChange: (id: Id<'runners'> | undefined) => void
    inherited?: Computer
    className?: string
}) {
    const go = useNav()
    const current = computers.find((c) => c._id === value)
    const groups = [
        { label: 'Your computer', items: computers.filter((c) => kindOf(c) === 'own') },
        { label: 'Cloud · Orgo', items: computers.filter((c) => kindOf(c) === 'orgo') },
    ]
    return (
        <Select
            value={current ? current._id : INHERIT}
            onValueChange={(id) => {
                if (id === ADD) go('connections')
                else if (id) onChange(id === INHERIT ? undefined : (id as Id<'runners'>))
            }}>
            <SelectTrigger aria-label="Computer" className={cn('w-full bg-white', className)}>
                {current ? (
                    <Choice computer={current} />
                ) : inherited ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Choice computer={inherited} muted />
                        <span className="shrink-0 text-[11px] text-neutral-400">default</span>
                    </span>
                ) : (
                    <span className="text-neutral-500">{computers.length ? 'Pick a computer' : 'No computer yet'}</span>
                )}
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start" className="max-h-80 min-w-56">
                <SelectItem value={INHERIT}>
                    <span className="text-neutral-500">{inherited ? `Workspace default (${inherited.name})` : 'None picked'}</span>
                </SelectItem>
                {groups.map((g) => (
                    <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.items.map((c) => (
                            <SelectItem key={c._id} value={c._id}>
                                <Choice computer={c} />
                            </SelectItem>
                        ))}
                        {!g.items.length && (
                            <SelectItem value={ADD}>
                                <span className="text-neutral-500">{g.label === 'Cloud · Orgo' ? 'Create on Orgo…' : 'Add your computer…'}</span>
                            </SelectItem>
                        )}
                    </SelectGroup>
                ))}
            </SelectContent>
        </Select>
    )
}
