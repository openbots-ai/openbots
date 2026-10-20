import { ArrowRight, BookOpen, Bug, ShieldCheck, type LucideIcon } from 'lucide-react'
import { GitHubMark } from '@/components/landing/logo'
import { Reveal, Stagger, StaggerItem } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'
import { GITHUB_URL, ISSUES_URL, NEW_ISSUE_URL, README_URL, SECURITY_URL } from '@/lib/site'

const ways: { icon: LucideIcon; title: string; body: string; cta: string; href: string }[] = [
    {
        icon: Bug,
        title: 'Questions, bugs and ideas',
        body: 'Open an issue on GitHub. Search the existing ones first, someone may have asked already.',
        cta: 'Open an issue',
        href: NEW_ISSUE_URL,
    },
    {
        icon: BookOpen,
        title: 'Setting it up',
        body: 'The README walks through deploying your own copy, running the engine and connecting your accounts.',
        cta: 'Read the README',
        href: README_URL,
    },
    {
        icon: ShieldCheck,
        title: 'Found a security issue?',
        body: 'Please don’t post it in a public issue. The security policy explains where your data lives and how to report a vulnerability.',
        cta: 'Security policy',
        href: SECURITY_URL,
    },
]

export function ContactPage() {
    return (
        <PageShell title="Contact">
            <div className="grid gap-14 py-20 md:py-28 lg:grid-cols-[1fr_22rem] lg:gap-20">
                <Reveal>
                    <h1 className="type-title">Get in touch</h1>
                    <p className="type-body-lg text-muted-foreground mt-4 max-w-md text-balance">
                        OpenBots is an open-source project, so conversations happen in the open on GitHub. There’s no sales team and no inbox to email.
                    </p>

                    <Stagger className="mt-10 grid max-w-xl gap-4">
                        {ways.map(({ icon: Icon, title, body, cta, href }) => (
                            <StaggerItem key={title}>
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group flex items-start gap-4 rounded-[1.75rem] bg-neutral-100/70 p-6 ring-1 ring-black/4 transition-shadow hover:shadow-lg hover:shadow-black/5 dark:bg-white/5 dark:ring-white/8">
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                                        <Icon className="size-5" aria-hidden />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="type-subheading block">{title}</span>
                                        <span className="type-body-sm text-muted-foreground mt-1 block">{body}</span>
                                        <span className="type-body mt-3 inline-flex items-center gap-1.5 font-medium">
                                            {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                                        </span>
                                    </span>
                                </a>
                            </StaggerItem>
                        ))}
                    </Stagger>
                </Reveal>

                <Reveal className="space-y-4 self-start lg:mt-28">
                    <div className="rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                        <GitHubMark className="size-5" />
                        <p className="type-subheading mt-4">The repo</p>
                        <p className="type-body-sm text-muted-foreground mt-1">The code, the issues and every change, all in one place.</p>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="type-body mt-4 inline-block font-medium underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
                            shidhartha-sen/opendots
                        </a>
                    </div>
                    <div className="rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                        <Bug className="size-5" />
                        <p className="type-subheading mt-4">Open issues</p>
                        <p className="type-body-sm text-muted-foreground mt-1">See what’s known, what’s being worked on, and add a thumbs-up to what you need.</p>
                        <a
                            href={ISSUES_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="type-body mt-4 inline-flex items-center gap-1.5 font-medium">
                            Browse issues <ArrowRight className="size-4" />
                        </a>
                    </div>
                </Reveal>
            </div>
        </PageShell>
    )
}
