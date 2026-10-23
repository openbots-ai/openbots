import { useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bookmark, Play } from 'lucide-react'
import { AgentAvatar } from '@/components/landing/agent-avatar'
import { useLoopedSteps } from '@/components/landing/use-looped-steps'
import { ProviderMark, VoiceAvatar } from '@/components/agent-config-bar'
import { SLOT_ICONS } from '@/components/slot-icons'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { voiceOf } from '@/lib/agent-options'
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

// Voice: the voice switches and the voice note's waveform reshapes and recolours with it
const VOICE_PICKS = [
    { id: 'susan', flag: '🇺🇸' },
    { id: 'theo', flag: '🇬🇧' },
    { id: 'mei', flag: '🇨🇦' },
]
// A distinct, deterministic waveform per voice
const shapeFor = (n: number) => Array.from({ length: 26 }, (_, k) => 8 + Math.abs(Math.sin(k * (0.45 + n * 0.32) + n * 1.7)) * 34)
const SHAPES = VOICE_PICKS.map((_, n) => shapeFor(n))

export function VoiceMock() {
    const [ref, i] = useCycle(VOICE_PICKS.length, 2200)
    const voice = voiceOf(VOICE_PICKS[i].id)
    return (
        <div ref={ref} className="flex w-full max-w-sm flex-col gap-5">
            <div className="flex flex-wrap justify-center gap-2">
                {VOICE_PICKS.map((p, k) => (
                    <span
                        key={p.id}
                        className={cn(
                            'flex items-center gap-2 rounded-full bg-white py-1.5 pr-3 pl-1.5 text-[13px] font-medium shadow-sm transition-all duration-300',
                            k === i ? 'scale-105 ring-2 ring-neutral-900' : 'opacity-55 ring-1 ring-black/8',
                        )}>
                        <VoiceAvatar voice={p.id} className="size-6 text-[11px]" />
                        {voiceOf(p.id).name}
                        <span className="text-[14px] leading-none">{p.flag}</span>
                    </span>
                ))}
            </div>
            <div className={cn(card, 'flex items-center gap-4 p-5')}>
                <motion.span animate={{ backgroundColor: `hsl(${voice.hue} 58% 50%)` }} transition={{ duration: 0.5 }} className="grid size-12 shrink-0 place-items-center rounded-full text-white">
                    <Play className="ml-0.5 size-5" fill="currentColor" />
                </motion.span>
                <span className="flex h-16 flex-1 items-center gap-[3px]">
                    {SHAPES[i].map((h, k) => (
                        <motion.span
                            key={k}
                            className="flex-1 rounded-full"
                            animate={{ height: h, backgroundColor: `hsl(${voice.hue} 55% 58%)`, scaleY: [1, 0.55, 1] }}
                            transition={{ height: { duration: 0.5, ease }, backgroundColor: { duration: 0.5 }, scaleY: { duration: 0.9, repeat: Infinity, delay: k * 0.04 } }}
                        />
                    ))}
                </span>
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

// Memory: things it learns drop into memory one by one, then one gets forgotten
const MEMORIES = [
    { emoji: '🥬', text: 'vegetarian' },
    { emoji: '💸', text: '$600 trips' },
    { emoji: '⏰', text: 'no early starts' },
    { emoji: '🐶', text: 'dog: biscuit' },
]
const FORGOTTEN = 2

export function MemoryMock() {
    // Steps 0-4 add memories, step 5 forgets one
    const [ref, step] = useCycle(MEMORIES.length + 2, 1100)
    const shown = MEMORIES.filter((_, k) => (step > MEMORIES.length ? k !== FORGOTTEN : k < step))
    return (
        <div ref={ref} className={cn(card, 'max-w-sm p-5')}>
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <Bookmark className="size-4" />
                    Memory
                </span>
                <span className="flex items-center gap-2 text-[12px] text-neutral-500">
                    Remember
                    <Switch checked size="sm" className="pointer-events-none" />
                </span>
            </div>
            <div className="mt-5 flex min-h-32 flex-wrap content-start gap-2">
                <AnimatePresence mode="popLayout">
                    {shown.map((m) => (
                        <motion.span
                            key={m.text}
                            layout
                            initial={{ opacity: 0, y: -18, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                            transition={spring}
                            className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-[13px] font-medium">
                            <span>{m.emoji}</span>
                            {m.text}
                        </motion.span>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    )
}

// Decisions (Jev): an incoming text is scanned and scored, then routed
const SCORES = [
    { label: 'Urgent', value: 94 },
    { label: 'Needs your yes', value: 88 },
]

export function DecisionsMock() {
    const ref = useRef<HTMLDivElement>(null)
    // 0 message arrives, 1 Jev scans it, 2 the answers land
    const step = useLoopedSteps(ref, [1000, 1500], 3000)
    const DecisionsIcon = SLOT_ICONS.decisions
    return (
        <div ref={ref} className="flex w-full max-w-sm flex-col gap-3">
            <div className={cn(card, 'relative flex items-center gap-3 overflow-hidden p-3.5')}>
                <AgentAvatar name="Waffles" className="size-9 shrink-0" />
                <span className="flex-1 space-y-1.5">
                    <span className="block h-2.5 w-3/4 rounded-full bg-neutral-200" />
                    <span className="block h-2.5 w-1/2 rounded-full bg-neutral-200" />
                </span>
                {step === 1 && (
                    <motion.span
                        className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-fuchsia-400/35 to-transparent"
                        initial={{ x: -96 }}
                        animate={{ x: 400 }}
                        transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
                    />
                )}
            </div>
            <div className={cn(card, 'space-y-3.5 p-4')}>
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <DecisionsIcon className="size-4 text-neutral-500" />
                    <ProviderMark provider="typesafe" className="size-4" />
                    Jev
                </div>
                {SCORES.map((s) => (
                    <div key={s.label} className="grid grid-cols-[104px_minmax(0,1fr)_40px] items-center gap-3 text-[12px]">
                        <span className="text-neutral-600">{s.label}</span>
                        <Progress value={step >= 2 ? s.value : 0} className="[&_[data-slot=progress-indicator]]:duration-700" />
                        <span className="text-right font-mono tabular-nums">{step >= 2 ? `${s.value}%` : '–'}</span>
                    </div>
                ))}
                <div className="flex items-center gap-3 border-t border-neutral-100 pt-3 text-[12px]">
                    <span className="w-[104px] text-neutral-600">Send to</span>
                    <AnimatePresence>
                        {step >= 2 && (
                            <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 rounded-full bg-neutral-100 py-0.5 pr-2.5 pl-0.5 font-medium">
                                <AgentAvatar name="Mochi" className="size-5" />
                                Mochi
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
