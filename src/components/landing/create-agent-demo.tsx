import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, Bot, ChartLine, ChevronDown, ChevronsUpDown, Cpu, MessageCircle, Plus, Search, Settings, Tag, X } from 'lucide-react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AgentAvatar } from '@/components/landing/agent-avatar'
import { useCases } from '@/lib/assistant-examples'
import { AgentConfigBar, MenuPicture, ProviderMark } from '@/components/agent-config-bar'
import { UsageGauge } from '@/components/usage-gauge'
import { Progress } from '@/components/ui/progress'
import { DEFAULT_CONFIG } from '@/lib/agent-options'
import { SLOT_ICONS } from '@/components/slot-icons'
import { SLOTS, resolveModels, slotOf, type SlotId } from '@convex/lib/models'
import { cn } from '@/lib/utils'

type Status = 'draft' | 'live'

// What each tab's agent gets set up with in the editor
const settings: Record<string, { type: string; prompt: string; number: string; model: string; voice: string; language: string }> = {
    Waffles: {
        type: 'Personal',
        prompt: 'Help me keep up with everyday tasks. Keep replies short and friendly. Ask before sending messages or making purchases.',
        number: '+1 (415) 555-0142',
        model: 'grok-4',
        voice: 'omar',
        language: 'en-US',
    },
    Pebble: {
        type: 'Work',
        prompt: 'Compare the options I send you. Give me a short recommendation with sources and tradeoffs. Ask about my budget first.',
        number: '+1 (415) 555-0178',
        model: 'gemini-2.5-flash',
        voice: 'theo',
        language: 'en-GB',
    },
    Mochi: {
        type: 'Work',
        prompt: 'Help me plan a realistic week. Leave room between meetings and keep evenings free. Ask before changing my calendar.',
        number: '+1 (415) 555-0193',
        model: 'claude-sonnet-5.5',
        voice: 'nia',
        language: 'en-US',
    },
    Honey: {
        type: 'Personal',
        prompt: 'Help me write in my own voice: warm, direct, no corporate language. Show me the draft before sending anything.',
        number: '+1 (415) 555-0127',
        model: 'claude-haiku-4.5',
        voice: 'mei',
        language: 'multi',
    },
}

// Agents already in the workspace, listed before the new one is created
const existing: { name: string; role: string; number: string; status: Status | 'paused'; edited: string }[] = [
    { name: 'Pip', role: 'Personal assistant', number: '+1 (415) 555-0110', status: 'live', edited: '2h ago' },
    { name: 'Biscuit', role: 'Copywriter', number: '+1 (415) 555-0164', status: 'live', edited: 'Yesterday' },
    { name: 'Penny', role: 'Finance & invoices', number: '+1 (415) 555-0151', status: 'paused', edited: 'Monday' },
    { name: 'Sprout', role: 'Fitness coach', number: '', status: 'draft', edited: 'Sep 28' },
]

const AVATARS = ['tofu', 'lulu', 'rishi', 'pip', 'mochi', 'biscuit', 'pebble', 'penny', 'waffles', 'honey', 'sprout']

// The flow as timed beats: press Create, fill the dialog, pick model, voice and language, fill the editor, attach a
// number and go live, then open Models to see its mix and Analytics to see what each model did
// Three short flows through the same agent, one per tab
type FlowId = 'build' | 'models' | 'analytics'

// The agent every flow follows
const AGENT = useCases.find((u) => u.agent === 'Mochi')!

// In the hero these read as "how it works": numbered steps with a one-line explainer (hidden on phones)
// `short` replaces the title on phones, where three steps share one row
const FLOWS: { id: FlowId; title: string; short: string; detail: string; hue: number }[] = [
    { id: 'build', title: 'Create an agent', short: 'Create', detail: 'give it a name, a job and a personality', hue: 205 },
    { id: 'models', title: 'Pick its models', short: 'Models', detail: 'a different model for every part', hue: 262 },
    { id: 'analytics', title: 'See what it did', short: 'Results', detail: 'every task and cost, per model', hue: 160 },
]

// Stretches every beat so each step has time to land
const PACE = 1.35

// The model slots after the brain, filled one by one in the models flow
const OTHER_SLOTS = SLOTS.filter((slot) => slot.id !== 'brain')

// Each flow as timed beats. Beats from earlier flows that a flow starts after count as already done
// (see DONE), so "mix the models" opens on the finished editor and "track the work" on the agent list.
const timeline = (flow: FlowId, agent: string, role: string) => {
    const s = settings[agent]
    const beats: [string, number][] =
        flow === 'build'
            ? [
                  ['list', 1300],
                  ['pressCreate', 350],
                  ['name', 250 + agent.length * 90],
                  ['role', 200 + role.length * 55],
                  ['pressSubmit', 450],
                  ['editor', 700],
                  ['type', s.type.length * 80],
                  ['avatar', 700],
                  ['prompt', s.prompt.length * 22],
                  ['save', 700],
                  ['hold', 2200],
              ]
            : flow === 'models'
              ? [
                    ['intro', 900],
                    ['model', 1700],
                    ['voice', 2300],
                    ['language', 1600],
                    ['slots', OTHER_SLOTS.length * 650],
                    ['save', 700],
                    ['toModels', 600],
                    ['models', 2800],
                    ['hold', 1200],
                ]
              : [
                    ['intro', 1100],
                    ['toAnalytics', 600],
                    ['analytics', 5000],
                    ['hold', 2200],
                ]
    let at = 0
    const starts: Record<string, [number, number]> = {}
    for (const [key, dur] of beats) {
        starts[key] = [at, dur * PACE]
        at += dur * PACE
    }
    return { starts, total: at }
}

const DONE: Record<FlowId, Set<string>> = {
    build: new Set(),
    models: new Set(['list', 'pressCreate', 'name', 'role', 'pressSubmit', 'editor', 'type', 'avatar', 'prompt']),
    analytics: new Set(),
}

// Within the model and language beats: the menu is open between these points and the pointer reaches the pick at HOVER.
// The voice beat closes its menu earlier so most of it is left for the preview playing.
const MENU_OPEN = 0.1
const MENU_HOVER = 0.4
const MENU_CLOSE = 0.75
const VOICE_MENU_CLOSE = 0.45

type Menu = { control: 'model' | 'voice' | 'language'; hovered: string }
function menuAt(p: (key: string) => number, s: { model: string; voice: string; language: string }): Menu | undefined {
    const at = (control: Menu['control'], pick: string, fallback: string, close: number): Menu | undefined => {
        const t = p(control)
        if (t < MENU_OPEN || t >= close) return undefined
        return { control, hovered: t >= MENU_HOVER * (close / MENU_CLOSE) ? pick : fallback }
    }
    return at('model', s.model, DEFAULT_CONFIG.model, MENU_CLOSE) ?? at('voice', s.voice, DEFAULT_CONFIG.voice, VOICE_MENU_CLOSE) ?? at('language', s.language, DEFAULT_CONFIG.language, MENU_CLOSE)
}

// The phone number picker lists "None", the agent's number, and a couple of other free numbers
const NONE = 'None'
const numberOptions = (mine: string) => [NONE, mine, '+1 (628) 555-0190', '+1 (415) 555-0119']

// Status chip colors copied from the CRM
const BADGE: Record<string, string> = {
    live: 'bg-emerald-50 text-emerald-700 border-emerald-600/15',
    draft: 'bg-neutral-100 text-neutral-600 border-neutral-500/15',
    paused: 'bg-amber-50 text-amber-700 border-amber-600/15',
}

const Badge = ({ status }: { status: string }) => (
    <span className={cn('inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium capitalize', BADGE[status])}>{status}</span>
)

const Btn = ({ primary, pressed, children, className }: { primary?: boolean; pressed?: boolean; children: ReactNode; className?: string }) => (
    <span
        className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-[transform,background-color] duration-150 [&_svg]:size-4',
            primary ? 'bg-primary text-primary-foreground' : 'border border-neutral-200 bg-white text-neutral-800',
            pressed && 'scale-95',
            pressed && (primary ? 'bg-primary/85' : 'bg-neutral-100'),
            className,
        )}>
        {children}
    </span>
)

const Caret = () => <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-neutral-900" />

// A text input or textarea showing `value`, with a focus ring and caret while it is being typed into
const Input = ({ value, focused, placeholder, multiline }: { value: string; focused?: boolean; placeholder?: string; multiline?: boolean }) => (
    <span
        className={cn(
            'block rounded-md border bg-white px-2.5 text-[13px] text-neutral-900 transition-shadow',
            multiline ? 'min-h-[104px] py-2 leading-relaxed' : 'flex h-8 items-center truncate',
            focused ? 'border-neutral-400 ring-3 ring-neutral-300/50' : 'border-neutral-200',
        )}>
        {value || (!focused && placeholder && <span className="text-neutral-400">{placeholder}</span>)}
        {focused && <Caret />}
    </span>
)

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
    <span className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        {children}
        {hint && <span className="text-[11px] leading-snug text-neutral-500">{hint}</span>}
    </span>
)

const nav: { label: string; items: [string, typeof Bot][] }[] = [
    { label: 'Build', items: [['Agents', Bot], ['Models', Cpu], ['Knowledge', BookOpen], ['iMessage Numbers', MessageCircle]] },
    { label: 'Insights', items: [['Analytics', ChartLine]] },
    { label: 'System', items: [['Settings', Settings]] },
]

// `active` is the highlighted page; `pressed` briefly shows a click landing on a nav item
const Sidebar = ({ active, pressed }: { active: string; pressed?: string }) => (
    <aside className="flex w-52 shrink-0 flex-col bg-[#f5f5f7] px-3 py-3">
        <span className="flex items-center gap-2 px-1.5 pb-3">
            <img src="/favicon.svg" alt="" className="size-5" />
            <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
        </span>
        <span className="mb-4 flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/6">
            <span className="bg-primary-gradient grid size-7 place-items-center rounded-md text-[12px] font-semibold text-white">A</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-neutral-400">Workspace</span>
                <span className="block truncate text-[13px] font-semibold">Acme</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-neutral-400" />
        </span>
        <span className="space-y-4">
            {nav.map((g) => (
                <span key={g.label} className="block">
                    <span className="mb-1 block px-2 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">{g.label}</span>
                    {g.items.map(([label, Icon]) => (
                        <span
                            key={label}
                            className={cn(
                                'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-neutral-600 transition-[transform,background-color] duration-150 [&_svg]:size-4',
                                label === active && 'bg-neutral-200/70 font-medium text-neutral-900',
                                label === pressed && 'scale-95 bg-neutral-200',
                            )}>
                            <Icon />
                            {label}
                        </span>
                    ))}
                </span>
            ))}
        </span>
    </aside>
)

const Toolbar = ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-neutral-200/70 px-4">
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-neutral-900">{title}</span>
        <span className="flex items-center gap-2">{children}</span>
    </div>
)

function ListScreen({ pressed, compact }: { pressed: boolean; compact: boolean }) {
    const types = ['Business', 'Personal', 'Work']
    // The compact layout drops the columns that only fit at desktop width
    const cols = compact ? 'grid-cols-[1.2fr_1.4fr_0.8fr]' : 'grid-cols-[1.3fr_1.3fr_1.3fr_0.8fr_0.8fr]'
    const wide = ['iMessage', 'Edited']
    const hideWide = compact && 'hidden'
    return (
        <div className="flex h-full">
            <aside className={cn('w-48 shrink-0 flex-col gap-0.5 border-r border-neutral-200/70 p-2 text-[13px]', compact ? 'hidden' : 'flex')}>
                <span className="flex h-8 items-center gap-2 rounded-md bg-neutral-100 px-2.5 font-medium text-neutral-900 [&_svg]:size-4">
                    <Bot />
                    All Agents
                    <span className="ml-auto text-[11px] font-normal text-neutral-400">{existing.length}</span>
                </span>
                <span className="px-2.5 pt-4 pb-1 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">Types</span>
                {types.map((t) => (
                    <span key={t} className="flex h-8 items-center gap-2 px-2.5 text-neutral-600 [&_svg]:size-4">
                        <Tag />
                        {t}
                    </span>
                ))}
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
                <Toolbar title="All Agents">
                    <span className={cn('h-8 w-48 items-center gap-2 rounded-md border border-neutral-200 px-2.5 text-[13px] text-neutral-400', compact ? 'hidden' : 'flex')}>
                        <Search className="size-3.5" />
                        Search...
                    </span>
                    <Btn primary pressed={pressed}>
                        <Plus />
                        Create an Agent
                    </Btn>
                </Toolbar>
                <div className="px-4 py-3 text-[13px]">
                    <div className={cn('grid border-b border-neutral-200 pb-2.5 text-neutral-500', cols)}>
                        {['Agent', 'Role', 'iMessage', 'Status', 'Edited'].map((h) => (
                            <span key={h} className={cn('px-2', wide.includes(h) && hideWide)}>{h}</span>
                        ))}
                    </div>
                    {existing.map((a) => (
                        <div key={a.name} className={cn('grid items-center border-b border-neutral-100 py-2.5 text-neutral-700', cols)}>
                            <span className="flex items-center gap-2.5 px-2">
                                <AgentAvatar name={a.name} className="size-7 bg-neutral-100" />
                                <span className="font-medium text-neutral-900">{a.name}</span>
                            </span>
                            <span className="px-2">{a.role}</span>
                            <span className={cn('px-2', hideWide)}>{a.number || <span className="text-neutral-400">None</span>}</span>
                            <span className="px-2"><Badge status={a.status} /></span>
                            <span className={cn('px-2 text-neutral-500', hideWide)}>{a.edited}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function CreateDialog({ name, role, focus, pressed }: { name: string; role: string; focus?: 'name' | 'role'; pressed: boolean }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 grid place-items-center bg-black/20">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-[420px] rounded-xl bg-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/8">
                <div className="flex items-center justify-between border-b px-5 py-3.5">
                    <span className="text-[15px] font-semibold">Create an agent</span>
                    <X className="size-4 text-neutral-400" />
                </div>
                <div className="space-y-3.5 px-5 py-4">
                    <Field label="Name">
                        <Input value={name} focused={focus === 'name'} placeholder="e.g. Iris" />
                    </Field>
                    <Field label="Role" hint="What it handles. You can change everything later.">
                        <Input value={role} focused={focus === 'role'} placeholder="e.g. Scheduling" />
                    </Field>
                </div>
                <div className="flex justify-end gap-2 border-t bg-neutral-50/70 px-5 py-3">
                    <Btn>Cancel</Btn>
                    <Btn primary pressed={pressed} className={cn(!name && 'opacity-50')}>Create</Btn>
                </div>
            </motion.div>
        </motion.div>
    )
}

type EditorState = {
    agent: string
    role: string
    type: string
    avatar: boolean
    prompt: string
    status: Status
    number: boolean
    saved: boolean
    pressSave: boolean
    focus?: 'type' | 'prompt' | 'status' | 'number'
    // Phone number option the pointer is on while the picker is open
    numberMenu?: string
    model: string
    voice: string
    language: string
    playing: boolean
    configFocus?: 'model' | 'voice' | 'language'
    // How many of the other model slots have been picked so far; the next one is drawn focused
    filled: number
    filling: boolean
    menu?: { control: 'model' | 'voice' | 'language'; hovered: string }
}

function EditorScreen({ e, compact }: { e: EditorState; compact: boolean }) {
    const s = settings[e.agent]
    const initial = e.agent.slice(0, 1)
    return (
        <div className="flex h-full flex-col">
            <Toolbar
                title={
                    <>
                        <ArrowLeft className="size-4 text-neutral-500" />
                        {e.avatar ? (
                            <AgentAvatar name={e.agent} className="size-6 bg-neutral-100" />
                        ) : (
                            <span className="grid size-6 place-items-center rounded-full bg-neutral-400 text-[10px] font-semibold text-white">{initial}</span>
                        )}
                        <span>{e.agent}</span>
                        <Badge status={e.status} />
                    </>
                }>
                <Btn className="text-red-600">Delete</Btn>
                <Btn primary pressed={e.pressSave} className={cn(e.saved && 'opacity-50')}>{e.saved ? 'Saved' : 'Save changes'}</Btn>
            </Toolbar>
            <div className="shrink-0 border-b border-neutral-200/70 px-4 py-2.5">
                <AgentConfigBar
                    interactive={false}
                    menu={e.menu}
                    model={e.model}
                    voice={e.voice}
                    language={e.language}
                    playing={e.playing}
                    highlight={e.configFocus}
                    // The other parts start empty and take this agent's mix one at a time in the models flow
                    slots={OTHER_SLOTS.map((slot, i) => ({ slot, value: i < e.filled ? MIXES[e.agent]?.[slot.id] || slot.default : '', highlight: i === e.filled && e.filling }))}
                />
            </div>
            <div className={cn('grid min-h-0 flex-1 gap-4 p-4', !compact && 'grid-cols-[minmax(0,1fr)_260px]')}>
                <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
                    <div className="grid grid-cols-2 gap-3.5">
                        <Field label="Name"><Input value={e.agent} /></Field>
                        <Field label="Role"><Input value={e.role} /></Field>
                        <Field label="Status">
                            <span className={cn('flex h-8 items-center justify-between rounded-md border px-2.5 text-[13px] transition-shadow', e.focus === 'status' ? 'border-neutral-400 ring-3 ring-neutral-300/50' : 'border-neutral-200')}>
                                <span className="capitalize">{e.status}</span>
                                <ChevronDown className="size-4 text-neutral-400" />
                            </span>
                        </Field>
                        <Field label="Type"><Input value={e.type} focused={e.focus === 'type'} placeholder="None" /></Field>
                    </div>
                    <span className="block space-y-1.5">
                        <span className="block text-xs font-medium text-neutral-600">Avatar</span>
                        <span className="flex gap-2">
                            {AVATARS.map((a) => {
                                const on = e.avatar && a === e.agent.toLowerCase()
                                return (
                                    <span key={a} className={cn('rounded-full ring-2 ring-offset-2 transition-shadow duration-300', on ? 'ring-neutral-900' : 'ring-transparent')}>
                                        <img src={`/avatars/${a}.webp`} alt="" className="size-8 rounded-full bg-neutral-100" />
                                    </span>
                                )
                            })}
                        </span>
                    </span>
                    <Field label="Personality & instructions" hint="How it talks, what it handles, and what it should hand back to you.">
                        <Input value={e.prompt} focused={e.focus === 'prompt'} multiline />
                    </Field>
                    <Field label="Phone number" hint="The iMessage number people text to reach this agent.">
                        <span className="relative block">
                            {e.numberMenu && <MenuPicture up items={numberOptions(s.number).map((n) => ({ id: n, label: n }))} selected={NONE} hovered={e.numberMenu} />}
                            <span className={cn('flex h-8 items-center justify-between rounded-md border px-2.5 text-[13px] transition-shadow', e.focus === 'number' ? 'border-neutral-400 ring-3 ring-neutral-300/50' : 'border-neutral-200')}>
                                <span className={cn(!e.number && 'text-neutral-400')}>{e.number ? s.number : 'None'}</span>
                                <ChevronDown className="size-4 text-neutral-400" />
                            </span>
                        </span>
                    </Field>
                </div>
                <div className={cn('space-y-4', compact && 'hidden')}>
                    <section className="rounded-lg border border-neutral-200 p-4 text-[13px]">
                        <h3 className="mb-2 flex items-center gap-2 font-medium"><MessageCircle className="size-4 text-neutral-500" />iMessage</h3>
                        <AnimatePresence mode="wait" initial={false}>
                            {e.number ? (
                                <motion.p key="n" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-medium text-neutral-800">
                                    {s.number}
                                </motion.p>
                            ) : (
                                <motion.p key="none" exit={{ opacity: 0 }} className="text-neutral-500">No number yet. People can't text this agent until it has one.</motion.p>
                            )}
                        </AnimatePresence>
                        <Btn className="mt-3">Manage numbers</Btn>
                    </section>
                    <section className="rounded-lg border border-neutral-200 p-4 text-[13px]">
                        <h3 className="mb-2 flex items-center gap-2 font-medium"><BookOpen className="size-4 text-neutral-500" />Knowledge</h3>
                        <p className="text-neutral-500">No documents. Add some so it knows your rules.</p>
                        <Btn className="mt-3">Manage knowledge</Btn>
                    </section>
                </div>
            </div>
        </div>
    )
}

// Each demo agent's model mix: the slots it runs on something other than the workspace default
const MIXES: Record<string, Partial<Record<SlotId, string>>> = {
    Waffles: { brain: 'grok-4', voice: 'cartesia-sonic' },
    Pebble: { brain: 'gemini-2.5-flash', computer: 'claude-opus-5.5-computer-use', listening: 'whisper' },
    Mochi: { brain: 'claude-sonnet-5.5', calls: 'gemini-live' },
    Honey: { brain: 'claude-haiku-4.5', voice: 'openai-tts' },
}

// Models page: the nine part cards pick up this agent's mix one at a time
function ModelsScreen({ t, agent, compact }: { t: number; agent: string; compact: boolean }) {
    const mix = resolveModels(undefined, MIXES[agent])
    const step = SLOTS.length + 1
    return (
        <div className="flex h-full flex-col">
            <Toolbar title="Models">
                <span className="text-[12px] font-normal text-neutral-500">{agent}’s mix · the best model for each job</span>
            </Toolbar>
            <div className={cn('grid gap-2.5 p-4', compact ? 'grid-cols-2' : 'grid-cols-3')}>
                {SLOTS.map((slot, i) => {
                    const Icon = SLOT_ICONS[slot.id]
                    const at = ((i + 1) / step) * 0.85
                    const assigned = t >= at
                    const assigning = t >= at - 0.85 / step && !assigned
                    const r = mix[slot.id]
                    return (
                        <span
                            key={slot.id}
                            className={cn('flex flex-col gap-2 rounded-lg p-3 ring-1 transition-shadow duration-300', assigning ? 'ring-2 ring-neutral-900/25' : 'ring-black/6', r.overridden && assigned && 'bg-primary/4')}>
                            <span className="flex items-center gap-2">
                                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-neutral-100 text-neutral-700">
                                    <Icon className="size-3.5" />
                                </span>
                                <span className="text-[13px] font-semibold">{slot.label}</span>
                                {slot.isNew && <span className="rounded-full bg-neutral-100 px-1.5 text-[9px] font-medium text-neutral-600">New</span>}
                            </span>
                            {!compact && <span className="line-clamp-1 text-[11px] text-neutral-500">{slot.blurb}</span>}
                            <span className="flex h-7 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 text-[12px]">
                                <AnimatePresence mode="wait" initial={false}>
                                    {assigned ? (
                                        <motion.span key="on" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 items-center gap-2">
                                            <ProviderMark provider={r.option.provider} className="size-3.5" />
                                            <span className="truncate">{r.option.label}</span>
                                        </motion.span>
                                    ) : (
                                        <motion.span key="off" exit={{ opacity: 0 }} className="h-2 w-20 rounded bg-neutral-100" />
                                    )}
                                </AnimatePresence>
                                <ChevronDown className="ml-auto size-3.5 shrink-0 text-neutral-400" />
                            </span>
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

// Analytics page: what this agent cost this month, split by part and by model (sample numbers that follow its mix)
const COSTS: { slot: SlotId; split: [string, number][] }[] = [
    { slot: 'brain', split: [['claude-sonnet-5.5', 3.1], ['claude-haiku-4.5', 0.32]] },
    { slot: 'computer', split: [['claude-sonnet-5.5-computer-use', 5.18]] },
    { slot: 'calls', split: [['gemini-live', 1.94]] },
    { slot: 'voice', split: [['elevenlabs', 0.86]] },
    { slot: 'decisions', split: [['jev', 0.21]] },
    { slot: 'router', split: [['jev-router', 0.09]] },
]
const costOf = (slot: SlotId) => COSTS.find((c) => c.slot === slot)!.split.reduce((sum, [, d]) => sum + d, 0)
const MONTH = COSTS.reduce((sum, c) => sum + costOf(c.slot), 0)
const TILES: [SlotId, string][] = [
    ['brain', 'Replies'],
    ['computer', 'Browser actions'],
    ['calls', 'Calls'],
    ['voice', 'Voice notes'],
]
const usd = (n: number) => `$${n.toFixed(2)}`

function AnalyticsScreen({ t, agent, compact }: { t: number; agent: string; compact: boolean }) {
    // Numbers count up and bars fill over the first half of the beat, easing out
    const fill = 1 - (1 - Math.min(1, t / 0.5)) ** 3
    const meters: [string, number, number, string][] = [
        ['This month', MONTH, 25, `${usd(MONTH * fill)} of your $25 cap`],
        ['Today', 0.62, 2, `${usd(0.62 * fill)} of your $2 daily cap`],
    ]
    return (
        <div className="flex h-full flex-col">
            <Toolbar title="Analytics">
                <span className="text-[12px] font-normal text-neutral-500">What {agent} cost this month, part by part</span>
            </Toolbar>
            <div className="space-y-3 p-4">
                <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-4')}>
                    {TILES.map(([slot, label]) => {
                        const Icon = SLOT_ICONS[slot]
                        return (
                            <span key={slot} className="flex flex-col gap-0.5 rounded-lg p-3 ring-1 ring-black/6">
                                <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                                    <Icon className="size-3" />
                                    {label}
                                </span>
                                <span className="text-[20px] font-semibold tracking-tight tabular-nums">{usd(costOf(slot) * fill)}</span>
                            </span>
                        )
                    })}
                </div>

                <span className="grid grid-cols-2 gap-3 rounded-lg py-1 ring-1 ring-black/6">
                    {meters.map(([label, spent, cap, note]) => (
                        <UsageGauge key={label} label={label} used={spent * fill} limit={cap} note={note} animate={false} />
                    ))}
                </span>

                <span className="block rounded-lg ring-1 ring-black/6">
                    <span className="flex justify-between border-b border-neutral-200/70 px-3 py-2 text-[12px]">
                        <span className="font-medium">Cost by model</span>
                        <span className="text-[11px] text-neutral-500">This month</span>
                    </span>
                    <span className="block divide-y divide-neutral-100 px-3">
                        {COSTS.slice(0, compact ? 4 : COSTS.length).map(({ slot, split }) => {
                            const Icon = SLOT_ICONS[slot]
                            const s = slotOf(slot)!
                            const total = costOf(slot)
                            return (
                                <span key={slot} className={cn('grid items-center gap-3 py-2', compact ? 'grid-cols-[132px_1fr]' : 'grid-cols-[150px_1fr]')}>
                                    <span className="flex items-center gap-2">
                                        <Icon className="size-3.5 text-neutral-500" />
                                        <span className="text-[12px] font-medium whitespace-nowrap">{s.label}</span>
                                        <span className="font-mono text-[10px] text-neutral-500 tabular-nums">{usd(total * fill)}</span>
                                    </span>
                                    <span className="flex gap-3">
                                        {split.map(([id, dollars]) => {
                                            const o = s.options.find((x) => x.id === id)!
                                            return (
                                                <span key={id} className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
                                                    <ProviderMark provider={o.provider} className="size-3" />
                                                    <span className="truncate">{o.label}</span>
                                                    <Progress value={Math.round((dollars / total) * 100 * fill)} className="min-w-6 flex-1" />
                                                    <span className="font-mono text-[10px] text-neutral-500 tabular-nums">{usd(dollars * fill)}</span>
                                                </span>
                                            )
                                        })}
                                    </span>
                                </span>
                            )
                        })}
                    </span>
                </span>
            </div>
        </div>
    )
}

// The mock is laid out at a fixed size and scaled to fit, so it reads as the real app at any width.
// Narrow screens get the CRM's own small-screen layout (no sidebars) so the text stays legible.
const design = (compact: boolean) => (compact ? { w: 560, h: 860 } : { w: 1080, h: 790 })
const COMPACT_BELOW = 640

function CrmMock({ flow, agent, role, elapsed, compact }: { flow: FlowId; agent: string; role: string; elapsed: number; compact: boolean }) {
    const { starts } = timeline(flow, agent, role)
    // 0 before a beat starts, 1 once it has finished; beats outside this flow are done or not by DONE
    const p = (key: string) => {
        if (!starts[key]) return DONE[flow].has(key) ? 1 : 0
        const [at, dur] = starts[key]
        return Math.min(1, Math.max(0, (elapsed - at) / dur))
    }
    const active = (key: string) => p(key) > 0 && p(key) < 1
    const typed = (text: string, key: string) => text.slice(0, Math.ceil(p(key) * text.length))
    const s = settings[agent]

    const inEditor = p('editor') > 0
    const inModels = p('models') > 0
    const inAnalytics = p('analytics') > 0
    const dialogOpen = p('pressCreate') >= 1 && !inEditor

    return (
        <div className="relative flex size-full overflow-hidden bg-[#f5f5f7] text-neutral-900">
            {!compact && <Sidebar active={inAnalytics ? 'Analytics' : inModels ? 'Models' : 'Agents'} pressed={active('toModels') && p('toModels') > 0.5 ? 'Models' : active('toAnalytics') && p('toAnalytics') > 0.5 ? 'Analytics' : undefined} />}
            <div className={cn('relative min-w-0 flex-1 overflow-hidden bg-white', !compact && 'rounded-l-xl border-l border-neutral-200/70')}>
                <AnimatePresence initial={false} mode="popLayout">
                    {inAnalytics ? (
                        <motion.div key="analytics" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="absolute inset-0">
                            <AnalyticsScreen t={p('analytics')} agent={agent} compact={compact} />
                        </motion.div>
                    ) : inModels ? (
                        <motion.div key="models" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="absolute inset-0">
                            {/* Every pick was made in the editor, so the page opens on the finished mix */}
                            <ModelsScreen t={1} agent={agent} compact={compact} />
                        </motion.div>
                    ) : inEditor ? (
                        <motion.div key="editor" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="absolute inset-0">
                            <EditorScreen
                                compact={compact}
                                e={{
                                    agent,
                                    role,
                                    type: typed(s.type, 'type'),
                                    avatar: p('avatar') >= 0.5,
                                    prompt: typed(s.prompt, 'prompt'),
                                    status: p('status') >= 0.6 ? 'live' : 'draft',
                                    // The number picker opens, the pointer moves down to the agent's number, then it closes on it
                                    number: p('number') >= MENU_CLOSE,
                                    numberMenu: p('number') >= MENU_OPEN && p('number') < MENU_CLOSE ? (p('number') >= MENU_HOVER ? s.number : NONE) : undefined,
                                    pressSave: active('save') && p('save') < 0.4,
                                    // The models flow opens on an already-saved agent, so it reads "Saved" until the first change
                                    saved: p('save') >= 0.4 || (flow === 'models' && p('model') === 0),
                                    // Each control's menu opens, the pointer moves to the agent's pick, then it closes on the new value.
                                    // The voice then plays a short preview.
                                    model: p('model') >= MENU_CLOSE ? s.model : '',
                                    voice: p('voice') >= VOICE_MENU_CLOSE ? s.voice : '',
                                    language: p('language') >= MENU_CLOSE ? s.language : '',
                                    playing: p('voice') >= VOICE_MENU_CLOSE + 0.05 && p('voice') < 1,
                                    menu: menuAt(p, s),
                                    filled: Math.floor(p('slots') * OTHER_SLOTS.length),
                                    filling: active('slots'),
                                    configFocus: active('model') ? 'model' : active('voice') ? 'voice' : active('language') ? 'language' : undefined,
                                    focus: active('type') ? 'type' : active('prompt') ? 'prompt' : active('status') ? 'status' : active('number') ? 'number' : undefined,
                                }}
                            />
                        </motion.div>
                    ) : (
                        <motion.div key="list" exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                            <ListScreen pressed={active('pressCreate')} compact={compact} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {/* Like the real dialog, the backdrop dims the whole app, sidebar included */}
            <AnimatePresence>
                {dialogOpen && (
                    <CreateDialog
                        name={typed(agent, 'name')}
                        role={typed(role, 'role')}
                        focus={p('role') > 0 ? (p('role') < 1 ? 'role' : undefined) : 'name'}
                        pressed={active('pressSubmit')}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

export default function CreateAgentDemo() {
    // Which tab is playing and how far into its setup, advanced together so the tab can roll over mid-tick
    const [{ index, elapsed }, setClock] = useState({ index: 0, elapsed: 0 })
    const [width, setWidth] = useState(0)
    const frame = useRef<HTMLDivElement>(null)
    const inView = useInView(frame, { amount: 0.4 })
    const reduced = useReducedMotion()
    const current = FLOWS[index]
    const { total } = timeline(current.id, AGENT.agent, AGENT.role)
    const compact = width > 0 && width < COMPACT_BELOW
    const size = design(compact)
    const scale = width / size.w

    useLayoutEffect(() => {
        const el = frame.current
        if (!el) return
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Play the current flow while on screen, then move on to the next tab
    useEffect(() => {
        if (reduced || !inView) return
        let last = performance.now()
        const id = window.setInterval(() => {
            const now = performance.now()
            const dt = now - last
            last = now
            setClock(({ index, elapsed }) => {
                return elapsed + dt < timeline(FLOWS[index].id, AGENT.agent, AGENT.role).total ? { index, elapsed: elapsed + dt } : { index: (index + 1) % FLOWS.length, elapsed: 0 }
            })
        }, 40)
        return () => window.clearInterval(id)
    }, [inView, reduced])

    const select = (i: number) => setClock({ index: i, elapsed: 0 })

    // Sits in the hero under the call to action, so it's the first thing people see
    return (
        // Plays in on load, not on scroll: in the hero most of the window starts below the fold
        <Stagger
            onMount
            gap={0.12}>
            <StaggerItem>
                {/* Desktop "wallpaper" tinted per flow, with the CRM window floating on it */}
                <div
                    id="create-agent-panel"
                    aria-label={`The dashboard: ${current.title}`}
                    className="relative overflow-hidden rounded-2xl p-3 shadow-[0_32px_44px_-26px_rgba(0,0,0,0.4)] ring-1 ring-black/8 transition-[background] duration-700 sm:p-8 md:p-14 dark:ring-white/10"
                    style={{
                        background: `radial-gradient(120% 90% at 20% 0%, hsl(${current.hue} 80% 78%), transparent 60%), radial-gradient(100% 80% at 100% 100%, hsl(${(current.hue + 40) % 360} 70% 62%), transparent 65%), hsl(${current.hue} 35% 22%)`,
                    }}>
                    {/* The steps sit on the window's backdrop, so they read as captions for the demo, not page navigation */}
                    <div
                        role="tablist"
                        aria-label="How it works"
                        className="mb-3 grid grid-cols-3 gap-1.5 sm:mb-5 sm:gap-3">
                        {FLOWS.map((f, i) => {
                            const selected = i === index
                            return (
                                <button
                                    key={f.id}
                                    role="tab"
                                    aria-selected={selected}
                                    aria-controls="create-agent-window"
                                    onClick={() => select(i)}
                                    className={cn(
                                        'relative flex cursor-pointer flex-col overflow-hidden rounded-xl px-2.5 py-2 text-left backdrop-blur-sm transition-colors sm:px-4 sm:py-3',
                                        selected ? 'bg-white/90 text-neutral-900 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]' : 'bg-white/12 text-white/85 hover:bg-white/20',
                                    )}>
                                    <span className="flex items-center gap-2">
                                        <span
                                            className={cn(
                                                'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                                                selected ? 'bg-neutral-900 text-white' : 'bg-white/20 text-white',
                                            )}>
                                            {i + 1}
                                        </span>
                                        <span className="truncate text-[12px] font-semibold sm:text-[14px]">
                                            <span className="sm:hidden">{f.short}</span>
                                            <span className="max-sm:hidden">{f.title}</span>
                                        </span>
                                    </span>
                                    <span className={cn('mt-1 hidden truncate text-[12px] md:block', selected ? 'text-neutral-500' : 'text-white/60')}>{f.detail}</span>
                                    {/* Fills as the step plays, like a story progress bar */}
                                    <span className={cn('absolute inset-x-0 bottom-0 h-0.5', selected ? 'bg-neutral-900/8' : 'bg-transparent')}>
                                        {selected && !reduced && (
                                            <span
                                                className="block h-full bg-neutral-900/70"
                                                style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }}
                                            />
                                        )}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <div
                        id="create-agent-window"
                        role="tabpanel"
                        className="overflow-hidden rounded-xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] ring-1 ring-black/10">
                        <div className="flex items-center gap-3 border-b border-black/6 bg-neutral-50 px-4 py-2.5">
                            <div className="flex gap-1.5">
                                <span className="size-2.5 rounded-full bg-[#FF5F57]" />
                                <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
                                <span className="size-2.5 rounded-full bg-[#28C840]" />
                            </div>
                            <span className="mx-auto truncate rounded-md bg-white px-10 py-0.5 text-[12px] text-neutral-500 ring-1 ring-black/6">opendots.ai/dashboard</span>
                            <span className="w-[42px]" />
                        </div>

                        <div
                            ref={frame}
                            aria-hidden
                            className="relative overflow-hidden"
                            style={{ height: size.h * scale }}>
                            <div
                                className="absolute top-0 left-0 origin-top-left"
                                style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}>
                                <CrmMock
                                    key={current.id}
                                    flow={current.id}
                                    agent={AGENT.agent}
                                    role={AGENT.role}
                                    elapsed={reduced ? total : elapsed}
                                    compact={compact}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </StaggerItem>
        </Stagger>
    )
}
