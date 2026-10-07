import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react'
import { AgentAvatar } from '@/components/landing/agent-avatar'

type Point = { x: number; y: number; duration?: number }
type Rect = { left: number; top: number; width: number; height: number }

type CursorState = { pos: Point; message: string; clicks: number }

type Agent = { name: string; hue: number }

const WAFFLES: Agent = { name: 'Waffles', hue: 200 }
const BISCUIT: Agent = { name: 'Biscuit', hue: 25 }

class Cancelled extends Error {}

// Measures a [data-cursor-target] element relative to the cursor layer
const measure = (layer: HTMLElement | null, target: string): Rect | null => {
    const el = layer?.parentElement?.querySelector(`[data-cursor-target="${target}"]`)
    if (!layer || !el) return null
    const a = el.getBoundingClientRect()
    const b = layer.getBoundingClientRect()
    return { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height }
}

type Script = (tools: {
    move: (p: Point) => Promise<void>
    click: () => Promise<void>
    say: (message: string) => void
    wait: (ms: number) => Promise<void>
    rect: (target: string) => Rect | null
    size: () => { w: number; h: number }
}) => Promise<void>

// Runs one agent's looping script; every await bails out once the component unmounts
function useCursorScript(layerRef: RefObject<HTMLDivElement | null>, initial: CursorState, script: Script, startDelay: number) {
    const [state, setState] = useState(initial)
    const scriptRef = useRef(script)

    useEffect(() => {
        scriptRef.current = script
    })

    useEffect(() => {
        let alive = true
        const wait = (ms: number) =>
            new Promise<void>((resolve, reject) =>
                setTimeout(() => {
                    if (alive) resolve()
                    else reject(new Cancelled())
                }, ms)
            )
        const tools = {
            wait,
            move: async (pos: Point) => {
                setState((s) => ({ ...s, pos }))
                await wait((pos.duration ?? 1) * 1000)
            },
            click: async () => {
                setState((s) => ({ ...s, clicks: s.clicks + 1 }))
                await wait(250)
            },
            say: (message: string) => setState((s) => ({ ...s, message })),
            rect: (target: string) => measure(layerRef.current, target),
            size: () => ({ w: layerRef.current?.offsetWidth ?? 1200, h: layerRef.current?.offsetHeight ?? 640 }),
        }
        const loop = async () => {
            await wait(startDelay)
            while (alive) await scriptRef.current(tools)
        }
        loop().catch(() => {})
        return () => {
            alive = false
        }
    }, [layerRef, startDelay])

    return state
}

const CursorArrow = ({ hue }: { hue: number }) => (
    <svg
        viewBox="0 0 16 16"
        className="size-[22px] drop-shadow-sm"
        style={{ color: `hsl(${hue} 70% 55%)` }}>
        <path
            d="M1.5 1.5 14 6.2 8.4 8.4 6.2 14Z"
            fill="currentColor"
            stroke="white"
            strokeWidth="1"
            strokeLinejoin="round"
        />
    </svg>
)

const Cursor = ({ agent, state }: { agent: Agent; state: CursorState }) => (
    <motion.div
        className="absolute left-0 top-0"
        initial={false}
        animate={{ x: state.pos.x, y: state.pos.y }}
        transition={state.pos.duration ? { duration: state.pos.duration, ease: [0.45, 0, 0.25, 1] } : { type: 'spring', stiffness: 60, damping: 16 }}>
        {/* Click ripple */}
        <AnimatePresence>
            {state.clicks > 0 && (
                <motion.span
                    key={state.clicks}
                    className="absolute -left-2.5 -top-2.5 size-6 rounded-full border-2"
                    style={{ borderColor: `hsl(${agent.hue} 70% 55%)` }}
                    initial={{ scale: 0.3, opacity: 0.9 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 0.55 }}
                />
            )}
        </AnimatePresence>
        <motion.div
            key={state.clicks}
            initial={{ scale: state.clicks ? 0.82 : 1 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            style={{ originX: 0, originY: 0 }}>
            <CursorArrow hue={agent.hue} />
        </motion.div>
        <div
            className="ml-4 mt-0.5 flex w-max items-center gap-2.5 rounded-2xl py-2 pl-2 pr-4 shadow-sm"
            style={{ background: `hsl(${agent.hue} 85% 96%)`, boxShadow: `inset 0 0 0 1px hsl(${agent.hue} 60% 88%)` }}>
            <AgentAvatar
                name={agent.name}
                className="size-8"
            />
            <span className="type-label whitespace-nowrap">
                <span
                    className="block font-medium"
                    style={{ color: `hsl(${agent.hue} 45% 38%)` }}>
                    {agent.name}
                </span>
                <AnimatePresence
                    mode="wait"
                    initial={false}>
                    <motion.span
                        key={state.message}
                        className="block"
                        style={{ color: `hsl(${agent.hue} 30% 32%)` }}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}>
                        {state.message}
                    </motion.span>
                </AnimatePresence>
            </span>
        </div>
    </motion.div>
)

const jitter = (n: number) => (Math.random() - 0.5) * n

// Two agents working on the hero itself: Biscuit highlights copy, Waffles sketches frames on the left.
// They fade away as soon as the page starts scrolling.
export function AgentCursors() {
    const layerRef = useRef<HTMLDivElement>(null)
    const [highlight, setHighlight] = useState<{ rect: Rect; duration: number } | null>(null)
    const [boxes, setBoxes] = useState<(Rect & { id: number; duration: number })[]>([])

    const biscuit = useCursorScript(
        layerRef,
        { pos: { x: 1080, y: 230 }, message: 'Reading the subheading', clicks: 0 },
        async ({ move, click, say, wait, rect, size }) => {
            const { w } = size()
            const home = { x: w * 0.78 + jitter(30), y: 220 + jitter(40) }
            say('Reading the subheading')
            await move(home)
            await wait(2600)
            const phrase = rect('phrase')
            if (!phrase) return wait(1000)
            say('Highlighting a line')
            await move({ x: phrase.left - 2, y: phrase.top + phrase.height * 0.55, duration: 1.4 })
            await click()
            setHighlight({ rect: phrase, duration: 1.4 })
            await move({ x: phrase.left + phrase.width, y: phrase.top + phrase.height * 0.55, duration: 1.4 })
            say('Love this line 👀')
            await wait(2800)
            setHighlight(null)
            await move({ x: w * 0.8 + jitter(30), y: 300 + jitter(40) })
            say('Sharing it with the team')
            await wait(3200)
        },
        1800
    )

    const waffles = useCursorScript(
        layerRef,
        { pos: { x: 120, y: 400 }, message: 'Sketching a layout', clicks: 0 },
        async ({ move, click, say, wait, size }) => {
            const { w } = size()
            say('Sketching a layout')
            await move({ x: w * 0.09 + jitter(40), y: 420 + jitter(40) })
            await wait(1600)
            // Drag out a few random frames in the left gutter, like drawing in a design tool
            for (let k = 0; k < 3; k++) {
                const box = {
                    left: Math.round(w * 0.03 + Math.random() * w * 0.12),
                    top: Math.round(250 + Math.random() * 260),
                    width: Math.round(70 + Math.random() * 90),
                    height: Math.round(45 + Math.random() * 70),
                }
                await move({ x: box.left, y: box.top, duration: 0.8 })
                await click()
                const id = Date.now() + k
                setBoxes((b) => [...b, { ...box, id, duration: 0.8 }])
                say(`Drawing frame ${k + 1}`)
                await move({ x: box.left + box.width, y: box.top + box.height, duration: 0.8 })
                say(`Frame ${k + 1} · ${box.width} × ${box.height}`)
                await wait(900)
            }
            await wait(1800)
            say('Clearing the canvas')
            setBoxes([])
            await move({ x: w * 0.1 + jitter(40), y: 440 + jitter(40) })
            await wait(2600)
        },
        3600
    )

    const { scrollY } = useScroll()
    const opacity = useTransform(scrollY, [0, 280], [1, 0])
    const y = useTransform(scrollY, [0, 280], [0, -40])

    return (
        <motion.div
            ref={layerRef}
            aria-hidden
            style={{ opacity, y }}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-[640px] xl:block">
            {/* Biscuit's highlighter sweep */}
            <AnimatePresence>
                {highlight && (
                    <motion.div
                        className="absolute rounded-sm mix-blend-multiply"
                        style={{ ...highlight.rect, originX: 0, background: `hsl(${BISCUIT.hue} 95% 70% / 0.45)` }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: highlight.duration, ease: [0.45, 0, 0.25, 1] }}
                    />
                )}
            </AnimatePresence>

            {/* Waffles's freshly drawn frames */}
            <AnimatePresence>
                {boxes.map((box) => (
                    <motion.div
                        key={box.id}
                        className="absolute rounded-[3px] border-[1.5px]"
                        style={{ left: box.left, top: box.top, borderColor: `hsl(${WAFFLES.hue} 70% 55%)`, background: `hsl(${WAFFLES.hue} 85% 60% / 0.08)` }}
                        initial={{ width: 0, height: 0 }}
                        animate={{ width: box.width, height: box.height }}
                        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.3 } }}
                        transition={{ duration: box.duration, ease: [0.45, 0, 0.25, 1] }}>
                        {/* corner handles */}
                        {['-left-1 -top-1', '-right-1 -top-1', '-left-1 -bottom-1', '-right-1 -bottom-1'].map((corner) => (
                            <span
                                key={corner}
                                className={`absolute size-2 rounded-[2px] border bg-white ${corner}`}
                                style={{ borderColor: `hsl(${WAFFLES.hue} 70% 55%)` }}
                            />
                        ))}
                    </motion.div>
                ))}
            </AnimatePresence>

            <Cursor
                agent={WAFFLES}
                state={waffles}
            />
            <Cursor
                agent={BISCUIT}
                state={biscuit}
            />
        </motion.div>
    )
}
