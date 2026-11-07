import { useState } from 'react'
import { ArrowRight, BarChart3, KeyRound } from 'lucide-react'
import { slotOf } from '@convex/lib/models'
import { creditsFor, SLOT_UNITS } from '@convex/lib/usage'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'

// What your agents use, who bills you for it, and what it counts toward your budget (convex/lib/usage.ts)
const usage = [
    ['Replies', 'Your AI provider', '1 credit each'],
    ['Computer use', 'Anthropic', '2 credits a step'],
    ['Texts', 'Twilio or Sendblue', 'Not counted'],
]

// Rough public list prices in dollars per million tokens (input, output). Only for the estimate: your provider's own page is the truth
const PRICES: Record<string, [number, number]> = {
    'gpt-5.1': [1.25, 10],
    'gpt-5.1-mini': [0.25, 2],
    'claude-sonnet-5.5': [3, 15],
    'claude-haiku-4.5': [1, 5],
    'gemini-2.5-flash': [0.3, 2.5],
    'grok-4': [3, 15],
    'claude-sonnet-5.5-computer-use': [3, 15],
    'claude-opus-5.5-computer-use': [5, 25],
}

// What one unit of each job is assumed to use, in tokens: a reply carries the chat so far and the agent's
// instructions, and a computer-use step sends a screenshot each time, so it reads far more
const TOKENS: Record<string, { input: number; output: number }> = {
    brain: { input: 1500, output: 150 },
    computer: { input: 3000, output: 200 },
}

// The jobs the estimate prices, each with a volume slider
const JOBS = [
    { slot: 'brain', min: 100, max: 50000, step: 100, start: 1000, unitNote: 'Texts your agents send back each month.' },
    { slot: 'computer', min: 0, max: 20000, step: 100, start: 0, unitNote: 'Clicks and keystrokes on your own computer. Leave it at 0 if you don’t use it.' },
] as const

const TEXTING = [
    { id: 'sendblue', label: 'Sendblue (iMessage)', perText: 0, note: 'A flat plan on Sendblue' },
    { id: 'twilio', label: 'Twilio (SMS)', perText: 0.0083, note: 'Per text, before carrier fees' },
]

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const count = (n: number) => n.toLocaleString('en-US')
const first = (v: number | readonly number[]) => (typeof v === 'number' ? v : v[0])

const tokensCost = (id: string, t: { input: number; output: number }) => {
    const [i, o] = PRICES[id] ?? [0, 0]
    return (t.input * i + t.output * o) / 1_000_000
}

// What one unit of a job costs on a given option
const unitCost = (slot: string, option: string) => tokensCost(option, TOKENS[slot])

// Bigger thumb and track than the dashboard's slider, so it's easy to grab on this page
const sliderClass = 'mt-5 **:data-[slot=slider-thumb]:size-6 **:data-[slot=slider-thumb]:border-2 **:data-[slot=slider-track]:data-horizontal:h-2'
const optionClass = 'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'
const cardClass = 'rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10'

function CostEstimator() {
    const [volumes, setVolumes] = useState<Record<string, number>>(() => Object.fromEntries(JOBS.map((j) => [j.slot, j.start])))
    const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(JOBS.map((j) => [j.slot, slotOf(j.slot)?.default ?? ''])))
    const [texting, setTexting] = useState(TEXTING[0].id)

    const channel = TEXTING.find((t) => t.id === texting) ?? TEXTING[0]

    const lines = JOBS.map((job) => {
        const slot = slotOf(job.slot)!
        const option = slot.options.find((o) => o.id === choices[job.slot])
        const amount = volumes[job.slot] * unitCost(job.slot, choices[job.slot])
        return { job, slot, label: option?.label ?? '', volume: volumes[job.slot], amount }
    })
    const textCost = volumes.brain * channel.perText
    const total = lines.reduce((sum, l) => sum + l.amount, 0) + textCost
    const credits = lines.reduce((sum, l) => sum + creditsFor(l.job.slot, l.volume), 0)

    return (
        <section className="pb-20 md:pb-28">
            <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <p className="type-label text-muted-foreground">Estimate your cost</p>
                    <h2 className="type-title mt-2">What will you pay your providers?</h2>
                </div>
                <p className="type-body text-muted-foreground max-w-md">
                    Your agents can run their replies and their computer use on different models. Set how much each one does and pick what it runs on to see an approximate monthly bill. These are estimates from public list prices, not a quote.
                </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
                <article className={cardClass}>
                    <h3 className="type-heading">Choose your setup</h3>
                    <div className="mt-6 flex flex-col divide-y divide-black/5 border-t border-black/5 dark:divide-white/10 dark:border-white/10">
                        {JOBS.map((job) => {
                            const slot = slotOf(job.slot)!
                            const unit = SLOT_UNITS[job.slot]
                            return (
                                <div key={job.slot} className="py-7">
                                    <div className="flex items-baseline justify-between gap-4">
                                        <div>
                                            <h4 className="type-subheading">{slot.label}</h4>
                                            <p className="type-body-sm text-muted-foreground mt-1">{slot.blurb}</p>
                                        </div>
                                        <span className="shrink-0 text-right">
                                            <span className={job.slot === 'brain' ? 'text-4xl font-medium tracking-[-0.05em] tabular-nums' : 'text-2xl font-medium tracking-[-0.04em] tabular-nums'}>
                                                {count(volumes[job.slot])}
                                            </span>
                                            <span className="type-caption text-muted-foreground block">{unit.many} a month</span>
                                        </span>
                                    </div>
                                    <Slider
                                        className={sliderClass}
                                        aria-label={`${slot.label}: ${unit.many} a month`}
                                        min={job.min}
                                        max={job.max}
                                        step={job.step}
                                        value={volumes[job.slot]}
                                        onValueChange={(v) => setVolumes((prev) => ({ ...prev, [job.slot]: first(v) }))}
                                    />
                                    <p className="type-caption text-muted-foreground mt-3">{job.unitNote}</p>
                                    <ToggleGroup
                                        variant="outline"
                                        className="mt-4 flex-wrap"
                                        aria-label={`${slot.label} model`}
                                        value={[choices[job.slot]]}
                                        onValueChange={(v) => v[0] && setChoices((prev) => ({ ...prev, [job.slot]: v[0] }))}>
                                        {slot.options.map((o) => (
                                            <ToggleGroupItem key={o.id} value={o.id} size="lg" className={optionClass}>
                                                {o.label}
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                </div>
                            )
                        })}

                        <div className="py-7">
                            <h4 className="type-subheading">Texting</h4>
                            <p className="type-body-sm text-muted-foreground mt-1">Sends and receives the texts, one per reply.</p>
                            <ToggleGroup variant="outline" className="mt-4 flex-wrap" aria-label="Texting provider" value={[texting]} onValueChange={(v) => v[0] && setTexting(v[0])}>
                                {TEXTING.map((t) => (
                                    <ToggleGroupItem key={t.id} value={t.id} size="lg" className={optionClass}>
                                        {t.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>
                    </div>
                </article>

                <aside className="bg-primary text-primary-foreground flex flex-col rounded-[2rem] p-8 md:p-10 lg:sticky lg:top-24 lg:self-start" aria-live="polite">
                    <p className="type-label text-white/60">Estimated per month</p>
                    <span className="mt-4 text-6xl font-medium tracking-[-0.06em] tabular-nums">{money(total)}</span>
                    <p className="type-body-sm mt-2 text-white/60">About {count(credits)} budget credits</p>
                    <dl className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6">
                        {lines.map(({ job, slot, label, volume, amount }) => (
                            <div key={job.slot} className={cn('flex items-baseline justify-between gap-4', volume === 0 && 'opacity-50')}>
                                <div>
                                    <dt className="type-body-sm">{slot.label}</dt>
                                    <dd className="type-caption text-white/50">{volume === 0 ? 'Not used' : label}</dd>
                                </div>
                                <span className="type-body-sm font-medium tabular-nums">{money(amount)}</span>
                            </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-4">
                            <div>
                                <dt className="type-body-sm">Texting</dt>
                                <dd className="type-caption text-white/50">{channel.note}</dd>
                            </div>
                            <span className="type-body-sm font-medium tabular-nums">{money(textCost)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 border-t border-white/15 pt-4">
                            <div>
                                <dt className="type-body-sm">OpenBots</dt>
                                <dd className="type-caption text-white/50">Free</dd>
                            </div>
                            <span className="type-body-sm font-medium tabular-nums">{money(0)}</span>
                        </div>
                    </dl>
                    <p className="type-caption mt-auto pt-8 text-white/50">
                        Assumes about {count(TOKENS.brain.input)} tokens in and {TOKENS.brain.output} out per reply. Real bills depend on how long your chats run.
                    </p>
                </aside>
            </div>
        </section>
    )
}

export function PricingPage() {
    return (
        <PageShell title="Pricing">
            <Stagger
                onMount
                className="pb-20 pt-24 text-center md:pb-28 md:pt-36">
                <StaggerItem>
                    <p className="type-label text-muted-foreground">Simple pricing</p>
                    <h1 className="mx-auto mt-4 max-w-5xl text-balance text-6xl leading-[1.02] font-medium tracking-[-0.045em] md:text-8xl lg:text-9xl">Pay as you go</h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-5 max-w-xl text-balance">
                        OpenBots is free. Your agents run on your own AI and texting accounts, so you pay those providers directly, at their prices.
                    </p>
                </StaggerItem>
                <StaggerItem className="mt-9 flex justify-center">
                    <Button
                        size="lg"
                        className="type-body h-12 px-7"
                        nativeButton={false}
                        render={<a href="/dashboard">Explore the builder <ArrowRight data-icon="inline-end" /></a>}
                    />
                </StaggerItem>
            </Stagger>

            <CostEstimator />

            <section className="pb-24 md:pb-36">
                <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <p className="type-label text-muted-foreground">No mystery math</p>
                        <h2 className="type-title mt-2">See what each agent used</h2>
                    </div>
                    <p className="type-body text-muted-foreground max-w-md">
                        Every reply and computer step is counted per agent and per model in the dashboard, so you know which agents do the work.
                    </p>
                </div>

                <div className="overflow-hidden rounded-[2rem] bg-neutral-100/70 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 border-b border-black/5 px-6 py-4 text-xs font-medium text-neutral-500 dark:border-white/10 md:px-8">
                        <span>What runs</span><span>Who bills you</span><span>Your budget counts</span>
                    </div>
                    {usage.map(([name, unit, rate]) => (
                        <div key={name} className="type-body-sm grid grid-cols-[1.2fr_1fr_1fr] gap-4 border-b border-black/5 px-6 py-5 last:border-0 dark:border-white/10 md:px-8">
                            <span className="font-medium">{name}</span>
                            <span className="text-muted-foreground">{unit}</span>
                            <span className="text-muted-foreground">{rate}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="grid gap-5 pb-24 md:grid-cols-2 md:pb-36">
                <article className={cardClass}>
                    <BarChart3 className="size-7" aria-hidden />
                    <h2 className="type-heading mt-8">Usage, agent by agent</h2>
                    <p className="type-body text-muted-foreground mt-3">Analytics shows each agent’s replies, computer steps and models, day by day, so nothing runs up quietly.</p>
                </article>
                <article className={cardClass}>
                    <KeyRound className="size-7" aria-hidden />
                    <h2 className="type-heading mt-8">Bills you already know</h2>
                    <p className="type-body text-muted-foreground mt-3">Your AI and texting providers bill you directly, at their prices, and you can set their own spending limits on top.</p>
                </article>
            </section>
        </PageShell>
    )
}
