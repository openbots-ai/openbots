import { useState } from 'react'
import { ArrowRight, BarChart3, Check, KeyRound, WalletCards } from 'lucide-react'
import { BRAIN_MODELS } from '@convex/lib/models'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'
import { UsageGauge } from '@/components/usage-gauge'

// What your agents use, who bills you for it, and what it counts toward your budget (convex/lib/usage.ts)
const usage = [
    ['Replies', 'Your AI provider', '1 credit each'],
    ['Computer use', 'Anthropic', '2 credits a step'],
    ['Texts', 'Twilio or Sendblue', 'Not counted'],
]

const promises = ['Free during early access', 'No markup on any model', 'Your own keys, your own bills', 'Stops at the budget you set']

// Rough public list prices in dollars per million tokens (input, output). Only for the estimate: your provider's own page is the truth
const PRICES: Record<string, [number, number]> = {
    'gpt-5.1': [1.25, 10],
    'gpt-5.1-mini': [0.25, 2],
    'claude-sonnet-5.5': [3, 15],
    'claude-haiku-4.5': [1, 5],
    'gemini-2.5-flash': [0.3, 2.5],
    'grok-4': [3, 15],
}
// What one reply is assumed to use: the chat so far plus the agent's instructions in, a short text out
const REPLY_TOKENS = { input: 1500, output: 150 }
// A computer-use step sends a screenshot each time, so it reads far more than a reply does
const STEP_TOKENS = { input: 3000, output: 200 }

const TEXTING = [
    { id: 'sendblue', label: 'Sendblue (iMessage)', perText: 0, note: 'A flat plan on Sendblue' },
    { id: 'twilio', label: 'Twilio (SMS)', perText: 0.0083, note: 'Per text, before carrier fees' },
]

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const count = (n: number) => n.toLocaleString('en-US')
const tokensCost = (id: string, t: { input: number; output: number }) => {
    const [i, o] = PRICES[id] ?? [0, 0]
    return (t.input * i + t.output * o) / 1_000_000
}
const first = (v: number | readonly number[]) => (typeof v === 'number' ? v : v[0])

const optionClass = 'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'
const cardClass = 'rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10'

function CostEstimator() {
    const [replies, setReplies] = useState(1000)
    const [steps, setSteps] = useState(0)
    const [model, setModel] = useState(BRAIN_MODELS[0].id)
    const [texting, setTexting] = useState(TEXTING[0].id)

    const channel = TEXTING.find((t) => t.id === texting) ?? TEXTING[0]
    const modelCost = replies * tokensCost(model, REPLY_TOKENS) + steps * tokensCost(model, STEP_TOKENS)
    const textCost = replies * channel.perText
    const total = modelCost + textCost
    const credits = replies + steps * 2
    const breakdown = [
        ['AI model', modelCost, 'Paid to your AI provider'],
        ['Texting', textCost, channel.note],
        ['OpenBots', 0, 'Free during early access'],
    ] as const

    return (
        <section className="pb-20 md:pb-28">
            <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <p className="type-label text-muted-foreground">Estimate your cost</p>
                    <h2 className="type-title mt-2">What will you pay your providers?</h2>
                </div>
                <p className="type-body text-muted-foreground max-w-md">
                    Adjust the sliders and pick a model to see an approximate monthly bill. These are estimates from public list prices, not a quote.
                </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
                <div className="flex flex-col gap-5">
                    <article className={cardClass}>
                        <div className="flex items-end justify-between gap-4">
                            <h3 className="type-heading">Monthly replies</h3>
                            <span className="text-5xl font-medium tracking-[-0.05em] tabular-nums">{count(replies)}</span>
                        </div>
                        <Slider className="mt-6" aria-label="Monthly replies" min={100} max={50000} step={100} value={replies} onValueChange={(v) => setReplies(first(v))} />
                        <p className="type-body-sm text-muted-foreground mt-4">How many texts your agents send back each month.</p>

                        <div className="mt-10 flex items-end justify-between gap-4">
                            <h3 className="type-subheading">Computer-use steps</h3>
                            <span className="text-3xl font-medium tracking-[-0.04em] tabular-nums">{count(steps)}</span>
                        </div>
                        <Slider className="mt-5" aria-label="Monthly computer-use steps" min={0} max={20000} step={100} value={steps} onValueChange={(v) => setSteps(first(v))} />
                        <p className="type-body-sm text-muted-foreground mt-4">Clicks and keystrokes on your own computer. Leave it at 0 if you don’t use it.</p>
                    </article>

                    <article className={cardClass}>
                        <h3 className="type-heading">Choose your options</h3>
                        <div className="mt-6 grid gap-x-8 gap-y-5 border-t border-black/5 pt-6 dark:border-white/10 md:grid-cols-[7rem_1fr]">
                            <p className="type-label text-muted-foreground pt-2">Model</p>
                            <ToggleGroup variant="outline" className="flex-wrap" aria-label="Model" value={[model]} onValueChange={(v) => v[0] && setModel(v[0])}>
                                {BRAIN_MODELS.map((m) => (
                                    <ToggleGroupItem key={m.id} value={m.id} size="lg" className={optionClass}>
                                        {m.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                            <p className="type-label text-muted-foreground pt-2">Texting</p>
                            <ToggleGroup variant="outline" className="flex-wrap" aria-label="Texting provider" value={[texting]} onValueChange={(v) => v[0] && setTexting(v[0])}>
                                {TEXTING.map((t) => (
                                    <ToggleGroupItem key={t.id} value={t.id} size="lg" className={optionClass}>
                                        {t.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>
                    </article>
                </div>

                <aside className="bg-primary text-primary-foreground flex flex-col rounded-[2rem] p-8 md:p-10" aria-live="polite">
                    <p className="type-label text-white/60">Estimated per month</p>
                    <span className="mt-4 text-6xl font-medium tracking-[-0.06em] tabular-nums">{money(total)}</span>
                    <p className="type-body-sm mt-2 text-white/60">About {count(credits)} budget credits</p>
                    <dl className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6">
                        {breakdown.map(([label, amount, note]) => (
                            <div key={label} className="flex items-baseline justify-between gap-4">
                                <div>
                                    <dt className="type-body-sm">{label}</dt>
                                    <dd className="type-caption text-white/50">{note}</dd>
                                </div>
                                <span className="type-body-sm font-medium tabular-nums">{money(amount)}</span>
                            </div>
                        ))}
                    </dl>
                    <p className="type-caption mt-auto pt-8 text-white/50">
                        Assumes about {count(REPLY_TOKENS.input)} tokens in and {REPLY_TOKENS.output} out per reply. Real bills depend on how long your chats run.
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
                    <h1 className="type-title mx-auto mt-3 max-w-3xl text-balance">Pay as you go</h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-5 max-w-xl text-balance">
                        OpenBots is free during early access. Your agents run on your own AI and texting accounts, so you pay those providers directly, at their prices.
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

            <section className="grid gap-5 pb-20 md:grid-cols-3 md:pb-28">
                <article className="bg-primary text-primary-foreground rounded-[2rem] p-8 md:col-span-2 md:p-10">
                    <p className="type-label text-white/60">What OpenBots costs</p>
                    <div className="mt-5 flex items-end gap-3">
                        <span className="text-7xl font-medium tracking-[-0.06em]">$0</span>
                        <span className="type-body text-white/60 pb-2">per month</span>
                    </div>
                    <p className="type-body-lg mt-6 max-w-lg text-white/70">
                        No subscription, no seats and no markup. What your agents spend goes straight to the providers you picked.
                    </p>
                    <ul className="mt-9 grid gap-3 sm:grid-cols-2">
                        {promises.map((item) => (
                            <li key={item} className="type-body-sm flex items-center gap-2.5">
                                <span className="flex size-5 items-center justify-center rounded-full bg-white/12">
                                    <Check className="size-3" aria-hidden />
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </article>

                <article className="flex flex-col rounded-[2rem] bg-violet-100 p-8 text-violet-950 ring-1 ring-violet-950/5 md:p-10">
                    <WalletCards className="size-7" aria-hidden />
                    <p className="type-label mt-8 text-violet-950/60">Your rules</p>
                    <h2 className="type-heading mt-2">Pick the ceiling</h2>
                    <p className="type-body-sm mt-3 text-violet-950/70">
                        Set a daily or weekly budget for your agents. When it’s used up, they stop until the next one starts.
                    </p>
                    <div className="mt-auto pt-6">
                        <UsageGauge label="Today's budget" used={31} limit={50} note="31 of 50 credits used" />
                        <p className="mt-3 text-center text-xs text-violet-950/60">Example usage</p>
                    </div>
                </article>
            </section>

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
