import { ArrowRight, ChartLine, Check, KeyRound, WalletCards } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GitHubMark } from '@/components/landing/logo'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'
import { UsageGauge } from '@/components/usage-gauge'
import { GITHUB_URL, LICENSE_URL, README_URL } from '@/lib/site'

type Link = { label: string; href?: string }

// Everything that can cost money, and who bills you for it. OpenBots itself is never on the list.
const providers: { what: string; note: string; links: Link[] }[] = [
    {
        what: 'AI models',
        note: 'per token, on your own key',
        links: [
            { label: 'OpenAI', href: 'https://openai.com/api/pricing/' },
            { label: 'Anthropic', href: 'https://www.anthropic.com/pricing' },
            { label: 'Google Gemini', href: 'https://ai.google.dev/gemini-api/docs/pricing' },
            { label: 'xAI', href: 'https://docs.x.ai/docs/models' },
            { label: 'a local model: free' },
        ],
    },
    {
        what: 'Texting',
        note: 'your own number or line',
        links: [
            { label: 'Twilio SMS', href: 'https://www.twilio.com/en-us/sms/pricing/us' },
            { label: 'Sendblue', href: 'https://sendblue.com/pricing' },
            { label: 'BlueBubbles: free', href: 'https://bluebubbles.app' },
            { label: 'Messages on a Mac: free' },
        ],
    },
    {
        what: 'Hosting',
        note: 'your own deployment',
        links: [
            { label: 'Convex', href: 'https://www.convex.dev/pricing' },
            { label: 'Vercel', href: 'https://vercel.com/pricing' },
            { label: 'the engine: your own computer' },
        ],
    },
]

const promises = ['MIT licensed', 'no subscription or credits to buy', 'no markup on any provider', 'as many agents as you like']

export function PricingPage() {
    return (
        <PageShell title="Pricing">
            <Stagger
                onMount
                className="pb-20 pt-24 text-center md:pb-28 md:pt-36">
                <StaggerItem>
                    <p className="type-label text-muted-foreground">pricing</p>
                    <h1 className="type-title mx-auto mt-3 max-w-3xl text-balance">free. open source. yours to run.</h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-5 max-w-xl text-balance">
                        openbots costs nothing. you host it yourself, bring your own AI and texting accounts, and pay those providers directly at their rates.
                    </p>
                </StaggerItem>
                <StaggerItem className="mt-9 flex flex-wrap justify-center gap-3">
                    <Button
                        size="lg"
                        className="type-body h-12 px-7"
                        nativeButton={false}
                        render={
                            <a
                                href={GITHUB_URL}
                                target="_blank"
                                rel="noreferrer">
                                <GitHubMark /> Star on GitHub
                            </a>
                        }
                    />
                    <Button
                        variant="ghost"
                        size="lg"
                        className="type-body h-12 px-5"
                        nativeButton={false}
                        render={
                            <a
                                href={README_URL}
                                target="_blank"
                                rel="noreferrer">
                                Self-host it <ArrowRight data-icon="inline-end" />
                            </a>
                        }
                    />
                </StaggerItem>
            </Stagger>

            <section className="grid gap-5 pb-20 md:grid-cols-3 md:pb-28">
                <article className="rounded-[2rem] bg-neutral-950 p-8 text-white md:col-span-2 md:p-10">
                    <p className="type-label text-white/60">the software</p>
                    <div className="mt-5 flex items-end gap-3">
                        <span className="text-7xl font-medium tracking-[-0.06em]">$0</span>
                        <span className="type-body text-white/60 pb-2">forever</span>
                    </div>
                    <p className="type-body-lg mt-6 max-w-lg text-white/70">
                        there’s no hosted plan and nothing to sign up for with us. the code is{' '}
                        <a
                            href={LICENSE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-white/30 underline-offset-4 hover:decoration-current">
                            MIT licensed
                        </a>
                        : run it, change it, share it.
                    </p>
                    <ul className="mt-9 grid gap-3 sm:grid-cols-2">
                        {promises.map((item) => (
                            <li
                                key={item}
                                className="type-body-sm flex items-center gap-2.5">
                                <span className="flex size-5 items-center justify-center rounded-full bg-white/12">
                                    <Check
                                        className="size-3"
                                        aria-hidden
                                    />
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </article>

                <article className="flex flex-col rounded-[2rem] bg-violet-100 p-8 text-violet-950 ring-1 ring-violet-950/5 md:p-10">
                    <WalletCards
                        className="size-7"
                        aria-hidden
                    />
                    <p className="type-label mt-8 text-violet-950/60">your rules</p>
                    <h2 className="type-heading mt-2">set a budget</h2>
                    <p className="type-body-sm mt-3 text-violet-950/70">
                        give your workspace a daily or weekly usage budget. once it’s used up, agents stop replying and text you instead.
                    </p>
                    <div className="mt-auto pt-6">
                        <UsageGauge
                            label="This week"
                            used={118}
                            limit={400}
                            note="118 of 400 credits this week"
                        />
                        <p className="mt-3 text-center text-xs text-violet-950/60">Example usage</p>
                    </div>
                </article>
            </section>

            <section className="pb-24 md:pb-36">
                <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <p className="type-label text-muted-foreground">no middleman</p>
                        <h2 className="type-title mt-2">who you actually pay</h2>
                    </div>
                    <p className="type-body text-muted-foreground max-w-md">
                        you sign up with the providers you want and use your own keys. their prices change, so check their pages for current rates.
                    </p>
                </div>

                <div className="overflow-hidden rounded-[2rem] bg-neutral-100/70 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 border-b border-black/5 px-6 py-4 text-xs font-medium text-neutral-500 md:grid-cols-[1fr_1fr_2fr] dark:border-white/10 md:px-8">
                        <span>What</span>
                        <span className="max-md:hidden">Billed</span>
                        <span>Who bills you</span>
                    </div>
                    {providers.map(({ what, note, links }) => (
                        <div
                            key={what}
                            className="type-body-sm grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 border-b border-black/5 px-6 py-5 last:border-0 md:grid-cols-[1fr_1fr_2fr] dark:border-white/10 md:px-8">
                            <span className="font-medium">
                                {what}
                                <span className="text-muted-foreground mt-0.5 block font-normal md:hidden">{note}</span>
                            </span>
                            <span className="text-muted-foreground max-md:hidden">{note}</span>
                            <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                                {links.map(({ label, href }) =>
                                    href ? (
                                        <a
                                            key={label}
                                            href={href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-foreground underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
                                            {label}
                                        </a>
                                    ) : (
                                        <span key={label}>{label}</span>
                                    ),
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="grid gap-5 pb-24 md:grid-cols-2 md:pb-36">
                <article className="rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10">
                    <KeyRound
                        className="size-7"
                        aria-hidden
                    />
                    <h2 className="type-heading mt-8">your keys, your bills</h2>
                    <p className="type-body text-muted-foreground mt-3">
                        keys stay on your engine or encrypted in your own backend. every charge comes straight from the provider, on your account.
                    </p>
                </article>
                <article className="rounded-[2rem] bg-neutral-100/70 p-8 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8 md:p-10">
                    <ChartLine
                        className="size-7"
                        aria-hidden
                    />
                    <h2 className="type-heading mt-8">see what it used</h2>
                    <p className="type-body text-muted-foreground mt-3">
                        analytics counts replies, computer steps and backup takeovers per model, so you can line them up with your provider’s bill.
                    </p>
                </article>
            </section>
        </PageShell>
    )
}
