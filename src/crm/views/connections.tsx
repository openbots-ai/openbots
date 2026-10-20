import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, Bot, Check, Copy, ExternalLink, HardDrive, Laptop, Mail, MessageCircle, MessageSquareText, RefreshCw, Smartphone, Waypoints, type LucideIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { SEALED_SERVICES, type SealedService } from '@convex/lib/sealed'
import { hashToken, newToken } from '@convex/lib/tokens'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ProviderMark } from '@/components/agent-config-bar'
import { KeyForm, type Saved } from '../key-form'
import { OrgoControls, OrgoCreate } from '../orgo'
import { TestText } from '../test-text'
import { relativeTime } from '../lib/time'
import { MIN_NODE, NODE_URL, setupSteps, SYSTEMS, thisSystem, type System } from '../lib/setup-steps'
import { useNav } from '../nav'
import { useNow } from '../use-now'
import { useRun } from '../use-run'
import { Btn, ConfirmDelete, Content, Scroll, Toolbar } from '../ui'

// Your engines, and what they have set up. Keys and account logins are saved here once for your whole account (the
// backend stores them encrypted) or set as environment variables on an engine; this page shows what the engines report.

type Runner = Omit<Doc<'runners'>, 'tokenHash'>
type Service = NonNullable<Doc<'runners'>['services']>[number]['service']
type Channel = Doc<'numbers'>['channel']

type Info = {
    name: string
    // One line on what it does
    blurb: string
    // The environment variables to set on the engine
    env: string[]
    getUrl?: string
    getLabel?: string
    steps: ReactNode[]
    icon?: LucideIcon
    // Shown once set up: what to do next
    next?: { label: string; view: 'numbers' | 'settings' | 'models' }
    badge?: string
    // Something to know before relying on it, shown whether or not it's set up
    notice?: ReactNode
}

const DocLink = ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
        {children}
    </a>
)

const AI = ['openai', 'anthropic', 'google', 'xai', 'local'] as const
type Ai = (typeof AI)[number]
// Texting cards: the accounts, plus Messages on the engine's Mac and a relay, which aren't accounts
type Texting = 'mac' | 'bluebubbles' | 'sendblue' | 'twilio' | 'relay'
const TEXTING: Texting[] = ['mac', 'bluebubbles', 'sendblue', 'twilio', 'relay']

const INFO: Record<Ai | Texting | 'resend', Info> = {
    openai: {
        name: 'OpenAI',
        blurb: 'Agents can use any chat model your OpenAI key has access to.',
        env: ['OPENAI_API_KEY'],
        getUrl: 'https://platform.openai.com/api-keys',
        getLabel: 'Get an OpenAI key',
        steps: ['Sign in to the OpenAI platform and create a secret key.', 'Paste it here, or set it on your engine.'],
        next: { label: 'Pick models', view: 'models' },
    },
    anthropic: {
        name: 'Anthropic',
        blurb: 'Agents can use any Claude model your Anthropic key has access to.',
        env: ['ANTHROPIC_API_KEY'],
        getUrl: 'https://console.anthropic.com/settings/keys',
        getLabel: 'Get an Anthropic key',
        steps: ['Sign in to the Claude Console and create an API key.', 'Paste it here, or set it on your engine.'],
        next: { label: 'Pick models', view: 'models' },
    },
    google: {
        name: 'Google Gemini',
        blurb: 'Agents can use any Gemini model your key has access to.',
        env: ['GEMINI_API_KEY'],
        getUrl: 'https://aistudio.google.com/apikey',
        getLabel: 'Get a Gemini key',
        steps: ['Open Google AI Studio and create an API key.', 'Paste it here, or set it on your engine.'],
        next: { label: 'Pick models', view: 'models' },
    },
    xai: {
        name: 'xAI',
        blurb: 'Agents can use any Grok model your xAI key has access to.',
        env: ['XAI_API_KEY'],
        getUrl: 'https://console.x.ai',
        getLabel: 'Get an xAI key',
        steps: ['Sign in to the xAI console and create an API key.', 'Paste it here, or set it on your engine.'],
        next: { label: 'Pick models', view: 'models' },
    },
    local: {
        name: 'Local models',
        blurb: 'Models on your own hardware, through Ollama, LM Studio or any OpenAI-compatible server. Nothing leaves your machines.',
        env: ['OPENBOTS_LOCAL_URL'],
        getUrl: 'https://ollama.com/download',
        getLabel: 'Get Ollama',
        steps: ['Run a model server the engine can reach, e.g. Ollama.', 'Enter its URL here (for Ollama, http://localhost:11434/v1), or set it on your engine.'],
        icon: HardDrive,
        next: { label: 'Pick models', view: 'models' },
        badge: 'Private',
    },
    mac: {
        name: 'Messages on a Mac',
        blurb: 'iMessage straight from the Mac your engine runs on, signed in to Messages. One-to-one chats.',
        env: ['OPENBOTS_MAC=true'],
        steps: ['Run the engine on a Mac that stays on and is signed in to Messages.', 'Give the app running it Full Disk Access, and let it control Messages when asked.', 'On by default on a Mac with no other texting set up.'],
        icon: Laptop,
        next: { label: 'Add your iMessage address', view: 'numbers' },
        badge: 'iMessage',
    },
    bluebubbles: {
        name: 'BlueBubbles',
        blurb: 'iMessage from your own Mac, free, with group chats. The engine can run elsewhere.',
        // OPENBOTS_PUBLIC_URL here is any address your Mac can reach the engine at, private or public
        env: ['BLUEBUBBLES_URL', 'BLUEBUBBLES_PASSWORD', 'OPENBOTS_PUBLIC_URL'],
        getUrl: 'https://bluebubbles.app/install',
        getLabel: 'Install BlueBubbles Server',
        steps: [
            'On a Mac that stays on and is signed in to Messages, install BlueBubbles Server and set a password.',
            'Enter its URL and password here (or set them on your engine).',
            'Give the engine an address your Mac can reach in Public URL above. It doesn’t have to be public: on the same Mac, http://127.0.0.1:8787 works; from another machine on your network, use its private address and start the engine with OPENBOTS_HOST=0.0.0.0.',
            'The engine registers its webhook on your Mac when it starts.',
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
        steps: ['Create a Sendblue account and get a line.', 'Enter the API key ID and secret here (or set them on your engine), plus this engine’s public URL above.', 'The engine registers its webhook with Sendblue when it starts.'],
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
            'Enter the Account SID and Auth token here (or set them on your engine), plus this engine’s public URL above.',
            'Get a number in Numbers.',
        ],
        notice: (
            <>
                <span className="font-medium">Texting US numbers needs registration first.</span> Twilio blocks texts from a US local number until its{' '}
                <DocLink href="https://www.twilio.com/docs/messaging/compliance/a2p-10dlc">A2P 10DLC registration</DocLink> is approved, which takes days to weeks. A toll-free
                number with <DocLink href="https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding">toll-free verification</DocLink> is the alternative. A{' '}
                <DocLink href="https://www.twilio.com/docs/messaging/guides/how-to-use-your-free-trial-account">trial account</DocLink> can only text numbers you’ve verified in Twilio.
            </>
        ),
        icon: Smartphone,
        next: { label: 'Get a number', view: 'numbers' },
        badge: 'SMS',
    },
    relay: {
        name: 'Your own relay',
        blurb: 'Anything that can post texts to the engine and send its replies. See runner/README.md for the protocol.',
        env: ['OPENBOTS_INBOUND_SECRET', 'OPENBOTS_RELAY_URL'],
        steps: ['Run a relay that posts each text to the engine’s /inbound and sends the replies it posts back.', 'Set the shared secret and the relay’s URL on your engine.'],
        icon: Waypoints,
        next: { label: 'Add its number', view: 'numbers' },
    },
    resend: {
        name: 'Resend',
        blurb: 'Your engine also emails you handoffs and new contacts at the email in Settings, without quoting anyone.',
        env: ['RESEND_API_KEY', 'RESEND_FROM'],
        getUrl: 'https://resend.com/api-keys',
        getLabel: 'Get a Resend key',
        steps: ['Create a Resend account and verify a domain you own.', 'Enter an API key and a from address on that domain here, or set them on your engine.'],
        icon: Mail,
        next: { label: 'Choose notifications', view: 'settings' },
    },
}

// What the engines report for one card: set up (with a label), or set up but failing, or not set up
function statusOf(runners: Runner[], id: Ai | Texting | 'resend') {
    if (id === 'mac' || id === 'relay') return runners.some((r) => r.channels?.includes(id as Channel)) ? { ok: true as const, label: `On ${runners.filter((r) => r.channels?.includes(id as Channel)).map((r) => r.name).join(', ')}` } : null
    const entries = runners.flatMap((r) => (r.services ?? []).filter((s) => s.service === (id as Service)).map((s) => ({ ...s, runner: r.name })))
    const good = entries.find((e) => !e.error)
    if (good) return { ok: true as const, label: good.label ?? `On ${good.runner}` }
    return entries[0] ? { ok: false as const, label: `${entries[0].runner}: ${entries[0].error}` } : null
}

export function ConnectionsView() {
    const runners = useQuery(api.runners.list)
    const saved = useQuery(api.secrets.list)
    const hasAi = runners?.some((r) => r.models?.length)

    const section = (title: string, description: string, ids: (Ai | Texting | 'resend')[], cols: string) => (
        <section className="space-y-3">
            <div>
                <h2 className="text-[14px] font-semibold">{title}</h2>
                <p className="text-[13px] text-neutral-500">{description}</p>
            </div>
            <div className={cn('grid gap-3', cols)}>{ids.map((id) => (runners ? <ServiceCard key={id} id={id} runners={runners} saved={saved?.find((s) => s.service === id)} /> : <Skeleton key={id} className="h-40 rounded-lg" />))}</div>
        </section>
    )

    return (
        <Content>
            <Toolbar title="Connections">
                <span className="text-[12px] text-neutral-500">Keys you save here are encrypted and used by all your agents.</span>
            </Toolbar>
            <Scroll>
                <div className="mx-auto w-full max-w-5xl space-y-8 p-4 pb-16">
                    <Engines runners={runners} orgoKey={saved?.find((s) => s.service === 'orgo')} webhooks={!!saved?.some((s) => s.service === 'twilio' || s.service === 'sendblue') || !!runners?.some((r) => r.services?.some((s) => s.service === 'twilio' || s.service === 'sendblue'))} />
                    {runners && runners.length > 0 && !hasAi && (
                        <Card className="flex flex-row items-start gap-3 rounded-lg border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <span>Your agents can’t reply until your engine has at least one AI key or a local model server. You pay the provider directly for what your agents use.</span>
                        </Card>
                    )}
                    {section('AI models', 'Agents write their replies with these. Your engine checks which models each key can use; pick them on the Models page.', [...AI], 'sm:grid-cols-2 xl:grid-cols-3')}
                    {section('Texting', 'Where your agents send and receive messages. Set one up in the cards below, then add its number in Numbers.', TEXTING, 'sm:grid-cols-2 xl:grid-cols-3')}
                    {section('Email', 'Optional. Your engine always texts you handoffs; this also emails them.', ['resend'], 'sm:grid-cols-2 xl:grid-cols-3')}
                </div>
            </Scroll>
        </Content>
    )
}

function ServiceCard({ id, runners, saved }: { id: Ai | Texting | 'resend'; runners: Runner[]; saved?: Saved }) {
    const go = useNav()
    const info = INFO[id]
    const Icon = info.icon
    const status = statusOf(runners, id)
    const ai = (AI as readonly string[]).includes(id)
    const models = ai ? runners.flatMap((r) => r.models ?? []).filter((m) => m.provider === id) : []
    const sealed = (SEALED_SERVICES as readonly string[]).includes(id)
    const envChips = (
        <p className="flex flex-wrap gap-1">
            {info.env.map((e) => (
                <code key={e} className="rounded bg-neutral-100 px-1 font-mono text-[11px] text-neutral-700">
                    {e}
                </code>
            ))}
        </p>
    )
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

            {info.notice && <p className="rounded-md bg-amber-50 p-2.5 text-[12px] leading-snug text-amber-900">{info.notice}</p>}
            {status && (
                <div className="space-y-1">
                    <p className={cn('flex items-center gap-1.5 text-[12px]', status.ok ? 'text-emerald-700' : 'text-destructive')}>
                        {status.ok ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                        <span className="truncate">{status.ok ? (ai ? 'Set up on your engine' : status.label) : status.label}</span>
                    </p>
                    {ai && status.ok && <p className="text-[12px] text-neutral-500">{count} model{count === 1 ? '' : 's'} this key can use. Re-check after you get access to a new one.</p>}
                </div>
            )}
            {sealed ? (
                <div className="space-y-1">
                    <p className="text-[12px] text-neutral-400">Or set on your engine:</p>
                    {envChips}
                </div>
            ) : (
                !status && (
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
                        {envChips}
                    </div>
                )
            )}

            <div className={cn('flex flex-wrap items-center gap-2', !sealed && 'mt-auto pt-1')}>
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
            {id === 'twilio' && status?.ok && <TestText />}
            {/* The key controls sit at the bottom of every card, full width, so they line up across a row */}
            {sealed && (
                <div className="mt-auto pt-1">
                    <KeyForm service={id as SealedService} saved={saved} />
                </div>
            )}
        </Card>
    )
}

// Asks the engines to check their keys again now, and spins until one has
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

// The engine checks in every minute; a few missed beats and it shows as offline
const ONLINE_MS = 3 * 60_000
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string

// Where outside services reach this engine
function PublicUrl({ runner }: { runner: Runner }) {
    const setUrl = useMutation(api.runners.setPublicUrl)
    const run = useRun()
    const [value, setValue] = useState(runner.publicUrl ?? '')
    return (
        <div className="mt-1.5 space-y-1">
            <form
                className="flex min-w-0 items-center gap-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    void run(setUrl({ id: runner._id, publicUrl: value || undefined }))
                }}>
                <Input aria-label="Public URL" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Public URL, e.g. https://bots.example.com" className="h-8 min-w-0 flex-1 sm:max-w-72" />
                <Btn type="submit" variant="primary" disabled={value === (runner.publicUrl ?? '')}>
                    Save
                </Btn>
            </form>
            <p className="text-[12px] text-neutral-500">Where Twilio and Sendblue (a public HTTPS address) or BlueBubbles (any address your Mac can reach) reach this engine. Only needed for those.</p>
        </div>
    )
}

// The engines you run, with tokens made here in the browser (Convex only ever gets a hash). `webhooks`: the workspace
// texts through Twilio or Sendblue, so a new engine starts with the tunnel.
function Engines({ runners, orgoKey, webhooks }: { runners?: Runner[]; orgoKey?: Saved; webhooks: boolean }) {
    const create = useMutation(api.runners.create)
    const revoke = useMutation(api.runners.revoke)
    const resetToken = useMutation(api.runners.resetToken)
    const setComputerUse = useMutation(api.runners.setComputerUse)
    const run = useRun()
    const now = useNow(30_000)
    const [name, setName] = useState('')
    // A token just made, shown once: for a new engine, or a reset one (named, so the setup says to restart it)
    const [token, setToken] = useState<{ value: string; reset?: string } | null>(null)
    // How the next computer is added: on Orgo, or one the user runs themselves
    const [where, setWhere] = useState<'orgo' | 'own'>('orgo')

    const add = async () => {
        const fresh = newToken()
        const res = await run(create({ name, tokenHash: await hashToken(fresh) }))
        if (res.ok) {
            setToken({ value: fresh })
            setName('')
        }
    }
    // The same engine gets a new token in place; the old one stops working
    const reset = async (r: Runner) => {
        const fresh = newToken()
        const res = await run(resetToken({ id: r._id, tokenHash: await hashToken(fresh) }))
        if (res.ok) setToken({ value: fresh, reset: r.name })
    }

    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-[14px] font-semibold">Computer use</h2>
                <p className="text-[13px] text-neutral-500">The always-on computer your agents work on, like a cloud VM. It also answers your texts, and messages and contacts stay on it.</p>
            </div>
            <Card className="divide-y divide-neutral-100 rounded-lg p-0">
                {runners === undefined ? (
                    <div className="p-4">
                        <Skeleton className="h-12" />
                    </div>
                ) : (
                    runners.map((r) => {
                        const online = !!r.lastSeenAt && now - r.lastSeenAt < ONLINE_MS
                        // Made through Create on Orgo, even if Orgo refused before the computer existed
                        const onOrgo = !!(r.orgo || r.setup)
                        // What's stopping computer use here, like a Mac permission that isn't allowed yet
                        const computerError = r.services?.find((s) => s.service === 'computer')?.error
                        return (
                            // On a phone the buttons wrap under the engine's details instead of squeezing them
                            <div key={r._id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                                    <Bot className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
                                    <p className="flex items-center gap-2 text-[13px] font-medium">
                                        <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-neutral-300')} aria-hidden />
                                        {r.name}
                                        {onOrgo && <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-normal">Orgo</Badge>}
                                    </p>
                                    <p className="truncate text-[12px] text-neutral-500">
                                        {r.lastSeenAt
                                            ? `${online ? 'Online' : `Offline, last seen ${relativeTime(r.lastSeenAt, now)}`} · v${r.version}${r.channels?.length ? ` · texts through ${r.channels.join(', ')}` : ''}${r.demo ? ' · demo replies' : ''}`
                                            : onOrgo
                                              ? 'Not connected yet.'
                                              : 'Never connected. Start it with the token you copied.'}
                                    </p>
                                    {r.tunnelUrl && <p className="truncate font-mono text-[11px] text-neutral-500">Public address {r.tunnelUrl}</p>}
                                    {!onOrgo && r.os === 'linux' && <p className="text-[12px] text-amber-700">Texting only: computer use works on Windows and Mac.</p>}
                                    {!onOrgo && (r.os === 'windows' || r.os === 'mac') && (
                                        <div className="mt-2 flex items-start gap-3 rounded-md border border-neutral-200 p-2.5">
                                            <Switch aria-label="Computer use" checked={!!r.computerUse} onCheckedChange={(on) => void run(setComputerUse({ id: r._id, on }))} />
                                            <div className="min-w-0 text-[12px]">
                                                <p className="font-medium">Computer use</p>
                                                <p className="text-neutral-500">
                                                    Agents can see this computer’s screen and use its mouse and keyboard while doing a task you text them. They ask before
                                                    anything that can’t be undone. Pages they visit can try to mislead them, so keep an eye on what they do.
                                                </p>
                                                {r.computerUse && computerError && <p className="mt-1 text-amber-700">{computerError}</p>}
                                            </div>
                                        </div>
                                    )}
                                    {onOrgo ? <OrgoControls runner={r} /> : !r.tunnelUrl && <PublicUrl runner={r} />}
                                </div>
                                {!onOrgo && (
                                    <div className="ml-12 flex shrink-0 flex-wrap gap-2 sm:ml-0 sm:justify-end">
                                        <ConfirmDelete
                                            label="Reset token"
                                            title={`Reset ${r.name}'s token?`}
                                            description="Its current token stops working right away. You'll get a new one to paste into the engine when you restart it."
                                            confirm="Reset"
                                            onConfirm={() => void reset(r)}
                                        />
                                        <ConfirmDelete label="Revoke" what={`${r.name}'s token`} onConfirm={() => void run(revoke({ id: r._id }))} />
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
                <div className="space-y-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] text-neutral-500">{runners?.length ? 'Add another computer:' : 'Add a computer:'}</span>
                        <div role="tablist" className="inline-flex rounded-md bg-neutral-100 p-0.5 text-[12px]">
                            {(['orgo', 'own'] as const).map((w) => (
                                <button
                                    key={w}
                                    role="tab"
                                    type="button"
                                    aria-selected={where === w}
                                    onClick={() => setWhere(w)}
                                    className={cn('rounded px-2.5 py-1 font-medium', where === w ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')}>
                                    {w === 'orgo' ? 'On Orgo' : 'Your own computer'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {where === 'orgo' && <OrgoCreate saved={orgoKey} />}
                </div>
                {where === 'own' && (
                    <form
                        className="flex flex-wrap items-center gap-2 px-4 py-3"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void add()
                        }}>
                        <span className="min-w-0 flex-1 text-[12px] text-neutral-500">A laptop, a server or any VM you run. Computer use works on Windows and Mac; Linux computers (like Fedora) answer texts only. Name it to get its token:</span>
                        <Input aria-label="Computer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My VM" className="h-8 w-44" />
                        <Btn type="submit" variant="primary" disabled={!name.trim()}>
                            Add computer
                        </Btn>
                    </form>
                )}
                {token && <Setup token={token.value} reset={token.reset} webhooks={webhooks} onDone={() => setToken(null)} />}
            </Card>
        </section>
    )
}

// Shown once after adding an engine (or resetting its token): the token and how to start it on that computer. The
// engine is one file this site serves (built from the same code as the dashboard). The token isn't in the commands, so
// shell history never keeps it: the engine asks for it on first start, hidden, and saves it where only you can read it.
function Setup({ token, reset, webhooks, onDone }: { token: string; reset?: string; webhooks: boolean; onDone: () => void }) {
    const [system, setSystem] = useState<System>(() => thisSystem())
    // Only Twilio and Sendblue need the engine reachable from the internet; Messages on a Mac and BlueBubbles don't
    const [tunnel, setTunnel] = useState(webhooks)
    const engineUrl = `${window.location.origin}/engine/openbots-engine.mjs`
    const steps = setupSteps(system, CONVEX_URL, engineUrl, tunnel)
    // A dev server serves the engine only once it's built (see vite.config.ts); say so instead of a download that fails
    const missing = useEngineMissing(engineUrl)
    if (reset)
        return (
            <div className="space-y-3 bg-neutral-50 px-4 py-4">
                <p className="text-[13px] text-neutral-700">
                    {reset} has a new token, shown only now. Its old one has stopped working: stop the engine on that computer and start it again the same way. When it says
                    the saved token no longer works, paste this one.
                </p>
                <CopyBlock label="The new token" text={token} />
                <Btn variant="primary" onClick={onDone}>
                    I’ve copied it
                </Btn>
            </div>
        )
    return (
        <div className="space-y-3 bg-neutral-50 px-4 py-4">
            <p className="text-[13px] text-neutral-700">
                Run these on the computer you’re adding. It needs{' '}
                <a href={NODE_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                    Node.js {MIN_NODE} or newer
                </a>
                . The first time the engine starts, it asks for this computer’s token (below): paste it there, not into a command, so your shell history never keeps it.
                The token is shown only now and isn’t stored anywhere, so copy it before you close this.
            </p>
            <div className="flex gap-1" role="group" aria-label="Computer’s system">
                {SYSTEMS.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        aria-pressed={system === s.id}
                        onClick={() => setSystem(s.id)}
                        className={cn('rounded-md px-3 py-1.5 text-[12px]', system === s.id ? 'bg-primary text-primary-foreground' : 'bg-white text-neutral-600 ring-1 ring-neutral-200')}>
                        {s.label}
                    </button>
                ))}
            </div>
            <label className="flex items-start gap-2 text-[12px] text-neutral-700">
                <Switch aria-label="Texts through Twilio or Sendblue" checked={tunnel} onCheckedChange={setTunnel} />
                <span>
                    This computer texts through Twilio or Sendblue. They need to reach it from the internet, so the engine starts a free Cloudflare tunnel. Leave it off for
                    Messages on a Mac or BlueBubbles, or if you set a Public URL of your own.
                </span>
            </label>
            {missing && (
                <p className="rounded-md bg-amber-50 p-2.5 text-[12px] text-amber-900">
                    This site isn’t serving the engine yet, so the download below won’t work. On a dev server, run <code className="font-mono">npm run runner:build</code> once
                    (or restart <code className="font-mono">npm run dev</code>); a production build includes it.
                </p>
            )}
            {tunnel && <CopyBlock label={`1. Install the tunnel (${steps.shell})`} text={steps.tunnel} />}
            <CopyBlock label={`${tunnel ? '2' : '1'}. Download and start the engine (${steps.shell})`} text={steps.start} />
            <p className="text-[12px] text-neutral-500">
                Keep that window open: the engine runs while it’s open. Start it from your normal desktop, not as a service, so computer use can see the screen
                {system === 'linux' ? ' (Linux computers answer texts only)' : ''}. Next time, run the same commands; it remembers the token. Your keys come from the cards
                below.
            </p>
            <CopyBlock label="This computer’s token (paste it when the engine asks)" text={token} />
            <Btn variant="primary" onClick={onDone}>
                I’ve copied it
            </Btn>
        </div>
    )
}

// True once a check finds the engine file isn't served here (a dev server before the engine is built)
function useEngineMissing(url: string) {
    const [missing, setMissing] = useState(false)
    useEffect(() => {
        let live = true
        fetch(url, { method: 'HEAD' })
            .then((res) => {
                // A dev server answers a missing file with the app's own page
                if (live) setMissing(!res.ok || !!res.headers.get('content-type')?.includes('text/html'))
            })
            .catch(() => {})
        return () => {
            live = false
        }
    }, [url])
    return missing
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
