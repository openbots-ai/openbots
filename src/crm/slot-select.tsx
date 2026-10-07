import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ProviderMark } from '@/components/agent-config-bar'
import { cn } from '@/lib/utils'
import { INHERIT, type ModelOption, type Slot } from '@convex/lib/models'

const Choice = ({ option, muted }: { option: ModelOption; muted?: boolean }) => (
    <span className={cn('flex min-w-0 items-center gap-2', muted && 'text-neutral-500')}>
        <ProviderMark provider={option.provider} className="size-4" />
        <span className="truncate">{option.label}</span>
    </span>
)

// shadcn select for one model slot. With `inherited`, the first option is "use the workspace's choice".
export function SlotSelect({ slot, value, onChange, inherited, size = 'default', className }: { slot: Slot; value: string; onChange: (id: string) => void; inherited?: ModelOption; size?: 'sm' | 'default'; className?: string }) {
    const current = slot.options.find((o) => o.id === value)
    return (
        <Select value={value} onValueChange={(id) => id && onChange(id)}>
            <SelectTrigger aria-label={slot.label} size={size} className={cn('w-full bg-white', className)}>
                {value === INHERIT && inherited ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Choice option={inherited} muted />
                        <span className="shrink-0 text-[11px] text-neutral-400">default</span>
                    </span>
                ) : (
                    current && <Choice option={current} />
                )}
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start" className="min-w-56">
                {inherited && (
                    <SelectItem value={INHERIT}>
                        <span className="text-neutral-500">Workspace default ({inherited.label})</span>
                    </SelectItem>
                )}
                {slot.options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                        <Choice option={o} />
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
