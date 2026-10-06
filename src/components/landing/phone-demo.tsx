import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
    AlarmClock,
    BatteryFull,
    ChevronLeft,
    ChevronRight,
    ListFilter,
    MessageCircle,
    Mic,
    Phone,
    Plus,
    Search,
    ArrowUp,
    SquarePen,
    Video,
    Wifi,
} from 'lucide-react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'

type Message = { from: 'me' | 'them'; text: string }
type Contact = { name: string; role: string; hue: number; preview: string; time: string; messages?: Message[] }

const ME = 'me'

const EMILY = 0
const JASON = 1

const contacts: Contact[] = [
    {
        name: 'Emily',
        role: 'Chief of Staff',
        hue: 330,
        preview: 'morning! your weekly brief is ready ☕️',
        time: '8:42 AM',
        messages: [
            { from: 'them', text: 'morning! your weekly brief is ready ☕️' },
            { from: 'them', text: 'revenue +8% WoW, churn flat, 2 alerts need you' },
            { from: ME, text: 'what are the alerts?' },
            { from: 'them', text: "EU signups dipped after Tuesday's deploy, I've looped in eng" },
            { from: ME, text: 'perfect, thank you 🙏' },
        ],
    },
    {
        name: 'Jason',
        role: 'Growth Marketer',
        hue: 25,
        preview: 'variant B is winning checkout by 12% 👀',
        time: '8:05 AM',
        messages: [
            { from: 'them', text: 'variant B is winning checkout by 12% 👀' },
            { from: 'them', text: 'it hit significance an hour ago' },
            { from: ME, text: 'ship it to 100%' },
            { from: 'them', text: "done. calling you with the retention numbers" },
            { from: ME, text: 'go for it 📞' },
        ],
    },
    { name: 'Marcus', role: 'Sales Outbound', hue: 200, preview: 'Booked 3 demos for Thursday 📅', time: 'Yesterday' },
    { name: 'Nora', role: 'Customer Support', hue: 160, preview: '12 tickets resolved, 2 escalated.', time: 'Yesterday' },
    { name: 'Leo', role: 'Expense Manager', hue: 275, preview: 'Receipts coded, one needs a look.', time: 'Tuesday' },
    { name: 'Ava', role: 'Talent Scout', hue: 45, preview: 'Shortlist of 6 candidates is ready.', time: 'Monday' },
    { name: 'Sam', role: 'Data Analyst', hue: 230, preview: 'Q3 cohort report is in your inbox.', time: 'Sunday' },
]

type CallPhase = 'incoming' | 'answering'
type Step =
    | { view: 'list'; read: number[]; press?: number }
    | { view: 'chat'; chat: number; shown: number; pressBack?: boolean }
    | { view: 'call'; chat: number; phase: CallPhase }

const chatSteps = (chat: number): Step[] => [...contacts[chat].messages!, null].map((_, shown) => ({ view: 'chat', chat, shown }))

// One entry per scroll beat: open Emily, go back, open Jason, then Jason calls in and the swipe to answer ends it.
const steps: Step[] = [
    { view: 'list', read: [] },
    { view: 'list', read: [], press: EMILY },
    ...chatSteps(EMILY),
    { view: 'chat', chat: EMILY, shown: contacts[EMILY].messages!.length, pressBack: true },
    { view: 'list', read: [EMILY] },
    { view: 'list', read: [EMILY], press: JASON },
    ...chatSteps(JASON),
    { view: 'call', chat: JASON, phase: 'incoming' },
    { view: 'call', chat: JASON, phase: 'answering' },
]

const VH_PER_STEP = 60
// What is on screen for a list of items whose last one is still arriving until the beat settles
const arrival = (items: Message[], shown: number, settled: boolean) => {
    const arriving = !settled && shown > 0 ? items[shown - 1] : undefined
    return { count: arriving ? shown - 1 : shown, pending: arriving }
}

// Within each beat, the first part of the scroll shows the reply being typed and the rest shows it landed
const TYPING_SPLIT = 0.45
const ease = [0.22, 1, 0.36, 1] as const

const Avatar = ({ contact, className }: { contact: Contact; className?: string }) => (
    <span
        className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
        style={{ background: `linear-gradient(180deg, hsl(${contact.hue} 35% 68%), hsl(${contact.hue} 30% 50%))` }}>
        {contact.name[0]}
    </span>
)

const StatusBar = ({ dark }: { dark?: boolean }) => (
    <div className={cn('flex items-center justify-between px-7 pb-1 pt-3.5 text-[13px] font-semibold', dark && 'text-white')}>
        <span className="w-12">9:41</span>
        <span className="flex items-center gap-1">
            <Wifi className="size-3.5" strokeWidth={3} />
            <BatteryFull className="size-4.5" strokeWidth={2} />
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
                    return (
                        <div
                            key={contact.name}
                            className={cn('relative flex items-center gap-2.5 py-2 pl-5 pr-3 transition-colors duration-200', press === i && 'bg-neutral-200/80')}>
                            {unread && <span className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[#0A84FF]" />}
                            <Avatar
                                contact={contact}
                                className="size-10 text-base"
                            />
                            <div className="min-w-0 flex-1 border-b border-neutral-200 pb-2">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-[13px] font-semibold">
                                        {contact.name} <span className="font-normal text-neutral-400">· {contact.role}</span>
                                    </span>
                                    <span className="flex shrink-0 items-center text-[10px] text-neutral-400">
                                        {read.includes(i) ? 'Now' : contact.time}
                                        <ChevronRight className="size-3" />
                                    </span>
                                </div>
                                <p className="line-clamp-2 text-[11px] leading-snug text-neutral-500">{preview}</p>
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

const TypingBubble = () => (
    <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        style={{ originX: 0, originY: 1 }}
        className="mt-2 flex">
        <span className="imsg imsg-them imsg-tail relative flex gap-1 rounded-[18px] bg-[#E9E9EB] px-3 py-2.5">
            {[0, 0.15, 0.3].map((delay) => (
                <motion.span
                    key={delay}
                    className="size-1.5 rounded-full bg-neutral-400"
                    animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay }}
                />
            ))}
        </span>
    </motion.div>
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
                <AnimatePresence initial={false}>
                    {visible.map((m, i) => {
                        const mine = m.from === ME
                        const firstOfRun = visible[i - 1]?.from !== m.from
                        const lastOfRun = visible[i + 1]?.from !== m.from && !(typing && i === visible.length - 1 && !mine)
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 12, scale: 0.92 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
                                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
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
                                {mine && i === visible.length - 1 && <span className="mr-1 mt-0.5 text-[10px] font-medium text-neutral-400">Delivered</span>}
                            </motion.div>
                        )
                    })}
                    {typing && <TypingBubble key="typing" />}
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

const callBackground = (contact: Contact) => ({
    background: `radial-gradient(120% 70% at 50% 0%, hsl(${contact.hue} 30% 38%), transparent 70%), linear-gradient(180deg, #2b2f36, #121418)`,
})

function IncomingCall({ contact, answering }: { contact: Contact; answering: boolean }) {
    return (
        <div
            className="relative flex h-full flex-col text-white"
            style={callBackground(contact)}>
            <StatusBar dark />
            <div className="mt-10 flex flex-col items-center">
                <Avatar
                    contact={contact}
                    className="size-20 text-3xl"
                />
                <span className="mt-4 text-[30px] font-light">{contact.name}</span>
                <span className="text-sm text-white/60">is calling you</span>
            </div>

            <div className="mt-auto px-6 pb-14">
                <div className="mb-6 flex justify-between px-4 text-[11px] text-white/80">
                    <span className="flex flex-col items-center gap-1">
                        <AlarmClock className="size-5" />
                        Remind Me
                    </span>
                    <span className="flex flex-col items-center gap-1">
                        <MessageCircle className="size-5" />
                        Message
                    </span>
                </div>

                {/* Slide to answer */}
                <div className="relative flex h-[60px] items-center rounded-full bg-white/15 p-1 backdrop-blur">
                    <motion.span
                        animate={{ opacity: answering ? 0 : 1 }}
                        className="shimmer-text absolute inset-0 flex items-center justify-center pl-12 text-[17px]">
                        slide to answer
                    </motion.span>
                    <motion.div
                        initial={false}
                        animate={{ width: answering ? '100%' : '52px' }}
                        transition={{ duration: 0.7, ease }}
                        className="relative flex h-[52px] justify-end">
                        <motion.span
                            animate={answering ? { x: 0 } : { x: [0, 10, 0] }}
                            transition={answering ? {} : { duration: 1.2, repeat: Infinity, repeatDelay: 0.8 }}
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

// iOS-style navigation: chats push in from the right, going back slides them out.
const nav: Variants = {
    enter: (dir: number) => (dir === 0 ? { opacity: 0, scale: 1.04 } : { x: dir > 0 ? '100%' : '-30%', zIndex: dir > 0 ? 2 : 1 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => (dir === 0 ? { opacity: 0 } : { x: dir > 0 ? '-30%' : '100%', zIndex: dir > 0 ? 1 : 2 }),
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
    } else if (step.view === 'chat') {
        key = `chat-${step.chat}`
        dir = 1
        content = (
            <ChatScreen
                contact={contacts[step.chat]}
                shown={step.shown}
                settled={settled}
                pressBack={step.pressBack}
                badge={step.chat === EMILY ? 1 : 0}
            />
        )
    } else {
        key = 'call'
        dir = 0
        content = (
            <IncomingCall
                contact={contacts[step.chat]}
                answering={step.phase === 'answering'}
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
                transition={{ duration: 0.45, ease }}
                className="absolute inset-0 shadow-[-8px_0_24px_rgba(0,0,0,0.08)]">
                {content}
            </motion.div>
        </AnimatePresence>
    )
}

const PHONE_HEIGHT = 690
const fitScale = () => Math.min(1.6, (window.innerHeight - 64 - 32) / PHONE_HEIGHT, (window.innerWidth - 32) / 336)

export function PhoneDemo() {
    const ref = useRef<HTMLDivElement>(null)
    // Beat = step index * 2, plus 1 once the step's typing part has been scrolled past
    const [beat, setBeat] = useState(1)
    const [fit, setFit] = useState(fitScale)

    useEffect(() => {
        const onResize = () => setFit(fitScale())
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    // Grow the phone as it scrolls up to the pin point just under the 64px header
    const { scrollYProgress: approach } = useScroll({ target: ref, offset: ['start end', 'start 64px'] })
    const scale = useSpring(useTransform(approach, [0, 1], [0.8, 1]), { stiffness: 140, damping: 30 })

    // While pinned, scroll progress walks through the story one beat at a time
    const { scrollYProgress: story } = useScroll({ target: ref, offset: ['start 64px', 'end end'] })
    useMotionValueEvent(story, 'change', (v) => {
        const at = Math.min(steps.length - 0.001, Math.max(0, v * steps.length))
        setBeat(Math.floor(at) * 2 + (at % 1 >= TYPING_SPLIT ? 1 : 0))
    })

    return (
        <div
            ref={ref}
            aria-hidden
            className="relative"
            style={{ height: `calc(${steps.length * VH_PER_STEP}vh + 100svh - 4rem)` }}>
            <div className="sticky top-16 flex h-[calc(100svh-4rem)] items-center justify-center">
                <div style={{ transform: `scale(${fit})` }}>
                    <motion.div
                        style={{ scale }}
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
                                step={steps[beat >> 1]}
                                settled={(beat & 1) === 1}
                            />
                        </div>
                        <img
                            src="/iphone-17-pro-silver.png"
                            alt=""
                            draggable={false}
                            className="pointer-events-none absolute inset-0 size-full select-none"
                        />
                    </motion.div>
                </div>
            </div>
        </div>
    )
}
