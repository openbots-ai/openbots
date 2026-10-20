import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    ListFilter,
    Mic,
    Plus,
    Search,
    ArrowUp,
    SquarePen,
    Video,
} from 'lucide-react'
import { AnimatePresence, motion, useInView, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/landing/agent-avatar'

type Message = { from: 'me' | 'them'; text: string }
type Contact = { name: string; role: string; hue: number; preview: string; time: string; messages?: Message[] }

const ME = 'me'

const TOFU = 0
const RISHI = 1
const MOCHI = 2

const contacts: Contact[] = [
    {
        name: 'Tofu',
        role: 'Weekend Planner',
        hue: 28,
        preview: 'saturday sorted: two plans, under $50 🐯',
        time: '9:41 AM',
        messages: [
            { from: ME, text: 'sort saturday for me + maya. under $50 each, no early starts' },
            { from: 'them', text: 'you’re both free after 1. ramen at 1:30 ($18), then the free gallery nearby. 8-min walk 🐯' },
            { from: ME, text: 'perfect. put it on my calendar' },
            { from: 'them', text: 'added both stops with addresses + walking time. maya’s invite is drafted for you to approve.' },
        ],
    },
    {
        name: 'Rishi',
        role: 'Deal Hunter',
        hue: 270,
        preview: '2 veggie burgers for $14. pickup, no code 🍔',
        time: '9:38 AM',
        messages: [
            { from: 'them', text: 'your friday food find 🍔 2 veggie burgers for $14 at Bun Club, 6 min away.' },
            { from: 'them', text: 'checked their menu: buy 1, get 1 free. pickup only, ends at 8pm. no code needed.' },
            { from: ME, text: 'remind me at 6 and save the link' },
            { from: 'them', text: '6pm reminder set, order link attached. $14 saved if you go 🐶' },
        ],
    },
    {
        name: 'Mochi',
        role: 'Your personal assistant',
        hue: 278,
        preview: '3 overdue invoices. follow-ups ready to review ☕️',
        time: '8:42 AM',
        messages: [
            { from: 'them', text: 'checked invoices against payments: 3 overdue, $2,400 total. one client paid this morning ☕️' },
            { from: 'them', text: 'marked that one paid. drafted follow-ups for the other two, with invoice links. ready for your review.' },
            { from: ME, text: 'send the first one here' },
            { from: 'them', text: 'here’s the draft for Acme, link included. reply YES and i’ll send it, nothing goes out until then ☕️' },
        ],
    },
    { name: 'Lulu', role: 'Trip Planner', hue: 45, preview: 'compared 12 stays. 3 fit your $600 trip budget ☀️', time: 'Yesterday' },
    { name: 'Biscuit', role: 'Meal Planner', hue: 25, preview: '5 dinners, $48 grocery cart. used your pantry first 🥕', time: 'Yesterday' },
    { name: 'Honey', role: 'Home Finder', hue: 160, preview: '2 new pet-friendly listings under $1,800. tour requests drafted 🏡', time: 'Tuesday' },
    { name: 'Pip', role: 'Writing Buddy', hue: 45, preview: 'your landlord reply is drafted, with the repair dates included ✨', time: 'Monday' },
]

type Step =
    | { view: 'list'; read: number[]; press?: number }
    | { view: 'chat'; chat: number; shown: number; arrives?: boolean; pressBack?: boolean }

// Each step after the first brings in one new message; `arrives` marks that so only real arrivals animate
const chatSteps = (chat: number): Step[] => [...contacts[chat].messages!, null].map((_, shown) => ({ view: 'chat', chat, shown, arrives: shown > 0 }))

// Personal life comes first: Tofu plans the weekend, Rishi finds a deal, then Mochi handles work.
const steps: Step[] = [
    { view: 'list', read: [] },
    { view: 'list', read: [], press: TOFU },
    ...chatSteps(TOFU),
    { view: 'chat', chat: TOFU, shown: contacts[TOFU].messages!.length, pressBack: true },
    { view: 'list', read: [TOFU] },
    { view: 'list', read: [TOFU], press: RISHI },
    ...chatSteps(RISHI),
    { view: 'chat', chat: RISHI, shown: contacts[RISHI].messages!.length, pressBack: true },
    { view: 'list', read: [TOFU, RISHI] },
    { view: 'list', read: [TOFU, RISHI], press: MOCHI },
    ...chatSteps(MOCHI),
]

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

const StatusBar = () => (
    <div className="flex items-center justify-between px-7 pb-1 pt-3.5 text-[13px] font-semibold">
        <span className="w-12">9:41</span>
        <span className="flex items-center gap-[5px]">
            <Signal />
            <WifiFan />
            <Battery />
        </span>
    </div>
)

const HomeIndicator = () => (
    <span className="absolute bottom-2 left-1/2 z-10 h-1 w-28 -translate-x-1/2 rounded-full bg-black" />
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


// iOS-style navigation: chats push in from the right, going back slides them out.
const nav: Variants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-30%', zIndex: dir > 0 ? 2 : 1 }),
    center: { x: 0 },
    exit: (dir: number) => ({ x: dir > 0 ? '-30%' : '100%', zIndex: dir > 0 ? 1 : 2 }),
}

function Screen({ step, settled }: { step: Step; settled: boolean }) {
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
    } else {
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

// Autoplay timing (ms): the typing half of a beat, the settled half, and how long the last reply holds before looping
const TYPING_MS = 600
const SETTLED_MS = 1100
const readingTime = (step: Step) => {
    if (step.view !== 'chat' || step.shown === 0) return SETTLED_MS
    const text = contacts[step.chat].messages?.[step.shown - 1]?.text ?? ''
    return Math.max(SETTLED_MS, text.split(/\s+/).length * 220)
}
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

    // Step through the beats on a timer while the phone is on screen, then start over
    useEffect(() => {
        if (!inView) return
        const id = setTimeout(
            () => setBeat(beat === LAST_BEAT ? 1 : beat + 1),
            beat === LAST_BEAT ? HOLD_MS : isTap(steps[beat >> 1]) ? (beat & 1 ? TAP_MS : 0) : beat & 1 ? readingTime(steps[beat >> 1]) : TYPING_MS,
        )
        return () => clearTimeout(id)
    }, [inView, beat])

    const step = steps[beat >> 1]

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
                        />
                    </div>
                    <img
                        src="/device/iphone-frame.png"
                        alt=""
                        draggable={false}
                        className="pointer-events-none absolute inset-0 size-full select-none"
                    />
                </motion.div>
            </div>
        </div>
    )
}
