import type { ReactNode } from 'react'
import { PageShell } from '@/pages/page-shell'
import { CONTACT_EMAIL, PRIVACY_EMAIL } from '@/lib/site'

type Section = { id: string; title: string; body: ReactNode }

const LAST_UPDATED = 'October 6, 2026'

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
                <P>We collect only what we need to run OpenDots and improve it:</P>
                <List
                    items={[
                        <>
                            <strong className="text-foreground font-medium">Contact details</strong> you give us, such as the phone number you leave for early access or the name and
                            email you send through our contact form.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">Messages</strong> you exchange with your agents in iMessage, and the instructions, files and approvals
                            inside them.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">Connected account data</strong> from the tools you choose to connect, such as your inbox, CRM or calendar,
                            limited to what an agent needs for the work you hand it.
                        </>,
                        <>
                            <strong className="text-foreground font-medium">Usage and device data</strong>, such as pages visited on our site, browser type and approximate location
                            from your IP address.
                        </>,
                    ]}
                />
            </>
        ),
    },
    {
        id: 'how-we-use-it',
        title: 'How we use it',
        body: (
            <List
                items={[
                    'To run your agents and complete the tasks you give them.',
                    'To text you about early access, your account and the work your agents are doing.',
                    'To keep OpenDots secure, prevent abuse and fix problems.',
                    'To understand how the product is used so we can improve it.',
                ]}
            />
        ),
    },
    {
        id: 'agents-and-connected-tools',
        title: 'Agents and connected tools',
        body: (
            <>
                <P>
                    Each agent only gets access to the tools you grant it, and you can remove that access at any time. Agents ask for your approval before sending anything important,
                    such as emails, payments or messages to your customers.
                </P>
                <P>Every action an agent takes is recorded in an activity log you can review. We do not use the contents of your connected accounts to advertise to you.</P>
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
                        'Service providers that host, secure and operate OpenDots for us, under contracts that limit how they can use it.',
                        'AI model providers that process prompts and content to power your agents, without the right to train on your data.',
                        'Authorities when the law requires it, or when needed to protect the rights and safety of our users or others.',
                        'A buyer or successor if OpenDots is involved in a merger or acquisition, with notice to you.',
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
                We keep your information for as long as your account is active or as needed to provide the service. When you delete your account, we delete or anonymize your data within
                30 days, except where we must keep it to meet legal obligations.
            </P>
        ),
    },
    {
        id: 'security',
        title: 'Security',
        body: (
            <P>
                We encrypt data in transit and at rest, keep credentials for connected tools in isolated, access-controlled storage and limit employee access to what is needed to support
                you. No system is perfectly secure, so please tell us right away if you believe your account has been compromised.
            </P>
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
                        'Disconnect any tool or pause any agent at any time.',
                        'Stop receiving texts from us by replying STOP.',
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
        body: <P>OpenDots is not intended for anyone under 16, and we do not knowingly collect information from children.</P>,
    },
    {
        id: 'changes',
        title: 'Changes to this policy',
        body: <P>If we make material changes, we will update the date above and let you know by text or email before they take effect.</P>,
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
                By joining early access or using OpenDots, you agree to these terms. If you use OpenDots on behalf of a company, you confirm you have authority to accept them for that
                company.
            </P>
        ),
    },
    {
        id: 'early-access',
        title: 'Early access',
        body: (
            <P>
                OpenDots is in early access. Features may change, break or be removed, and we may limit how many people can use it. OpenDots is free during early access. If we
                introduce paid plans, we will tell you before you are charged anything.
            </P>
        ),
    },
    {
        id: 'your-account',
        title: 'Your account',
        body: (
            <P>
                You need to be at least 16 and provide accurate information to use OpenDots. You are responsible for activity on your account and for keeping your phone and connected
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
                <P>Do not use OpenDots to:</P>
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
                You own the content you send to OpenDots and the work your agents produce for you. You give us permission to process that content only as needed to run and improve the
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
                OpenDots works with services we do not control, including iMessage and the tools you connect. Their own terms apply to your use of them, and we are not responsible for
                their availability or changes.
            </P>
        ),
    },
    {
        id: 'termination',
        title: 'Ending your use',
        body: (
            <P>
                You can stop using OpenDots and delete your account at any time. We may suspend or end access if you break these terms or if we need to protect the service or other
                users.
            </P>
        ),
    },
    {
        id: 'liability',
        title: 'Disclaimers and liability',
        body: (
            <P>
                OpenDots is provided as is, without warranties of any kind. To the extent the law allows, OpenDots is not liable for indirect or consequential damages, and our total
                liability is limited to the amount you paid us in the 12 months before the claim.
            </P>
        ),
    },
    {
        id: 'changes',
        title: 'Changes to these terms',
        body: <P>We may update these terms as OpenDots grows. We will update the date above and give you notice of material changes before they take effect.</P>,
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
        intro="OpenDots puts AI agents in your iMessage. They only work well if you can trust them with your information, so this page explains plainly what we collect, why, and the control you have over it."
        sections={privacySections}
    />
)

export const TermsPage = () => (
    <LegalPage
        title="Terms of Service"
        intro="These terms cover your use of OpenDots during early access. We have kept them short and in plain language."
        sections={termsSections}
    />
)
