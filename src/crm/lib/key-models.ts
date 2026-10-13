import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { INHERIT, keyModels, NONE, slotOptions, type ModelOption, type Slot } from '@convex/lib/models'
import { optionFromId } from '@/lib/agent-options'

// The models your AI keys can use, as your agents last reported them; undefined while loading
export function useKeyModels(): ModelOption[] | undefined {
    const runners = useQuery(api.runners.list)
    return runners && keyModels(runners.flatMap((r) => r.models ?? []))
}

// A slot whose options are what your keys offer (Brain and Backup), plus the saved choice when the keys no longer
// offer it, so the picker never silently changes
export function withKeyOptions(slot: Slot, available: ModelOption[], saved?: string): Slot {
    const options = slotOptions(slot, available)
    const gone = slot.fromKeys && saved && saved !== INHERIT && saved !== NONE ? optionFromId(saved) : undefined
    if (!gone || options.some((o) => o.id === gone.id)) return { ...slot, options }
    return { ...slot, options: [{ ...gone, id: saved!, label: `${gone.label} (not on your keys)` }, ...options] }
}
