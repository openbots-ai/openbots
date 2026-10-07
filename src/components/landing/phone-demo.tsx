import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
    AlarmClock,
    ChevronLeft,
    ChevronRight,
    ListFilter,
    MessageCircle,
    Mic,
    MicOff,
    Phone,
    Plus,
    Search,
    ArrowUp,
    SquarePen,
    UserRoundPlus,
    Video,
} from 'lucide-react'
import { animate, AnimatePresence, motion, useInView, useMotionValue, useMotionValueEvent, useTransform, type MotionValue, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { callBackground } from '@/lib/avatars'
import { AgentAvatar } from '@/components/landing/agent-avatar'

type Message = { from: 'me' | 'them'; text: string }
type Contact = { name: string; role: string; hue: number; preview: string; time: string; messages?: Message[] }

const ME = 'me'

const MOCHI = 0

const contacts: Contact[] = [
    {
        name: 'Mochi',
        role: 'Chief of Staff',
        hue: 278,
        preview: 'morning! your weekly brief is ready ☕️',
        time: '8:42 AM',
        messages: [
            { from: 'them', text: 'morning! your weekly brief is ready ☕️' },
            { from: 'them', text: 'revenue +8% WoW, churn flat, 2 alerts need you' },
            { from: ME, text: 'what are the alerts?' },
            { from: 'them', text: 'easier to walk you through it live, calling you now 📞' },
        ],
    },
    { name: 'Biscuit', role: 'Growth Marketer', hue: 25, preview: 'variant B is winning checkout by 12% 👀', time: '8:05 AM' },
    { name: 'Waffles', role: 'Sales Outbound', hue: 200, preview: 'Booked 3 demos for Thursday 📅', time: 'Yesterday' },
    { name: 'Honey', role: 'Customer Support', hue: 160, preview: '12 tickets resolved, 2 escalated.', time: 'Yesterday' },
    { name: 'Penny', role: 'Expense Manager', hue: 340, preview: 'Receipts coded, one needs a look.', time: 'Tuesday' },
    { name: 'Pip', role: 'Talent Scout', hue: 45, preview: 'Shortlist of 6 candidates is ready.', time: 'Monday' },
    { name: 'Sprout', role: 'Data Analyst', hue: 230, preview: 'Q3 cohort report is in your inbox.', time: 'Sunday' },
]

type CallPhase = 'incoming' | 'answering'
type Step =
    | { view: 'list'; read: number[]; press?: number }
    | { view: 'chat'; chat: number; shown: number; arrives?: boolean; pressBack?: boolean }
    | { view: 'call'; chat: number; phase: CallPhase }

// Each step after the first brings in one new message; `arrives` marks that so only real arrivals animate
const chatSteps = (chat: number): Step[] => [...contacts[chat].messages!, null].map((_, shown) => ({ view: 'chat', chat, shown, arrives: shown > 0 }))

// One entry per beat: open Mochi, then Mochi calls in and the swipe to answer ends it.
const steps: Step[] = [
    { view: 'list', read: [] },
    { view: 'list', read: [], press: MOCHI },
    ...chatSteps(MOCHI),
    { view: 'call', chat: MOCHI, phase: 'incoming' },
    { view: 'call', chat: MOCHI, phase: 'answering' },
]

// The incoming call rings briefly, then the answer slider swipes across
const RING = steps.findIndex((s) => s.view === 'call')
// What is on screen for a list of items whose last one is still arriving until the beat settles
const arrival = (items: Message[], shown: number, settled: boolean) => {
    const arriving = !settled && shown > 0 ? items[shown - 1] : undefined
    return { count: arriving ? shown - 1 : shown, pending: arriving }
}

const ease = [0.22, 1, 0.36, 1] as const

// Critically damped springs: they settle quickly with no wobble, which is how iOS moves
const bubbleSpring = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const
const layoutSpring = { type: 'spring', stiffness: 420, damping: 42 } as const
const fade = { duration: 0.2, ease: 'easeOut' } as const

const Avatar = ({ contact, className }: { contact: Contact; className?: string }) => (
    <AgentAvatar
        name={contact.name}
        className={className}
    />
)

// iOS-style status icons: cellular bars, solid Wi-Fi fan, filled battery
const Signal = () => (
    <svg viewBox="0 0 18 12" className="h-[11px] w-[17px]" fill="currentColor" aria-hidden>
        <rect x="0" y="8" width="3" height="4" rx="0.8" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
        <rect x="10" y="3" width="3" height="9" rx="0.8" />
        <rect x="15" y="0" width="3" height="12" rx="0.8" />
    </svg>
)

const WifiFan = () => (
    <svg viewBox="0 0 16 12" className="h-[11px] w-[15px]" fill="currentColor" aria-hidden>
        <path d="M8 1.2c2.6 0 5 1 6.8 2.7.2.2.2.5 0 .7l-1 1c-.2.2-.5.2-.7 0A7.3 7.3 0 0 0 8 3.6c-1.9 0-3.7.7-5.1 2-.2.2-.5.2-.7 0l-1-1c-.2-.2-.2-.5 0-.7A9.8 9.8 0 0 1 8 1.2Z" />
        <path d="M8 5c1.6 0 3 .6 4.1 1.6.2.2.2.5 0 .7l-1 1c-.2.2-.5.2-.7 0A3.5 3.5 0 0 0 8 7.4c-.9 0-1.7.3-2.4.9-.2.2-.5.2-.7 0l-1-1c-.2-.2-.2-.5 0-.7A6 6 0 0 1 8 5Z" />
        <path d="M8 8.8c.6 0 1.1.2 1.5.6.2.2.2.5 0 .7L8.4 11.2c-.2.2-.5.2-.7 0L6.5 10.1c-.2-.2-.2-.5 0-.7.4-.4.9-.6 1.5-.6Z" />
    </svg>
)

const Battery = () => (
    <svg viewBox="0 0 27 13" className="h-[12px] w-[25px]" aria-hidden>
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
        <path d="M25 4.5v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" fillOpacity="0.45" />
    </svg>
)

const StatusBar = ({ dark }: { dark?: boolean }) => (
    <div className={cn('flex items-center justify-between px-7 pb-1 pt-3.5 text-[13px] font-semibold', dark && 'text-white')}>
        <span className="w-12">9:41</span>
        <span className="flex items-center gap-[5px]">
            <Signal />
            <WifiFan />
            <Battery />
        </span>
    </div>
)

const HomeIndicator = ({ dark }: { dark?: boolean }) => (
    <span className={cn('absolute bottom-2 left-1/2 z-10 h-1 w-28 -translate-x-1/2 rounded-full', dark ? 'bg-white' : 'bg-black')} />
)

const glass = 'bg-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur'

function ListScreen({ read, press }: { read: number[]; press?: number }) {
    return (
        <div className="relative flex h-full flex-col bg-white text-black">
            <StatusBar />
            <div className="flex items-center justify-between px-4 pb-2 pt-1">
                <span className={cn('rounded-full px-3 py-1.5 text-[13px] font-medium', glass)}>Edit</span>
                <span className="text-[13px] font-semibold">Messages</span>
                <span className={cn('flex size-8 items-center justify-center rounded-full', glass)}>
                    <ListFilter className="size-4" />
                </span>
            </div>

            <div className="flex-1 overflow-hidden">
                {contacts.map((contact, i) => {
                    const hasChat = !!contact.messages
                    const unread = hasChat && !read.includes(i)
                    const preview = read.includes(i) ? contact.messages!.at(-1)!.text : contact.preview
                    // iOS hides the separators that touch a highlighted row, and the one after the last row
                    const hideSeparator = i === contacts.length - 1 || press === i || press === i + 1
                    return (
                        <div
                            key={contact.name}
                            className={cn('relative flex items-center gap-2.5 pl-5 transition-colors duration-150', press === i && 'bg-[#D1D1D6]')}>
                            {unread && <span className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[#0A84FF]" />}
                            <Avatar
                                contact={contact}
                                className="size-11 text-base"
                            />
                            {/* The separator lives on the row's bottom edge, inset to the text and running to the screen edge */}
                            <div
                                className={cn(
                                    'min-w-0 flex-1 border-b-[0.5px] py-3.5 pr-3 transition-colors duration-150',
                                    hideSeparator ? 'border-transparent' : 'border-[#E5E5EA]'
                                )}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-[13px] font-semibold">
                                        {contact.name} <span className="font-normal text-neutral-400">· {contact.role}</span>
                                    </span>
                                    <span className="flex shrink-0 items-center text-[10px] text-neutral-400">
                                        {read.includes(i) ? 'Now' : contact.time}
                                        <ChevronRight className="size-3" />
                                    </span>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">{preview}</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Floating search + compose */}
            <div className="absolute inset-x-3 bottom-6 flex items-center gap-2">
                <span className={cn('flex h-9 flex-1 items-center gap-1.5 rounded-full px-3 text-[13px] text-neutral-500', glass)}>
                    <Search className="size-3.5" />
                    Search
                    <Mic className="ml-auto size-3.5" />
                </span>
                <span className={cn('flex size-9 items-center justify-center rounded-full', glass)}>
                    <SquarePen className="size-4" />
                </span>
            </div>
            <HomeIndicator />
        </div>
    )
}

const TypingDots = () => (
    <span className="imsg imsg-them imsg-tail relative flex gap-1 rounded-[18px] bg-[#E9E9EB] px-3 py-2.5">
        {[0, 0.2, 0.4].map((delay) => (
            <motion.span
                key={delay}
                className="size-1.5 rounded-full bg-neutral-500"
                animate={{ opacity: [0.3, 0.85, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay }}
            />
        ))}
    </span>
)

function ChatScreen({ contact, shown, settled, pressBack, badge }: { contact: Contact; shown: number; settled: boolean; pressBack?: boolean; badge: number }) {
    const messages = contact.messages!
    const { count, pending } = arrival(messages, shown, settled)
    const visible = messages.slice(0, count)
    const typing = pending?.from === 'them'

    return (
        <div className="relative flex h-full flex-col bg-white text-[13px] leading-snug text-black">
            {/* Header floats over the conversation with a soft white fade */}
            <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-white from-60% to-white/0 pb-3">
                <StatusBar />
                <div className="relative flex flex-col items-center px-3 pt-1">
                    <span
                        className={cn(
                            'absolute left-3 top-2.5 flex h-9 items-center gap-1 rounded-full pl-2 pr-2.5 transition-all duration-200',
                            glass,
                            pressBack && 'scale-90 bg-neutral-200'
                        )}>
                        <ChevronLeft className="size-4.5" />
                        {badge > 0 && <span className="flex size-4.5 items-center justify-center rounded-full bg-black text-[10px] font-semibold text-white">{badge}</span>}
                    </span>
                    <span className={cn('absolute right-3 top-2.5 flex size-9 items-center justify-center rounded-full', glass)}>
                        <Video
                            className="size-4 text-neutral-700"
                            fill="currentColor"
                            strokeWidth={0}
                        />
                    </span>
                    <Avatar
                        contact={contact}
                        className="size-14 text-xl shadow-md"
                    />
                    <span className={cn('-mt-2 flex items-center gap-0.5 rounded-full px-3 py-1 text-[13px] font-semibold', glass)}>
                        {contact.name}
                        <ChevronRight className="size-3 text-neutral-400" />
                    </span>
                    <span className="mt-0.5 text-[10px] text-neutral-500">{contact.role}</span>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden px-4 pt-[164px]">
                {/* popLayout lets everything else glide into place while a bubble enters or leaves */}
                <AnimatePresence
                    initial={false}
                    mode="popLayout">
                    {visible.map((m, i) => {
                        const mine = m.from === ME
                        const firstOfRun = visible[i - 1]?.from !== m.from
                        const lastOfRun = visible[i + 1]?.from !== m.from && !(typing && i === visible.length - 1 && !mine)
                        return (
                            <motion.div
                                key={i}
                                layout="position"
                                // Incoming bubbles grow from their tail; yours rise up from the compose bar
                                initial={mine ? { opacity: 0, y: 22, scale: 0.97 } : { opacity: 0, scale: 0.86 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                transition={{ default: bubbleSpring, opacity: fade, layout: layoutSpring }}
                                style={{ originX: mine ? 1 : 0, originY: 1 }}
                                className={cn('flex flex-col', mine ? 'items-end' : 'items-start', firstOfRun && i > 0 && 'mt-2')}>
                                <p
                                    className={cn(
                                        'imsg relative max-w-[78%] rounded-[18px] px-3 py-1.5',
                                        mine ? 'imsg-me bg-[#0A84FF] text-white' : 'imsg-them bg-[#E9E9EB]',
                                        lastOfRun && 'imsg-tail'
                                    )}>
                                    {m.text}
                                </p>
                                {mine && i === visible.length - 1 && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ ...fade, delay: 0.35 }}
                                        className="mr-1 mt-0.5 text-[10px] font-medium text-neutral-400">
                                        Delivered
                                    </motion.span>
                                )}
                            </motion.div>
                        )
                    })}
                    {typing && (
                        <motion.div
                            key="typing"
                            layout="position"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.12 } }}
                            transition={{ default: bubbleSpring, opacity: fade, layout: layoutSpring }}
                            style={{ originX: 0, originY: 1 }}
                            className="mt-2 flex">
                            <TypingDots />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 px-3 pb-7 pt-2">
                <span className={cn('flex size-9 items-center justify-center rounded-full', glass)}>
                    <Plus className="size-4.5 text-neutral-600" />
                </span>
                <span className="flex h-9 flex-1 items-center justify-between rounded-full bg-neutral-100 pl-4 pr-1 text-neutral-400">
                    iMessage
                    <span className="flex size-7 items-center justify-center rounded-full bg-neutral-200">
                        <ArrowUp className="size-4 text-neutral-500" />
                    </span>
                </span>
            </div>
            <HomeIndicator />
        </div>
    )
}


// Contact block in the top-left, the way iOS 17+ lays out calls
const CallHeader = ({ contact, subtitle }: { contact: Contact; subtitle: ReactNode }) => (
    <div className="flex items-center gap-3 px-6 pt-9">
        <Avatar
            contact={contact}
            className="size-[46px] text-lg"
        />
        <div className="min-w-0">
            <p className="text-[13px] leading-tight tabular-nums text-white/55">{subtitle}</p>
            <p className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white">{contact.name}</p>
        </div>
    </div>
)

const InfoButton = () => (
    <span className="absolute right-6 top-[3.4rem] flex size-[22px] items-center justify-center rounded-full ring-[1.5px] ring-white/85">
        <span className="text-[13px] font-semibold leading-none text-white/90">i</span>
    </span>
)

function IncomingCall({ contact, slide }: { contact: Contact; slide: MotionValue<number> }) {
    // The thumb's track grows with the scroll; the hint nudge and label give way as soon as it starts moving
    const width = useTransform(slide, (p) => `calc(52px + (100% - 52px) * ${p})`)
    const labelOpacity = useTransform(slide, [0, 0.4], [1, 0])
    const [idle, setIdle] = useState(slide.get() === 0)
    useMotionValueEvent(slide, 'change', (p) => setIdle(p === 0))

    return (
        <div
            className="relative flex h-full flex-col text-white"
            style={{ background: callBackground(contact.hue) }}>
            <StatusBar dark />
            <InfoButton />
            <CallHeader
                contact={contact}
                subtitle="mobile"
            />

            <div className="mt-auto px-6 pb-14">
                <div className="mb-7 flex justify-between px-5 text-[12px] text-white/85">
                    <span className="flex flex-col items-center gap-1.5">
                        <AlarmClock className="size-[22px]" />
                        Remind Me
                    </span>
                    <span className="flex flex-col items-center gap-1.5">
                        <MessageCircle className="size-[22px]" />
                        Message
                    </span>
                </div>

                {/* Slide to answer */}
                <div className="relative flex h-[62px] items-center rounded-full bg-white/15 p-[5px] backdrop-blur-xl">
                    <motion.span
                        style={{ opacity: labelOpacity }}
                        className="shimmer-text absolute inset-0 flex items-center justify-center pl-12 text-[17px]">
                        slide to answer
                    </motion.span>
                    <motion.div
                        style={{ width }}
                        className="relative flex h-[52px] justify-end">
                        <motion.span
                            animate={idle ? { x: [0, 10, 0] } : { x: 0 }}
                            transition={idle ? { duration: 1.2, repeat: Infinity, repeatDelay: 0.8 } : { duration: 0.15 }}
                            className="flex size-[52px] items-center justify-center rounded-full bg-white">
                            <Phone
                                className="size-6 text-[#34C759]"
                                fill="currentColor"
                                strokeWidth={0}
                            />
                        </motion.span>
                    </motion.div>
                </div>
            </div>
            <HomeIndicator dark />
        </div>
    )
}

// Glyphs drawn to match iOS rather than generic icon-set shapes
const SpeakerGlyph = () => (
    <svg
        viewBox="0 0 24 24"
        className="size-[26px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round">
        <path
            d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"
            fill="currentColor"
            stroke="none"
        />
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.6a7.6 7.6 0 0 1 0 10.8" />
    </svg>
)

const KeypadGlyph = () => (
    <svg
        viewBox="0 0 24 24"
        className="size-[26px]"
        fill="currentColor">
        {[5, 12, 19].flatMap((y) =>
            [5, 12, 19].map((x) => (
                <circle
                    key={`${x}-${y}`}
                    cx={x}
                    cy={y}
                    r="2.3"
                />
            ))
        )}
    </svg>
)

const callControls = [
    { label: 'Audio', icon: <SpeakerGlyph /> },
    { label: 'FaceTime', icon: <Video className="size-[26px]" fill="currentColor" strokeWidth={0} /> },
    { label: 'Mute', icon: <MicOff className="size-6" strokeWidth={2.2} /> },
    { label: 'Add', icon: <UserRoundPlus className="size-6" strokeWidth={2.2} /> },
    {
        label: 'End',
        end: true,
        icon: (
            <Phone
                className="size-[26px] rotate-[135deg]"
                fill="currentColor"
                strokeWidth={0}
            />
        ),
    },
    { label: 'Keypad', icon: <KeypadGlyph /> },
]

function InCall({ contact }: { contact: Contact }) {
    const [seconds, setSeconds] = useState(0)
    const timer = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

    useEffect(() => {
        const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
        return () => clearInterval(id)
    }, [])

    return (
        <div
            className="relative flex h-full flex-col text-white"
            style={{ background: callBackground(contact.hue) }}>
            <StatusBar dark />
            <InfoButton />
            <CallHeader
                contact={contact}
                subtitle={timer}
            />

            <div className="mt-auto px-6 pb-12">
                <div className="grid grid-cols-3 gap-x-5 gap-y-4">
                    {callControls.map(({ label, icon, end }) => (
                        <span
                            key={label}
                            className="flex flex-col items-center gap-1.5">
                            <span
                                className={cn(
                                    'flex size-[66px] items-center justify-center rounded-full backdrop-blur-xl',
                                    end ? 'bg-[#FF3B30]' : 'bg-white/[0.16]'
                                )}>
                                {icon}
                            </span>
                            <span className="text-[12px] text-white/90">{label}</span>
                        </span>
                    ))}
                </div>
            </div>
            <HomeIndicator dark />
        </div>
    )
}

// The swipe completes, then the screen settles into the in-call view with a running timer
function CallFlow({ contact, phase, slide }: { contact: Contact; phase: CallPhase; slide: MotionValue<number> }) {
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        if (phase !== 'answering') return
        const id = window.setTimeout(() => setConnected(true), 750)
        return () => {
            clearTimeout(id)
            setConnected(false)
        }
    }, [phase])

    return (
        <AnimatePresence
            mode="wait"
            initial={false}>
            <motion.div
                key={connected ? 'in-call' : 'incoming'}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}>
                {connected ? (
                    <InCall contact={contact} />
                ) : (
                    <IncomingCall
                        contact={contact}
                        slide={slide}
                    />
                )}
            </motion.div>
        </AnimatePresence>
    )
}

// iOS-style navigation: chats push in from the right, going back slides them out.
const nav: Variants = {
    enter: (dir: number) => (dir === 0 ? { opacity: 0, scale: 1.04 } : { x: dir > 0 ? '100%' : '-30%', zIndex: dir > 0 ? 2 : 1 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => (dir === 0 ? { opacity: 0 } : { x: dir > 0 ? '-30%' : '100%', zIndex: dir > 0 ? 1 : 2 }),
}

function Screen({ step, settled, slide }: { step: Step; settled: boolean; slide: MotionValue<number> }) {
    let key: string
    let dir: number
    let content: ReactNode

    if (step.view === 'list') {
        key = 'list'
        dir = -1
        content = (
            <ListScreen
                read={step.read}
                press={step.press}
            />
        )
    } else if (step.view === 'chat') {
        key = `chat-${step.chat}`
        dir = 1
        content = (
            <ChatScreen
                contact={contacts[step.chat]}
                shown={step.shown}
                settled={settled || !step.arrives}
                pressBack={step.pressBack}
                badge={0}
            />
        )
    } else {
        key = 'call'
        dir = 0
        content = (
            <CallFlow
                contact={contacts[step.chat]}
                phase={step.phase}
                slide={slide}
            />
        )
    }

    return (
        <AnimatePresence
            initial={false}
            custom={dir}>
            <motion.div
                key={key}
                custom={dir}
                variants={nav}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ x: { type: 'spring', stiffness: 300, damping: 36 }, default: { duration: 0.3, ease } }}
                className="absolute inset-0 shadow-[-8px_0_24px_rgba(0,0,0,0.08)]">
                {content}
            </motion.div>
        </AnimatePresence>
    )
}

const PHONE_HEIGHT = 690
const fitScale = () => Math.min(1.6, (window.innerHeight - 64 - 32) / PHONE_HEIGHT, (window.innerWidth - 32) / 336)

// Autoplay timing (ms): the typing half of a beat, the settled half, and how long the answered call holds before looping
const TYPING_MS = 600
const SETTLED_MS = 1100
const SWIPE_MS = 800
const HOLD_MS = 2500
// A row tap only flashes its highlight before the chat opens, like a real iMessage tap
const TAP_MS = 150
const isTap = (step: Step) => step.view === 'list' && step.press !== undefined
const LAST_BEAT = steps.length * 2 - 1

export function PhoneDemo() {
    const ref = useRef<HTMLDivElement>(null)
    // Beat = step index * 2, plus 1 once the step's typing part is over
    const [beat, setBeat] = useState(1)
    const [fit, setFit] = useState(fitScale)
    const inView = useInView(ref, { amount: 0.4 })

    useEffect(() => {
        const onResize = () => setFit(fitScale())
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    const slide = useMotionValue(0)

    // Step through the beats on a timer while the phone is on screen, then start over
    useEffect(() => {
        if (!inView) return
        const ringing = beat === RING * 2 + 1
        if (ringing) {
            const swipe = animate(slide, 1, { delay: 0.4, duration: SWIPE_MS / 1000, ease: 'easeInOut' })
            const id = setTimeout(() => setBeat(beat + 1), 400 + SWIPE_MS + 150)
            return () => {
                swipe.stop()
                clearTimeout(id)
            }
        }
        const id = setTimeout(
            () => {
                if (beat === LAST_BEAT) slide.set(0)
                setBeat(beat === LAST_BEAT ? 1 : beat + 1)
            },
            beat === LAST_BEAT ? HOLD_MS : isTap(steps[beat >> 1]) ? (beat & 1 ? TAP_MS : 0) : beat & 1 ? SETTLED_MS : TYPING_MS,
        )
        return () => clearTimeout(id)
    }, [inView, beat, slide])

    const step = steps[beat >> 1]
    const onCall = step.view === 'call' && step.phase === 'answering'

    return (
        <div
            ref={ref}
            aria-hidden
            className="relative flex items-center justify-center"
            style={{ height: PHONE_HEIGHT * fit }}>
            <div style={{ transform: `scale(${fit})` }}>
                <motion.div
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.35, duration: 0.9, ease }}
                    className="relative aspect-[1350/2760] w-[336px]">
                    {/* Soft shadow behind the device body */}
                    <div
                        className="absolute shadow-[0_40px_80px_-20px_rgba(0,0,0,0.3),0_15px_30px_-15px_rgba(0,0,0,0.2)]"
                        style={{ left: '1.85%', top: '0.8%', right: '1.8%', bottom: '0.8%', borderRadius: '18.2% / 8.7%' }}
                    />
                    {/* Screen sits in the transparent cut-out of the device image */}
                    <div
                        className="absolute isolate overflow-hidden bg-white"
                        style={{
                            left: '5.333%',
                            top: '2.5%',
                            width: '89.333%',
                            height: '95%',
                            borderRadius: '15.75% / 7.25%',
                            // overflow + radius alone can fail to clip children mid-transform, so clip the shape explicitly
                            clipPath: 'inset(0 round 15.75% / 7.25%)',
                        }}>
                        <Screen
                            step={step}
                            settled={(beat & 1) === 1}
                            slide={slide}
                        />
                    </div>
                    <img
                        src="/device/iphone-frame.png"
                        alt=""
                        draggable={false}
                        className="pointer-events-none absolute inset-0 size-full select-none"
                    />
                    {/* Orange mic-in-use dot in the Dynamic Island while the call is live */}
                    <AnimatePresence>
                        {onCall && (
                            <motion.span
                                className="absolute size-[1.5%] -translate-1/2 rounded-full bg-[#FF9F0A]"
                                style={{ left: '53.3%', top: '6%', aspectRatio: 1 }}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ delay: 0.8, duration: 0.25 }}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    )
}
