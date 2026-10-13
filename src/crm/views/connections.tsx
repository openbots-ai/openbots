import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, Bot, Check, Copy, ExternalLink, HardDrive, Laptop, Mail, MessageCircle, MessageSquareText, RefreshCw, Smartphone, Waypoints, type LucideIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { hashToken, newToken } from '@convex/lib/tokens'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ProviderMark } from '@/components/agent-config-bar'
import runner from '../../../runner/package.json'
import { relativeTime } from '../lib/time'
import { useNav } from '../nav'
import { useNow } from '../use-now'
import { useRun } from '../use-run'
import { Btn, ConfirmDelete, Content, Scroll, Toolbar } from '../ui'

// Your agents, and what they have set up. Keys and account logins are set on the agent itself (environment
// variables on the machine it runs on), so this page never sees them; it shows what the agents report.

type Runner = Omit<Doc<'runners'>, 'tokenHash'>
type Service = NonNullable<Doc<'runners'>['services']>[number]['service']
type Channel = Doc<'numbers'>['channel']

type Info = {
    name: string
    // One line on what it does
    blurb: string
    // The environment variables to set on the agent
    env: string[]
    getUrl?: string
    getLabel?: string
    steps: ReactNode[]
    icon?: LucideIcon
    // Shown once set up: what to do next
    next?: { label: string; view: 'numbers' | 'settings' | 'models' }
    badge?: string
}

const AI = ['openai', 'anthropic', 'google', 'xai', 'local'] as const
type Ai = (typeof AI)[number]
// Texting cards: the accounts, plus Messages on the agent's Mac and a relay, which aren't accounts
type Texting = 'mac' | 'bluebubbles' | 'sendblue' | 'twilio' | 'relay'
const TEXTING: Texting[] = ['mac', 'bluebubbles', 'sendblue', 'twilio', 'relay']

const INFO: Record<Ai | Texting | 'resend', Info> = {
    openai: {
        name: 'OpenAI',
        blurb: 'Agents can use any chat model your OpenAI key has access to.',
        env: ['OPENAI_API_KEY'],
        getUrl: 'https://platform.openai.com/api-keys',
        getLabel: 'Get an OpenAI key',
        steps: ['Sign in to the OpenAI platform and create a secret key.', 'Set it on your agent and restart it.'],
        next: { label: 'Pick models', view: 'models' },
    },
    anthropic: {
        name: 'Anthropic',
        blurb: 'Agents can use any Claude model your Anthropic key has access to.',
        env: ['ANTHROPIC_API_KEY'],
        getUrl: 'https://console.anthropic.com/settings/keys',
        getLabel: 'Get an Anthropic key',
        steps: ['Sign in to the Claude Console and create an API key.', 'Set it on your agent and restart it.'],
        next: { label: 'Pick models', view: 'models' },
    },
    google: {
        name: 'Google Gemini',
        blurb: 'Agents can use any Gemini model your key has access to.',
        env: ['GEMINI_API_KEY'],
        getUrl: 'https://aistudio.google.com/apikey',
        getLabel: 'Get a Gemini key',
        steps: ['Open Google AI Studio and create an API key.', 'Set it on your agent and restart it.'],
        next: { label: 'Pick models', view: 'models' },
    },
    xai: {
        name: 'xAI',
        blurb: 'Agents can use any Grok model your xAI key has access to.',
        env: ['XAI_API_KEY'],
        getUrl: 'https://console.x.ai',
        getLabel: 'Get an xAI key',
        steps: ['Sign in to the xAI console and create an API key.', 'Set it on your agent and restart it.'],
        next: { label: 'Pick models', view: 'models' },
    },
    local: {
        name: 'Local models',
        blurb: 'Models on your own hardware, through Ollama, LM Studio or any OpenAI-compatible server. Nothing leaves your machines.',
        env: ['OPENBOTS_LOCAL_URL'],
        getUrl: 'https://ollama.com/download',
        getLabel: 'Get Ollama',
        steps: ['Run a model server the agent can reach, e.g. Ollama.', 'Set its URL on your agent (for Ollama, http://localhost:11434/v1) and restart it.'],
        icon: HardDrive,
        next: { label: 'Pick models', view: 'models' },
        badge: 'Private',
    },
    mac: {
        name: 'Messages on a Mac',
        blurb: 'iMessage straight from the Mac your agent runs on, signed in to Messages. One-to-one chats.',
        env: ['OPENBOTS_MAC=true'],
        steps: ['Run the agent on a Mac that stays on and is signed in to Messages.', 'Give the app running it Full Disk Access, and let it control Messages when asked.', 'On by default on a Mac with no other texting set up.'],
        icon: Laptop,
        next: { label: 'Add your iMessage address', view: 'numbers' },
        badge: 'iMessage',
    },
    bluebubbles: {
        name: 'BlueBubbles',
        blurb: 'iMessage from your own Mac, free, with group chats. The agent can run elsewhere.',
        env: ['BLUEBUBBLES_URL', 'BLUEBUBBLES_PASSWORD', 'OPENBOTS_PUBLIC_URL'],
        getUrl: 'https://bluebubbles.app/install',
        getLabel: 'Install BlueBubbles Server',
        steps: [
            'On a Mac that stays on and is signed in to Messages, install BlueBubbles Server and set a password.',
            'Set its URL and password on your agent, plus OPENBOTS_PUBLIC_URL: where the Mac can reach the agent.',
            'The agent registers its webhook on your Mac when it starts.',
        ],
        icon: MessageCircle,
        next: { label: 'Add your iMessage address', view: 'numbers' },
        badge: 'iMessage',
    },
    sendblue: {
        name: 'Sendblue',
        blurb: 'iMessage without a Mac, on your Sendblue line. Group chats need a plan that includes them.',
        env: ['SENDBLUE_API_KEY_ID', 'SENDBLUE_API_SECRET', 'OPENBOTS_PUBLIC_URL'],
        getUrl: 'https://dashboard.sendblue.com',
        getLabel: 'Open Sendblue',
        steps: ['Create a Sendblue account and get a line.', 'Set the API key ID and secret on your agent, plus OPENBOTS_PUBLIC_URL: where Sendblue can reach the agent.', 'The agent registers its webhook with Sendblue when it starts.'],
        icon: MessageSquareText,
        next: { label: 'Add your Sendblue line', view: 'numbers' },
        badge: 'iMessage',
    },
    twilio: {
        name: 'Twilio',
        blurb: 'Regular texts (SMS) on numbers you buy in your own Twilio account, right from this dashboard.',
        env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'OPENBOTS_PUBLIC_URL'],
        getUrl: 'https://console.twilio.com',
        getLabel: 'Open the Twilio console',
        steps: [
            'Create a Twilio account (Twilio bills you directly for numbers and texts).',
            'Set the Account SID and Auth token on your agent, plus OPENBOTS_PUBLIC_URL: where Twilio can reach the agent.',
            'Get a number in Numbers. Texting US numbers needs A2P 10DLC registration in Twilio.',
        ],
        icon: Smartphone,
        next: { label: 'Get a number', view: 'numbers' },
        badge: 'SMS',
    },
    relay: {
        name: 'Your own relay',
        blurb: 'Anything that can post texts to the agent and send its replies. See runner/README.md for the protocol.',
        env: ['OPENBOTS_INBOUND_SECRET', 'OPENBOTS_RELAY_URL'],
        steps: ['Run a relay that posts each text to the agent’s /inbound and sends the replies it posts back.', 'Set the shared secret and the relay’s URL on your agent.'],
        icon: Waypoints,
        next: { label: 'Add its number', view: 'numbers' },
    },
    resend: {
        name: 'Resend',
        blurb: 'Your agent also emails you handoffs and new contacts at the email in Settings, without quoting anyone.',
        env: ['RESEND_API_KEY', 'RESEND_FROM'],
        getUrl: 'https://resend.com/api-keys',
        getLabel: 'Get a Resend key',
        steps: ['Create a Resend account and verify a domain you own.', 'Set an API key and a from address on that domain on your agent.'],
        icon: Mail,
        next: { label: 'Choose notifications', view: 'settings' },
    },
}

// What the agents report for one card: set up (with a label), or set up but failing, or not set up
function statusOf(runners: Runner[], id: Ai | Texting | 'resend') {
    if (id === 'mac' || id === 'relay') return runners.some((r) => r.channels?.includes(id as Channel)) ? { ok: true as const, label: `On ${runners.filter((r) => r.channels?.includes(id as Channel)).map((r) => r.name).join(', ')}` } : null
    const entries = runners.flatMap((r) => (r.services ?? []).filter((s) => s.service === (id as Service)).map((s) => ({ ...s, runner: r.name })))
    const good = entries.find((e) => !e.error)
    if (good) return { ok: true as const, label: good.label ?? `On ${good.runner}` }
    return entries[0] ? { ok: false as const, label: `${entries[0].runner}: ${entries[0].error}` } : null
}

export function ConnectionsView() {
    const runners = useQuery(api.runners.list)
    const hasAi = runners?.some((r) => r.models?.length)

    const section = (title: string, description: string, ids: (Ai | Texting | 'resend')[], cols: string) => (
        <section className="space-y-3">
            <div>
                <h2 className="text-[14px] font-semibold">{title}</h2>
                <p className="text-[13px] text-neutral-500">{description}</p>
            </div>
            <div className={cn('grid gap-3', cols)}>{ids.map((id) => (runners ? <ServiceCard key={id} id={id} runners={runners} /> : <Skeleton key={id} className="h-40 rounded-lg" />))}</div>
        </section>
    )

    return (
        <Content>
            <Toolbar title="Connections">
                <span className="text-[12px] text-neutral-500">Keys and accounts live on your agent, on a machine you choose. This page only sees what’s set up.</span>
            </Toolbar>
            <Scroll>
                <div className="mx-auto w-full max-w-5xl space-y-8 p-4 pb-16">
                    <Agents runners={runners} />
                    {runners && runners.length > 0 && !hasAi && (
                        <Card className="flex flex-row items-start gap-3 rounded-lg border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <span>Your agents can’t reply until your agent has at least one AI key or a local model server. You pay the provider directly for what your agents use.</span>
                        </Card>
                    )}
                    {section('AI models', 'Agents write their replies with these. Your agent checks which models each key can use; pick them on the Models page.', [...AI], 'sm:grid-cols-2 xl:grid-cols-3')}
                    {section('Texting', 'Where your agents send and receive messages. Set one up on your agent, then add its number in Numbers.', TEXTING, 'sm:grid-cols-2 xl:grid-cols-3')}
                    {section('Email', 'Optional. Your agent always texts you handoffs; this also emails them.', ['resend'], 'sm:grid-cols-2 xl:grid-cols-3')}
                </div>
            </Scroll>
        </Content>
    )
}

function ServiceCard({ id, runners }: { id: Ai | Texting | 'resend'; runners: Runner[] }) {
    const go = useNav()
    const info = INFO[id]
    const Icon = info.icon
    const status = statusOf(runners, id)
    const ai = (AI as readonly string[]).includes(id)
    const models = ai ? runners.flatMap((r) => r.models ?? []).filter((m) => m.provider === id) : []
    const count = new Set(models.map((m) => m.id)).size

    return (
        <Card className="flex flex-col gap-3 rounded-lg p-4">
            <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                    {ai && id !== 'local' ? <ProviderMark provider={id as 'openai'} className="size-5" /> : Icon && <Icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
                        {info.name}
                        {info.badge && <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-normal">{info.badge}</Badge>}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-neutral-500">{info.blurb}</p>
                </div>
            </div>

            {status ? (
                <div className="space-y-1">
                    <p className={cn('flex items-center gap-1.5 text-[12px]', status.ok ? 'text-emerald-700' : 'text-destructive')}>
                        {status.ok ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                        <span className="truncate">{status.ok ? (ai ? 'Set up on your agent' : status.label) : status.label}</span>
                    </p>
                    {ai && status.ok && <p className="text-[12px] text-neutral-500">{count} model{count === 1 ? '' : 's'} this key can use. Re-check after you get access to a new one.</p>}
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-[12px] text-neutral-400">Not set up</p>
                    <ol className="space-y-1 text-[12px] text-neutral-600">
                        {info.steps.map((step, i) => (
                            <li key={i} className="flex gap-1.5">
                                <span className="text-neutral-400">{i + 1}.</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="flex flex-wrap gap-1">
                        {info.env.map((e) => (
                            <code key={e} className="rounded bg-neutral-100 px-1 font-mono text-[11px] text-neutral-700">
                                {e}
                            </code>
                        ))}
                    </p>
                </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {status?.ok && info.next && (
                    <Btn variant="primary" onClick={() => go(info.next!.view)}>
                        {info.next.label}
                    </Btn>
                )}
                {status && ai && <Recheck />}
                {!status && info.getUrl && (
                    <a href={info.getUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-900 underline-offset-2 hover:underline">
                        {info.getLabel}
                        <ExternalLink className="size-3" />
                    </a>
                )}
            </div>
        </Card>
    )
}

// Asks the agents to check their keys again now, and spins until one has
function Recheck() {
    const run = useRun()
    const request = useMutation(api.tasks.request)
    const [taskId, setTaskId] = useState<Id<'tasks'> | null>(null)
    const task = useQuery(api.tasks.get, taskId ? { id: taskId } : 'skip')
    const checking = !!taskId && task?.status !== 'done' && task?.status !== 'failed'
    return (
        <Btn
            variant="ghost"
            size="icon-sm"
            aria-label="Check the keys again"
            title="Check again"
            disabled={checking}
            onClick={async () => {
                const res = await run(request({ request: { kind: 'recheck' } }))
                if (res.ok) setTaskId(res.value)
            }}>
            <RefreshCw className={cn(checking && 'animate-spin')} />
        </Btn>
    )
}

// The agent checks in every minute; a few missed beats and it shows as offline
const ONLINE_MS = 3 * 60_000
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string

// The agents you run, with tokens made here in the browser (Convex only ever gets a hash)
function Agents({ runners }: { runners?: Runner[] }) {
    const create = useMutation(api.runners.create)
    const revoke = useMutation(api.runners.revoke)
    const run = useRun()
    const now = useNow(30_000)
    const [name, setName] = useState('')
    const [token, setToken] = useState<string | null>(null)

    const add = async () => {
        const fresh = newToken()
        const res = await run(create({ name, tokenHash: await hashToken(fresh) }))
        if (res.ok) {
            setToken(fresh)
            setName('')
        }
    }

    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-[14px] font-semibold">Your agent</h2>
                <p className="text-[13px] text-neutral-500">The program that answers your texts, on a machine you choose. Messages, contacts and keys stay on it; this dashboard never sees them.</p>
            </div>
            <Card className="divide-y divide-neutral-100 rounded-lg p-0">
                {runners === undefined ? (
                    <div className="p-4">
                        <Skeleton className="h-12" />
                    </div>
                ) : (
                    runners.map((r) => {
                        const online = !!r.lastSeenAt && now - r.lastSeenAt < ONLINE_MS
                        return (
                            <div key={r._id} className="flex items-center gap-3 px-4 py-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                                    <Bot className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-2 text-[13px] font-medium">
                                        <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-neutral-300')} aria-hidden />
                                        {r.name}
                                    </p>
                                    <p className="truncate text-[12px] text-neutral-500">
                                        {r.lastSeenAt
                                            ? `${online ? 'Online' : `Offline, last seen ${relativeTime(r.lastSeenAt, now)}`} · v${r.version}${r.channels?.length ? ` · texts through ${r.channels.join(', ')}` : ''}${r.demo ? ' · demo replies' : ''}`
                                            : 'Never connected. Start it with the token you copied.'}
                                    </p>
                                </div>
                                <ConfirmDelete label="Revoke" what={`${r.name}'s token`} onConfirm={() => void run(revoke({ id: r._id }))} />
                            </div>
                        )
                    })
                )}
                <form
                    className="flex flex-wrap items-center gap-2 px-4 py-3"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void add()
                    }}>
                    <span className="min-w-0 flex-1 text-[12px] text-neutral-500">{runners?.length ? 'Add another machine:' : 'Name the machine it will run on to get a token:'}</span>
                    <Input aria-label="Agent name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mac mini" className="h-8 w-44" />
                    <Btn type="submit" variant="primary" disabled={!name.trim()}>
                        Add agent
                    </Btn>
                </form>
                {token && <Setup token={token} onDone={() => setToken(null)} />}
            </Card>
        </section>
    )
}

// Shown once after adding an agent: the token and how to start it. Versions are pinned so an agent only changes
// when you choose to upgrade it.
function Setup({ token, onDone }: { token: string; onDone: () => void }) {
    const mac = `OPENBOTS_CONVEX_URL=${CONVEX_URL} \\\nOPENBOTS_TOKEN=${token} \\\nOPENAI_API_KEY=sk-... \\\nnpx openbots-runner@${runner.version}`
    const docker = `docker run -d --name openbots -v openbots:/data -p 8787:8787 \\\n  -e OPENBOTS_CONVEX_URL=${CONVEX_URL} \\\n  -e OPENBOTS_TOKEN=${token} \\\n  -e OPENBOTS_PUBLIC_URL=https://<where your accounts reach it> \\\n  -e OPENAI_API_KEY=sk-... \\\n  ghcr.io/shidhartha-sen/openbots-runner:${runner.version}`
    return (
        <div className="space-y-3 bg-neutral-50 px-4 py-4">
            <p className="text-[13px] text-neutral-700">
                Copy this token now. It isn’t stored anywhere, so it can’t be shown again. Add the keys and accounts from the cards below as more variables, then restart the agent.
            </p>
            <CopyBlock label="Token" text={token} />
            <CopyBlock label="On a Mac signed in to iMessage" text={mac} />
            <CopyBlock label="Anywhere else, with Docker" text={docker} />
            <Btn onClick={onDone}>I’ve copied it</Btn>
        </div>
    )
}

function CopyBlock({ label, text }: { label: string; text: string }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }
    return (
        <div className="space-y-1">
            <span className="flex items-center justify-between text-[12px] text-neutral-500">
                {label}
                <Btn variant="ghost" size="icon-sm" aria-label={`Copy ${label.toLowerCase()}`} onClick={copy}>
                    {copied ? <Check /> : <Copy />}
                </Btn>
            </span>
            <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-white p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800">{text}</pre>
        </div>
    )
}
