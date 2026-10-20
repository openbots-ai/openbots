import { useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, FileText } from 'lucide-react'
import { AgentAvatar } from '@/components/landing/agent-avatar'
import { useLoopedSteps } from '@/components/landing/use-looped-steps'
import { ProviderMark } from '@/components/agent-config-bar'
import { SLOT_ICONS } from '@/components/slot-icons'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { BRAIN_MODELS } from '@convex/lib/models'

// Each mock shows one customization being changed and what changes with it. Mostly visual, little text.

const card = 'w-full rounded-[1.6rem] bg-white text-left text-neutral-900 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1 ring-black/8'
const ease = [0.22, 1, 0.36, 1] as const
const spring = { type: 'spring', stiffness: 380, damping: 32 } as const

// Steps 0..count-1, advancing every `ms` while on screen and looping
function useCycle(count: number, ms: number) {
    const ref = useRef<HTMLDivElement>(null)
    const step = useLoopedSteps(ref, Array<number>(count - 1).fill(ms), ms)
    return [ref, step % count] as const
}

// Brain: model logos take turns flying into the agent's Brain slot
const BRAINS = ['gpt-5.1', 'claude-sonnet-5.5', 'gemini-2.5-flash', 'grok-4'].map((id) => BRAIN_MODELS.find((m) => m.id === id)!)

export function BrainMock() {
    const [ref, i] = useCycle(BRAINS.length, 1800)
    const BrainIcon = SLOT_ICONS.brain
    const brain = BRAINS[i]
    return (
        <div ref={ref} className="flex w-full max-w-sm flex-col items-center">
            <div className="flex gap-3">
                {BRAINS.map((m) => (
                    <div key={m.id} className="grid size-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/8">
                        {m.id === brain.id ? (
                            <span className="size-7 rounded-full border-2 border-dashed border-neutral-200" />
                        ) : (
                            <motion.span layoutId={`brain-${m.id}`} transition={spring}>
                                <ProviderMark provider={m.provider} className="size-7" />
                            </motion.span>
                        )}
                    </div>
                ))}
            </div>
            <motion.span key={brain.id} initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.4, ease }} className="h-10 w-0.5 origin-top rounded-full bg-gradient-to-b from-neutral-200 to-primary" />
            <div className={cn(card, 'flex items-center gap-4 p-4')}>
                <AgentAvatar name="Penny" className="size-14" />
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">Penny</p>
                    <div className="mt-2 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2">
                        <BrainIcon className="size-4 shrink-0 text-neutral-500" />
                        <span className="grid size-6 shrink-0 place-items-center">
                            <motion.span layoutId={`brain-${brain.id}`} transition={spring}>
                                <ProviderMark provider={brain.provider} className="size-5" />
                            </motion.span>
                        </span>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span key={brain.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="truncate text-[13px] font-medium">
                                {brain.label}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Personality: creativity and reply length change, and the reply bubble grows and gets playful
const PERSONALITIES = [
    { creativity: 0.2, length: 'short', lines: [0.5], sparkle: false },
    { creativity: 0.55, length: 'medium', lines: [0.95, 0.6], sparkle: false },
    { creativity: 0.95, length: 'long', lines: [0.95, 0.85, 0.45], sparkle: true },
]

export function PersonalityMock() {
    const [ref, i] = useCycle(PERSONALITIES.length, 2000)
    const p = PERSONALITIES[i]
    return (
        <div ref={ref} className="flex w-full max-w-sm flex-col gap-5">
            <div className={cn(card, 'space-y-5 p-5')}>
                <div className="space-y-3">
                    <div className="flex justify-between text-[12px] font-medium text-neutral-600">
                        <span>Creativity</span>
                        <span className="text-neutral-400 tabular-nums">{p.creativity.toFixed(1)}</span>
                    </div>
                    <Slider value={[p.creativity * 100]} min={0} max={100} className="pointer-events-none [&_[data-slot=slider-range]]:transition-all [&_[data-slot=slider-range]]:duration-500" />
                </div>
                <div className="space-y-2">
                    <span className="block text-[12px] font-medium text-neutral-600">Reply length</span>
                    <ToggleGroup variant="outline" size="sm" spacing={0} value={[p.length]} className="pointer-events-none w-full">
                        {['short', 'medium', 'long'].map((l) => (
                            <ToggleGroupItem key={l} value={l} className="flex-1 text-[12px] capitalize">
                                {l}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
            </div>
            <div className="flex items-end gap-2">
                <AgentAvatar name="Mochi" className="size-8 shrink-0" />
                <motion.div layout transition={spring} className="relative w-[78%] rounded-[18px] rounded-bl-md bg-[#E9E9EB] px-4 py-3">
                    {p.lines.map((w, k) => (
                        <motion.span key={`${i}-${k}`} initial={{ width: 0, opacity: 0 }} animate={{ width: `${w * 100}%`, opacity: 1 }} transition={{ duration: 0.45, delay: k * 0.08, ease }} className="mb-1.5 block h-2.5 rounded-full bg-neutral-400/55 last:mb-0" />
                    ))}
                    <AnimatePresence>
                        {p.sparkle && (
                            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring} className="absolute -top-3 -right-3 text-2xl">
                                ✨
                            </motion.span>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    )
}

// Knowledge: docs you write drop into the agent's knowledge one by one, then the list starts over
const DOCS = [
    { title: 'Food rules', note: 'vegetarian, no early dinners' },
    { title: 'Family', note: 'mom: no dairy · dog: biscuit' },
    { title: 'Budget', note: '$600 max for trips' },
]

export function KnowledgeMock() {
    // Each step adds a doc, the last holds the full list, then it starts over from the first
    const [ref, step] = useCycle(DOCS.length + 1, 1300)
    const shown = DOCS.slice(0, Math.min(step + 1, DOCS.length))
    return (
        <div ref={ref} className={cn(card, 'max-w-sm p-5')}>
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <BookOpen className="size-4" />
                    Knowledge
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 py-0.5 pr-2.5 pl-0.5 text-[12px] font-medium">
                    <AgentAvatar name="Biscuit" className="size-5" />
                    Biscuit
                </span>
            </div>
            <div className="mt-5 flex min-h-40 flex-col gap-2">
                <AnimatePresence mode="popLayout">
                    {shown.map((d) => (
                        <motion.div
                            key={d.title}
                            layout
                            initial={{ opacity: 0, y: -18, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
                            transition={spring}
                            className="flex items-center gap-3 rounded-xl bg-neutral-100 px-3 py-2">
                            <FileText className="size-4 shrink-0 text-neutral-500" />
                            <span className="min-w-0">
                                <span className="block text-[13px] font-medium">{d.title}</span>
                                <span className="block truncate text-[12px] text-neutral-500">{d.note}</span>
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    )
}
