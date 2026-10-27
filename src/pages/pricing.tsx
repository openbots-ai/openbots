import { ArrowRight, Check, Gauge, ReceiptText, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'
import { UsageGauge } from '@/components/usage-gauge'

const usage = [
    ['AI models', 'Tokens used', 'Live model rate'],
    ['Voice', 'Talk time', 'Per minute'],
    ['Computer', 'Active work time', 'Per minute'],
    ['Phone + messages', 'Calls and sends', 'Carrier rate'],
]

const promises = [
    'No monthly subscription',
    'Exact estimate before an approved run',
    'A receipt after every run',
    'Pause automatically at your limit',
]

export function PricingPage() {
    return (
        <PageShell title="Pricing">
            <Stagger
                onMount
                className="pb-20 pt-24 text-center md:pb-28 md:pt-36">
                <StaggerItem>
                    <p className="type-label text-muted-foreground">Simple pay-as-you-go pricing</p>
                    <h1 className="type-title mx-auto mt-3 max-w-3xl text-balance">Pay for the work, not another subscription.</h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-5 max-w-xl text-balance">
                        Add credit, set a limit, and only pay when your assistants actually do something.
                    </p>
                </StaggerItem>
                <StaggerItem className="mt-9 flex justify-center">
                    <Button
                        size="lg"
                        className="type-body h-12 px-7"
                        nativeButton={false}
                        render={<a href="/#early-access">Join early access <ArrowRight data-icon="inline-end" /></a>}
                    />
                </StaggerItem>
            </Stagger>

            <section className="grid gap-5 pb-20 md:grid-cols-3 md:pb-28">
                <article className="bg-primary text-primary-foreground rounded-[2rem] p-8 md:col-span-2 md:p-10">
                    <p className="type-label text-white/60">Your base price</p>
                    <div className="mt-5 flex items-end gap-3">
                        <span className="text-7xl font-medium tracking-[-0.06em]">$0</span>
                        <span className="type-body text-white/60 pb-2">per month</span>
                    </div>
                    <p className="type-body-lg mt-6 max-w-lg text-white/70">
                        No bundle to justify and no seats to count. Your balance only moves when an assistant runs.
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
                        Set a daily or monthly limit for every assistant. We warn you early and pause at the line.
                    </p>
                    <div className="mt-auto pt-6">
                        <UsageGauge label="Monthly spending" used={11.84} limit={40} note="$11.84 used of a $40 limit" />
                        <p className="mt-3 text-center text-xs text-violet-950/60">Example usage</p>
                    </div>
                </article>
            </section>

            <section className="pb-24 md:pb-36">
                <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <p className="type-label text-muted-foreground">No mystery math</p>
                        <h2 className="type-title mt-2">See where every cent went</h2>
                    </div>
                    <p className="type-body text-muted-foreground max-w-md">
                        Rates change by provider, so OpenBots shows the live rate before you turn something on—not a fake average buried in fine print.
                    </p>
                </div>

                <div className="overflow-hidden rounded-[2rem] bg-neutral-100/70 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 border-b border-black/5 px-6 py-4 text-xs font-medium text-neutral-500 dark:border-white/10 md:px-8">
                        <span>What ran</span><span>Measured by</span><span>Rate shown as</span>
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
                    <Gauge className="size-7" aria-hidden />
                    <h2 className="type-heading mt-8">Know before it runs</h2>
                    <p className="type-body text-muted-foreground mt-3">See the estimated range before expensive work. If the plan changes, your assistant asks again.</p>
                </article>
                <article className="rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10">
                    <ReceiptText className="size-7" aria-hidden />
                    <h2 className="type-heading mt-8">Receipts that make sense</h2>
                    <p className="type-body text-muted-foreground mt-3">Open any run to see the model, minutes, messages, provider rates, and final total in one place.</p>
                </article>
            </section>
        </PageShell>
    )
}
