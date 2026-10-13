import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '@/components/ui/select'
import { ProviderMark } from '@/components/agent-config-bar'
import { cn } from '@/lib/utils'
import { INHERIT, type ModelOption, type Slot } from '@convex/lib/models'
import { groupOptions } from '@/lib/agent-options'
import { useNav } from './nav'

const Choice = ({ option, muted }: { option: ModelOption; muted?: boolean }) => (
    <span className={cn('flex min-w-0 items-center gap-2', muted && 'text-neutral-500')}>
        <ProviderMark provider={option.provider} className="size-4" />
        <span className="truncate">{option.label}</span>
    </span>
)

// Shown instead of models when no AI key is set up on your agent
export function NoKeyNote() {
    const go = useNav()
    return (
        <p className="px-2 py-2 text-[12px] text-neutral-500">
            No AI key on your agent yet.{' '}
            <button type="button" onClick={() => go('connections')} className="cursor-pointer font-medium text-neutral-900 underline-offset-2 hover:underline">
                Set one up in Connections
            </button>
        </p>
    )
}

// shadcn select for one model slot, grouped by provider. With `inherited`, the first option is "use the workspace's
// choice". Brain and Backup should get their options from withKeyOptions (lib/key-models).
export function SlotSelect({ slot, value, onChange, inherited, size = 'default', className }: { slot: Slot; value: string; onChange: (id: string) => void; inherited?: ModelOption; size?: 'sm' | 'default'; className?: string }) {
    const current = slot.options.find((o) => o.id === value)
    const empty = slot.fromKeys && !slot.options.some((o) => o.provider !== 'none')
    return (
        <Select value={value} onValueChange={(id) => id && onChange(id)}>
            <SelectTrigger aria-label={slot.label} size={size} className={cn('w-full bg-white', className)}>
                {value === INHERIT && inherited ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Choice option={inherited} muted />
                        <span className="shrink-0 text-[11px] text-neutral-400">default</span>
                    </span>
                ) : current ? (
                    <Choice option={current} />
                ) : (
                    <span className="text-neutral-500">{empty ? 'Connect an AI key' : 'Pick a model'}</span>
                )}
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start" className="max-h-80 min-w-56">
                {inherited && (
                    <SelectItem value={INHERIT}>
                        <span className="text-neutral-500">Workspace default ({inherited.label})</span>
                    </SelectItem>
                )}
                {empty && <NoKeyNote />}
                {groupOptions(slot.options).map((g) => (
                    <SelectGroup key={g.label}>
                        {g.label && <SelectLabel>{g.label}</SelectLabel>}
                        {g.options.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                                <Choice option={o} />
                            </SelectItem>
                        ))}
                    </SelectGroup>
                ))}
            </SelectContent>
        </Select>
    )
}
