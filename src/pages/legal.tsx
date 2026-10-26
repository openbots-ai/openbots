import type { ReactNode } from 'react'
import { PageShell } from '@/pages/page-shell'
import { CONTACT_EMAIL, PRIVACY_EMAIL } from '@/lib/site'

type Section = { id: string; title: string; body: ReactNode }

const LAST_UPDATED = 'October 26, 2026'

const P = ({ children }: { children: ReactNode }) => <p className="type-body text-muted-foreground mt-4">{children}</p>

const List = ({ items }: { items: ReactNode[] }) => (
    <ul className="type-body text-muted-foreground mt-4 list-disc space-y-2 pl-5 marker:text-neutral-300">
        {items.map((item, i) => (
            <li key={i}>{item}</li>
        ))}
    </ul>
)

const Mail = ({ to }: { to: string }) => (
    <a
        href={`mailto:${to}`}
        className="text-foreground underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
        {to}
    </a>
)

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
        id: 'what-we-collect',
        title: 'What we collect',
        body: (
            <>
                <P>We keep only what your agents need to run, in our database:</P>
                <List
                    items={[
                        <>
                            <strong className="text-foreground font-medium">Your account</strong>: your name and email from signing in, and the settings you choose, such as your
                            timezone.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">What you set up</strong>: your agents and their instructions, the notes you give them, their phone
                            numbers, your own phone number and the people you allow to text them.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">Counts, not contents</strong>: how many messages each agent sent and received each day, which AI models it
                            used, and the numbers of the last few strangers it ignored, so you can see who tried to reach it.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">Your engines</strong>: each computer’s name, operating system, version and whether it’s online.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">The API keys you save</strong>, encrypted as described in{' '}
                            <a
                                href="#security"
                                className="text-foreground underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
                                Your keys and security
                            </a>
                            .
                        </>,
                    ]}
                />
                <P>
                    The texts your agents send and receive, and the history of those conversations, are not stored by us. They stay on the computer that runs your engine. We do
                    not use advertising or analytics trackers; our hosting providers keep basic technical logs, such as IP addresses, to run and protect the service.
                </P>
            </>
        ),
    },
    {
        id: 'how-we-use-it',
        title: 'How we use it',
        body: (
            <List
                items={[
                    'To run your agents and show you what they did.',
                    'To keep OpenBots secure, prevent abuse and fix problems.',
                    'To email you about your account or important changes.',
                ]}
            />
        ),
    },
    {
        id: 'agents-and-connected-tools',
        title: 'Your agents',
        body: (
            <>
                <P>
                    Your agents answer only you and the people you allow; texts from anyone else are ignored. Each agent uses only the numbers, notes and AI models you give it, and
                    you can pause or delete any agent at any time.
                </P>
                <P>
                    Your agents run on your engine, with your own accounts: texts go through your Twilio or Sendblue account, and messages go to the AI provider whose key you
                    chose. Those providers handle your data under their own terms, including whether they may train on it, so check their settings.
                </P>
            </>
        ),
    },
    {
        id: 'sharing',
        title: 'Who we share it with',
        body: (
            <>
                <P>We do not sell your personal information. We share it only with:</P>
                <List
                    items={[
                        'Service providers that run OpenBots for us: Convex (our database), Clerk (sign-in), Vercel (this website) and Cloudflare (the tunnel that lets texting services reach your engine).',
                        'Authorities when the law requires it, or when needed to protect the rights and safety of our users or others.',
                        'A buyer or successor if OpenBots is involved in a merger or acquisition, with notice to you.',
                    ]}
                />
            </>
        ),
    },
    {
        id: 'retention',
        title: 'How long we keep it',
        body: (
            <P>
                We keep your information for as long as your account is active. When you ask us to delete your account, we delete your data within 30 days, except where we must
                keep it to meet legal obligations. What’s on your engine’s computer is yours to keep or delete.
            </P>
        ),
    },
    {
        id: 'security',
        title: 'Your keys and security',
        body: (
            <>
                <P>
                    API keys you save in the dashboard, such as your AI provider, Twilio or Sendblue keys, are encrypted with AES-256 before they are stored, using a key kept
                    separately from our database. The dashboard never shows a saved key again. We decrypt a key only to send it to the engines you have connected to your account,
                    which keep it in memory and never write it to disk.
                </P>
                <P>
                    This is not end-to-end encryption: as the operator of OpenBots, we are technically able to decrypt the keys you save. We access them only to run your agents, and
                    we limit who on our side can do that. If you would rather we never hold a key, set it as an environment variable on your engine instead, and it stays on that
                    computer.
                </P>
                <P>
                    Your message history stays on the computer that runs your engine, encrypted with a key that never leaves it. Messages go to the AI provider whose key you
                    chose, so your agents can answer them.
                </P>
                <List
                    items={[
                        'Treat your engine’s token like a password: it unlocks the keys you saved. If you think it has leaked, revoke it in Connections and it stops working right away.',
                        'Set spending limits with your AI and texting providers, so a leaked key can only cost so much.',
                        'Run your engine on a computer you trust, ideally one used for nothing else.',
                    ]}
                />
                <P>
                    We encrypt data in transit and at rest. No system is perfectly secure, so please tell us right away at <Mail to={PRIVACY_EMAIL} /> if you believe your account or
                    a key has been compromised.
                </P>
            </>
        ),
    },
    {
        id: 'your-choices',
        title: 'Your choices',
        body: (
            <>
                <List
                    items={[
                        'Ask for a copy of your data, or ask us to correct or delete it.',
                        'Remove a saved key, revoke an engine or pause any agent at any time in the dashboard.',
                        'Keep a key off our servers entirely by setting it on your engine instead.',
                    ]}
                />
                <P>
                    To make a request, email <Mail to={PRIVACY_EMAIL} />. Depending on where you live, you may have additional rights under local privacy law, and we will honor them.
                </P>
            </>
        ),
    },
    {
        id: 'children',
        title: 'Children',
        body: <P>OpenBots is not intended for anyone under 16, and we do not knowingly collect information from children.</P>,
    },
    {
        id: 'changes',
        title: 'Changes to this policy',
        body: <P>If we make material changes, we will update the date above and let you know by email before they take effect.</P>,
    },
    {
        id: 'contact',
        title: 'Contact us',
        body: (
            <P>
                Questions about privacy? Email <Mail to={PRIVACY_EMAIL} /> and a real person will get back to you.
            </P>
        ),
    },
]

const termsSections: Section[] = [
    {
        id: 'agreement',
        title: 'Agreeing to these terms',
        body: (
            <P>
                By joining early access or using OpenBots, you agree to these terms. If you use OpenBots on behalf of a company, you confirm you have authority to accept them for that
                company.
            </P>
        ),
    },
    {
        id: 'early-access',
        title: 'Early access',
        body: (
            <P>
                OpenBots is in early access. Features may change, break or be removed, and we may limit how many people can use it. OpenBots is free during early access. If we
                introduce paid plans, we will tell you before you are charged anything.
            </P>
        ),
    },
    {
        id: 'your-account',
        title: 'Your account',
        body: (
            <P>
                You need to be at least 16 and provide accurate information to use OpenBots. You are responsible for activity on your account and for keeping your phone and connected
                accounts secure.
            </P>
        ),
    },
    {
        id: 'agents',
        title: 'Working with agents',
        body: (
            <>
                <P>Agents act on your instructions and with the access you grant them. You stay responsible for the work you hand off, including:</P>
                <List
                    items={[
                        'Reviewing what an agent asks you to approve before you approve it.',
                        'Making sure you have the right to connect each tool and to let an agent use it.',
                        'Checking agent output before relying on it for important decisions.',
                    ]}
                />
                <P>AI can make mistakes. Agent output is provided as is, and you should verify anything that matters.</P>
            </>
        ),
    },
    {
        id: 'acceptable-use',
        title: 'Acceptable use',
        body: (
            <>
                <P>Do not use OpenBots to:</P>
                <List
                    items={[
                        'Break the law or violate the rights of others.',
                        'Send spam or unsolicited messages at scale.',
                        'Access systems or data you are not authorized to access.',
                        'Interfere with, reverse engineer or overload the service.',
                    ]}
                />
            </>
        ),
    },
    {
        id: 'your-content',
        title: 'Your content',
        body: (
            <P>
                You own the content you send to OpenBots and the work your agents produce for you. You give us permission to process that content only as needed to run and improve the
                service for you, as described in our{' '}
                <a
                    href="/privacy"
                    className="text-foreground underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
                    Privacy Policy
                </a>
                .
            </P>
        ),
    },
    {
        id: 'third-party-services',
        title: 'Third-party services',
        body: (
            <P>
                OpenBots works with services we do not control, including iMessage and the tools you connect. Their own terms apply to your use of them, and we are not responsible for
                their availability or changes.
            </P>
        ),
    },
    {
        id: 'termination',
        title: 'Ending your use',
        body: (
            <P>
                You can stop using OpenBots and delete your account at any time. We may suspend or end access if you break these terms or if we need to protect the service or other
                users.
            </P>
        ),
    },
    {
        id: 'liability',
        title: 'Disclaimers and liability',
        body: (
            <P>
                OpenBots is provided as is, without warranties of any kind. To the extent the law allows, OpenBots is not liable for indirect or consequential damages, and our total
                liability is limited to the amount you paid us in the 12 months before the claim.
            </P>
        ),
    },
    {
        id: 'changes',
        title: 'Changes to these terms',
        body: <P>We may update these terms as OpenBots grows. We will update the date above and give you notice of material changes before they take effect.</P>,
    },
    {
        id: 'contact',
        title: 'Contact us',
        body: (
            <P>
                Questions about these terms? Email <Mail to={CONTACT_EMAIL} />.
            </P>
        ),
    },
]

export const PrivacyPage = () => (
    <LegalPage
        title="Privacy Policy"
        intro="OpenBots lets you build AI assistants you can text. They only work well if you can trust them with your information, so this page explains plainly what we collect, why, and the control you have over it."
        sections={privacySections}
    />
)

export const TermsPage = () => (
    <LegalPage
        title="Terms of Service"
        intro="These terms cover your use of OpenBots during early access. We have kept them short and in plain language."
        sections={termsSections}
    />
)
