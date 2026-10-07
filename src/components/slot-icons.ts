import { AudioLines, Brain, Ear, Eye, LifeBuoy, MousePointerClick, Phone, Route, Zap, type LucideIcon } from 'lucide-react'
import type { SlotId } from '@convex/lib/models'

// One icon per model slot, shared by the CRM Models page, the agent editor and the landing demo
export const SLOT_ICONS: Record<SlotId, LucideIcon> = {
    brain: Brain,
    computer: MousePointerClick,
    voice: AudioLines,
    listening: Ear,
    calls: Phone,
    vision: Eye,
    decisions: Zap,
    router: Route,
    backup: LifeBuoy,
}
