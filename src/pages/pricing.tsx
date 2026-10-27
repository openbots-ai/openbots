import { ArrowRight, BarChart3, Check, KeyRound, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export function PricingPage() {
    return (
        <PageShell title="Pricing">
            <Stagger
                onMount
                className="pb-20 pt-24 text-center md:pb-28 md:pt-36">
                <StaggerItem>
                    <p className="type-label text-muted-foreground">Simple pricing</p>
                    <h1 className="type-title mx-auto mt-3 max-w-3xl text-balance">Free to build. You bring the keys.</h1>
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
                <article className="rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10">
                    <BarChart3 className="size-7" aria-hidden />
                    <h2 className="type-heading mt-8">Usage, agent by agent</h2>
                    <p className="type-body text-muted-foreground mt-3">Analytics shows each agent’s replies, computer steps and models, day by day, so nothing runs up quietly.</p>
                </article>
                <article className="rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10">
                    <KeyRound className="size-7" aria-hidden />
                    <h2 className="type-heading mt-8">Bills you already know</h2>
                    <p className="type-body text-muted-foreground mt-3">Your AI and texting providers bill you directly, at their prices, and you can set their own spending limits on top.</p>
                </article>
            </section>
        </PageShell>
    )
}
