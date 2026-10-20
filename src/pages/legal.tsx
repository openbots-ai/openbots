import type { ReactNode } from 'react'
import { PageShell } from '@/pages/page-shell'
import { ISSUES_URL, LICENSE_URL, SECURITY_URL } from '@/lib/site'

type Section = { id: string; title: string; body: ReactNode }

const LAST_UPDATED = 'October 20, 2026'

const P = ({ children }: { children: ReactNode }) => <p className="type-body text-muted-foreground mt-4">{children}</p>

const List = ({ items }: { items: ReactNode[] }) => (
    <ul className="type-body text-muted-foreground mt-4 list-disc space-y-2 pl-5 marker:text-neutral-300">
        {items.map((item, i) => (
            <li key={i}>{item}</li>
        ))}
    </ul>
)

const A = ({ href, children }: { href: string; children: ReactNode }) => (
    <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
        {children}
    </a>
)

const B = ({ children }: { children: ReactNode }) => <strong className="text-foreground font-medium">{children}</strong>

function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
    return (
        <PageShell title={title}>
            <div className="grid gap-12 py-20 md:py-28 lg:grid-cols-[14rem_1fr] lg:gap-20">
                {/* Section index */}
                <nav className="hidden lg:block">
                    <div className="sticky top-28">
                        <p className="type-label font-medium">On this page</p>
                        <ul className="type-label text-muted-foreground mt-4 space-y-2.5">
                            {sections.map((s) => (
                                <li key={s.id}>
                                    <a
                                        href={`#${s.id}`}
                                        className="hover:text-foreground duration-150">
                                        {s.title}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>

                <article className="max-w-2xl">
                    <p className="type-label text-muted-foreground">Last updated {LAST_UPDATED}</p>
                    <h1 className="type-title mt-3">{title}</h1>
                    <div className="type-body-lg text-muted-foreground mt-6">{intro}</div>

                    {sections.map((s) => (
                        <section
                            key={s.id}
                            id={s.id}
                            className="mt-14 scroll-mt-28">
                            <h2 className="type-heading">{s.title}</h2>
                            {s.body}
                        </section>
                    ))}
                </article>
            </div>
        </PageShell>
    )
}

const privacySections: Section[] = [
    {
        id: 'who-has-your-data',
        title: 'Who has your data',
        body: (
            <>
                <P>
                    OpenBots is software you run yourself. There is no OpenBots service holding accounts, and the project doesn’t receive your data: no messages, no contacts, no keys,
                    no analytics.
                </P>
                <P>
                    Whoever runs an OpenBots instance (you, or the person who set it up for you) controls its data and is responsible for it, including keeping it secure and
                    following the privacy laws that apply to them and the people their agents text.
                </P>
            </>
        ),
    },
    {
        id: 'where-it-lives',
        title: 'Where it lives in an instance',
        body: (
            <>
                <P>An OpenBots instance has a few parts, all run by its owner:</P>
                <List
                    items={[
                        <>
                            <B>The engine</B> on the owner’s own computer keeps contacts, conversations and messages in a local encrypted file.
                        </>,
                        <>
                            <B>The backend</B> on the owner’s Convex deployment keeps settings, agents, knowledge docs, numbers, keys saved in Connections (encrypted) and daily counts.
                            It never stores message text.
                        </>,
                        <>
                            <B>The dashboard</B> in the browser shows what the backend holds and nothing more.
                        </>,
                    ]}
                />
                <P>
                    The full breakdown is in the <A href={SECURITY_URL}>security notes</A>.
                </P>
            </>
        ),
    },
    {
        id: 'third-parties',
        title: 'Providers you connect',
        body: (
            <P>
                To reply, the engine sends messages to the AI provider you picked (OpenAI, Anthropic, Google, xAI or a local model) and sends texts through the texting service you
                connected (Twilio, Sendblue, BlueBubbles or Messages on a Mac). Those providers handle that data under their own terms and privacy policies, on your account.
            </P>
        ),
    },
    {
        id: 'this-website',
        title: 'This website',
        body: (
            <P>
                This site describes the project. It has no mailing list, contact form or tracking. A dashboard you sign in to belongs to whoever runs that instance, and they hold
                your account details.
            </P>
        ),
    },
    {
        id: 'questions',
        title: 'Questions',
        body: (
            <P>
                Questions about how OpenBots handles data? <A href={ISSUES_URL}>Open an issue on GitHub</A>.
            </P>
        ),
    },
]

const termsSections: Section[] = [
    {
        id: 'license',
        title: 'License',
        body: (
            <P>
                OpenBots is open-source software released under the <A href={LICENSE_URL}>MIT license</A>. You may use, copy, modify and distribute it under that license’s terms.
                The license text is the agreement that applies; this page just summarizes it.
            </P>
        ),
    },
    {
        id: 'as-is',
        title: 'Provided as is',
        body: (
            <P>
                The software is provided “as is”, without warranty of any kind. The authors and contributors aren’t liable for any claim, damages or other liability arising from
                its use. Agents can make mistakes: review what they do, especially anything that sends, buys or can’t be undone.
            </P>
        ),
    },
    {
        id: 'running-an-instance',
        title: 'Running an instance',
        body: (
            <List
                items={[
                    <>If you run an instance, you’re responsible for it: its data, its security, and how its agents are used.</>,
                    <>
                        You need your own accounts with the AI, texting and hosting providers you use, and you agree to their terms and pay them directly. That includes texting rules
                        like consent and, for US SMS, A2P 10DLC registration.
                    </>,
                    <>There is no OpenBots account, subscription or hosted service, so there’s nothing to cancel with us.</>,
                ]}
            />
        ),
    },
    {
        id: 'questions',
        title: 'Questions',
        body: (
            <P>
                Questions about these terms? <A href={ISSUES_URL}>Open an issue on GitHub</A>.
            </P>
        ),
    },
]

export const PrivacyPage = () => (
    <LegalPage
        title="Privacy"
        intro="OpenBots doesn’t collect your data. Whoever runs an instance owns what’s in it."
        sections={privacySections}
    />
)

export const TermsPage = () => (
    <LegalPage
        title="Terms"
        intro="OpenBots is free, open-source software you run yourself. Here’s what that means."
        sections={termsSections}
    />
)
