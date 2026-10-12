import { useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AlertCircle, Check, Copy, ExternalLink, Mail, MessageCircle, MessageSquareText, RefreshCw, Smartphone, type LucideIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { FIELDS, type Provider } from '@convex/lib/connectionInfo'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ProviderMark } from '@/components/agent-config-bar'
import { useNav } from '../nav'
import { useRun } from '../use-run'
import { Btn, ConfirmDelete, Content, Dialog, Field, Scroll, Toolbar } from '../ui'

type Info = {
    name: string
    // One line on what connecting it does
    blurb: string
    // Where to get the credentials, and the steps to follow there
    getUrl: string
    getLabel: string
    steps: ReactNode[]
    icon?: LucideIcon
    // Shown once connected: what to do next
    next?: { label: string; view: 'numbers' | 'settings' }
    badge?: string
}

const AI: Provider[] = ['openai', 'anthropic', 'google', 'xai']
const TEXTING: Provider[] = ['bluebubbles', 'sendblue', 'twilio']

const INFO: Record<Provider, Info> = {
    openai: {
        name: 'OpenAI',
        blurb: 'GPT 5.1 and GPT 5.1 mini.',
        getUrl: 'https://platform.openai.com/api-keys',
        getLabel: 'Get an OpenAI key',
        steps: ['Sign in to the OpenAI platform and open API keys.', 'Create a new secret key and paste it here.'],
    },
    anthropic: {
        name: 'Anthropic',
        blurb: 'Claude Sonnet 5.5 and Claude Haiku 4.5.',
        getUrl: 'https://console.anthropic.com/settings/keys',
        getLabel: 'Get an Anthropic key',
        steps: ['Sign in to the Claude Console and open API keys.', 'Create a key and paste it here.'],
    },
    google: {
        name: 'Google Gemini',
        blurb: 'Gemini 2.5 Flash.',
        getUrl: 'https://aistudio.google.com/apikey',
        getLabel: 'Get a Gemini key',
        steps: ['Open Google AI Studio and choose Get API key.', 'Create a key and paste it here.'],
    },
    xai: {
        name: 'xAI',
        blurb: 'Grok 4.',
        getUrl: 'https://console.x.ai',
        getLabel: 'Get an xAI key',
        steps: ['Sign in to the xAI console and open API keys.', 'Create a key and paste it here.'],
    },
    bluebubbles: {
        name: 'BlueBubbles',
        blurb: 'iMessage from your own Mac, free. Works in group chats.',
        getUrl: 'https://bluebubbles.app/install',
        getLabel: 'Install BlueBubbles Server',
        steps: [
            'On a Mac that stays on and is signed in to Messages, install BlueBubbles Server.',
            'In its settings, turn on a public URL (its built-in Cloudflare or ngrok option) and set a password.',
            'Paste the URL and password here. We register the webhook on your Mac for you.',
        ],
        icon: MessageCircle,
        next: { label: 'Add your iMessage address', view: 'numbers' },
        badge: 'iMessage',
    },
    sendblue: {
        name: 'Sendblue',
        blurb: 'iMessage without a Mac, on your Sendblue line. Group chats need a plan that includes them.',
        getUrl: 'https://dashboard.sendblue.com',
        getLabel: 'Open Sendblue',
        steps: ['Create a Sendblue account and get a line.', 'In the dashboard, open API keys and copy the key ID and secret.', 'Paste them here. We set up the incoming-message webhook for you.'],
        icon: MessageSquareText,
        next: { label: 'Add your Sendblue line', view: 'numbers' },
        badge: 'iMessage',
    },
    twilio: {
        name: 'Twilio',
        blurb: 'Regular texts (SMS) on numbers you buy in your own Twilio account, right from this dashboard.',
        getUrl: 'https://console.twilio.com',
        getLabel: 'Open the Twilio console',
        steps: [
            'Create a Twilio account (Twilio bills you directly for numbers and texts).',
            'Copy the Account SID and Auth token from the console home page.',
            'Paste them here, then get a number in iMessage Numbers. Texting US numbers needs A2P 10DLC registration in Twilio.',
        ],
        icon: Smartphone,
        next: { label: 'Get a number', view: 'numbers' },
        badge: 'SMS',
    },
    resend: {
        name: 'Resend',
        blurb: 'Emails you notifications and the daily digest, at the email in Settings.',
        getUrl: 'https://resend.com/api-keys',
        getLabel: 'Get a Resend key',
        steps: ['Create a Resend account and verify a domain you own.', 'Create an API key and paste it here with a from address on that domain.'],
        icon: Mail,
        next: { label: 'Choose notifications', view: 'settings' },
    },
}

type Connection = NonNullable<ReturnType<typeof useQuery<typeof api.connections.list>>>[number]

export function ConnectionsView() {
    const connections = useQuery(api.connections.list)
    const [open, setOpen] = useState<Provider | null>(null)
    const byProvider = new Map(connections?.map((c) => [c.provider, c]))
    const hasAi = AI.some((p) => byProvider.has(p))

    const section = (title: string, description: string, providers: Provider[], cols: string) => (
        <section className="space-y-3">
            <div>
                <h2 className="text-[14px] font-semibold">{title}</h2>
                <p className="text-[13px] text-neutral-500">{description}</p>
            </div>
            <div className={cn('grid gap-3', cols)}>
                {providers.map((p) => (connections ? <ProviderCard key={p} provider={p} connection={byProvider.get(p)} onConnect={() => setOpen(p)} /> : <Skeleton key={p} className="h-40 rounded-lg" />))}
            </div>
        </section>
    )

    return (
        <Content>
            <Toolbar title="Connections">
                <span className="text-[12px] text-neutral-500">Your own accounts and keys. They’re encrypted and never shown again after you save them.</span>
            </Toolbar>
            <Scroll>
                <div className="mx-auto w-full max-w-5xl space-y-8 p-4 pb-16">
                    {connections && !hasAi && (
                        <Card className="flex flex-row items-start gap-3 rounded-lg border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <span>Your agents can’t reply until you connect at least one AI provider. Pick the one behind the models you want; you pay the provider directly for what your agents use.</span>
                        </Card>
                    )}
                    {section('AI models', 'Agents write their replies with these. Connect the providers whose models you pick on the Models page.', AI, 'sm:grid-cols-2 xl:grid-cols-4')}
                    {section('Texting', 'Where your agents send and receive messages. Connect one, then add its number in iMessage Numbers.', TEXTING, 'lg:grid-cols-3')}
                    {section('Email', 'Optional. Notifications always show in the dashboard; this also emails them.', ['resend'], 'lg:grid-cols-3')}
                </div>
            </Scroll>
            {open && <ConnectDialog provider={open} replacing={byProvider.has(open)} onClose={() => setOpen(null)} />}
        </Content>
    )
}

function ProviderCard({ provider, connection, onConnect }: { provider: Provider; connection?: Connection; onConnect: () => void }) {
    const go = useNav()
    const run = useRun()
    const recheck = useAction(api.connections.recheck)
    const remove = useMutation(api.connections.remove)
    const [checking, setChecking] = useState(false)
    const info = INFO[provider]
    const Icon = info.icon
    const ai = AI.includes(provider)

    return (
        <Card className="flex flex-col gap-3 rounded-lg p-4">
            <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                    {ai ? <ProviderMark provider={provider as 'openai'} className="size-5" /> : Icon && <Icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
                        {info.name}
                        {info.badge && <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-normal">{info.badge}</Badge>}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-neutral-500">{info.blurb}</p>
                </div>
            </div>

            {connection ? (
                <div className="space-y-2">
                    <p className={cn('flex items-center gap-1.5 text-[12px]', connection.status === 'ok' ? 'text-emerald-700' : 'text-destructive')}>
                        {connection.status === 'ok' ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                        <span className="truncate">{connection.status === 'ok' ? `Connected · ${connection.label}` : connection.error}</span>
                    </p>
                    {connection.webhookUrl && <CopyField label="Incoming messages URL" value={connection.webhookUrl} />}
                </div>
            ) : (
                <p className="text-[12px] text-neutral-400">Not connected</p>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {connection ? (
                    <>
                        {info.next && (
                            <Btn variant="primary" onClick={() => go(info.next!.view)}>
                                {info.next.label}
                            </Btn>
                        )}
                        <Btn onClick={onConnect}>Replace</Btn>
                        <Btn
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Check ${info.name} again`}
                            title="Check again"
                            disabled={checking}
                            onClick={async () => {
                                setChecking(true)
                                await run(recheck({ id: connection._id }))
                                setChecking(false)
                            }}>
                            <RefreshCw className={cn(checking && 'animate-spin')} />
                        </Btn>
                        <span className="ml-auto">
                            <ConfirmDelete label="Disconnect" what={`your ${info.name} connection${TEXTING.includes(provider) ? ' and its numbers' : ''}`} onConfirm={() => run(remove({ id: connection._id }))} />
                        </span>
                    </>
                ) : (
                    <Btn variant="primary" onClick={onConnect}>
                        Connect {info.name}
                    </Btn>
                )}
            </div>
        </Card>
    )
}

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <div className="space-y-1">
            <span className="block text-[11px] text-neutral-500">{label}</span>
            <span className="flex items-center gap-1">
                <Input readOnly aria-label={label} value={value} className="h-7 font-mono text-[11px]" onFocus={(e) => e.target.select()} />
                <Btn
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Copy ${label}`}
                    onClick={async () => {
                        await navigator.clipboard.writeText(value)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                    }}>
                    {copied ? <Check /> : <Copy />}
                </Btn>
            </span>
        </div>
    )
}

function ConnectDialog({ provider, replacing, onClose }: { provider: Provider; replacing: boolean; onClose: () => void }) {
    const run = useRun()
    const connect = useAction(api.connections.connect)
    const info = INFO[provider]
    const fields = FIELDS[provider]
    const [values, setValues] = useState<Record<string, string>>({})
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const complete = fields.every((f) => values[f.key]?.trim())

    const save = async () => {
        setBusy(true)
        setError('')
        const res = await run(connect({ provider, credentials: values }))
        setBusy(false)
        if (!res.ok) return
        if (res.value.ok) onClose()
        else setError(res.value.error)
    }

    return (
        <Dialog
            title={`${replacing ? 'Replace' : 'Connect'} ${info.name}`}
            onClose={onClose}
            footer={
                <>
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!complete || busy} onClick={save}>
                        {busy ? 'Checking…' : 'Check and save'}
                    </Btn>
                </>
            }>
            <ol className="space-y-1.5 text-[13px] text-neutral-600">
                {info.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-700">{i + 1}</span>
                        <span>{step}</span>
                    </li>
                ))}
            </ol>
            <a href={info.getUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-900 underline-offset-2 hover:underline">
                {info.getLabel}
                <ExternalLink className="size-3.5" />
            </a>
            <form
                className="space-y-3"
                onSubmit={(e) => {
                    e.preventDefault()
                    if (complete) void save()
                }}>
                {fields.map((f, i) => (
                    <Field key={f.key} label={f.label}>
                        <Input
                            autoFocus={i === 0}
                            type={f.secret ? 'password' : 'text'}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={f.placeholder}
                            value={values[f.key] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        />
                    </Field>
                ))}
                <button type="submit" hidden />
            </form>
            {error && (
                <p role="alert" className="text-destructive flex items-start gap-1.5 text-[13px]">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    {error}
                </p>
            )}
            <p className="text-[11px] text-neutral-400">We check these with {info.name} before saving, then store them encrypted. They’re only used to run your agents.</p>
        </Dialog>
    )
}
