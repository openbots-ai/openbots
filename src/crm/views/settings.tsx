import { useState, type ReactNode } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { Bell, Bot, Building2, Check, Copy, Database, Download, Gauge, MessageCircle, Users, X, type LucideIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { hashToken, newToken } from '@convex/lib/tokens'
import runner from '../../../runner/package.json'
import { cn } from '@/lib/utils'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { relativeTime } from '../lib/time'
import { useNow } from '../use-now'
import { useRun } from '../use-run'
import { Btn, ConfirmDelete, Content, PaneItem, Scroll, Select, SidePane, Toggle, Toolbar } from '../ui'

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'messaging', label: 'Messaging', icon: MessageCircle },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'usage', label: 'Usage budget', icon: Gauge },
    { id: 'agent', label: 'Agent', icon: Bot },
    { id: 'data', label: 'Data', icon: Database },
]

const REPLY_DELAYS = [
    { value: 0, label: 'Instant' },
    { value: 1, label: '1 second' },
    { value: 2, label: '2 seconds' },
    { value: 5, label: '5 seconds' },
    { value: 10, label: '10 seconds' },
    { value: 30, label: '30 seconds' },
]

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

type Form = {
    name: string
    ownerName: string
    ownerHandle: string
    timezone: string
    defaultAgentId: string
    quietEnabled: boolean
    quietStart: string
    quietEnd: string
    replyDelaySec: number
    typingIndicator: boolean
    readReceipts: boolean
    newContactTag: string
    notifyNewContact: boolean
    notifyHandoff: boolean
    // Kept as text so the field can be empty (no cap)
    dailyBudget: string
    weeklyBudget: string
}

// Older workspaces have none of the optional settings; these are the defaults they start from
const toForm = (w: Doc<'workspace'>): Form => ({
    name: w.name,
    ownerName: w.ownerName,
    ownerHandle: w.ownerHandle ?? '',
    timezone: w.timezone ?? browserTimezone(),
    defaultAgentId: w.defaultAgentId ?? '',
    quietEnabled: w.quietEnabled ?? false,
    quietStart: w.quietStart ?? '22:00',
    quietEnd: w.quietEnd ?? '08:00',
    replyDelaySec: w.replyDelaySec ?? 2,
    typingIndicator: w.typingIndicator ?? true,
    readReceipts: w.readReceipts ?? true,
    newContactTag: w.newContactTag ?? '',
    notifyNewContact: w.notifyNewContact ?? true,
    notifyHandoff: w.notifyHandoff ?? true,
    dailyBudget: w.dailyBudget?.toString() ?? '',
    weeklyBudget: w.weeklyBudget?.toString() ?? '',
})

// '' means no budget; anything else must be a positive number
const parseBudget = (s: string) => (s.trim() ? Number(s) : undefined)
const budgetOk = (s: string) => !s.trim() || Number(s) > 0

// Mirrors the server's cleanup so the form isn't left "unsaved" after a save
const normalize = (f: Form): Form => ({
    ...f,
    name: f.name.trim(),
    ownerName: f.ownerName.trim(),
    ownerHandle: f.ownerHandle.trim(),
    newContactTag: f.newContactTag.trim().toLowerCase(),
    dailyBudget: f.dailyBudget.trim() && String(Number(f.dailyBudget)),
    weeklyBudget: f.weeklyBudget.trim() && String(Number(f.weeklyBudget)),
})

export function SettingsView() {
    const workspace = useQuery(api.workspace.get)

    return (
        <>
            <SidePane>
                {SECTIONS.map((s) => (
                    <PaneItem key={s.id} onClick={() => document.getElementById(`settings-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        <s.icon />
                        {s.label}
                    </PaneItem>
                ))}
            </SidePane>
            <Content>
                <Toolbar title="Settings" />
                <Scroll>
                    {workspace ? (
                        <SettingsForm key={workspace._id} workspace={workspace} />
                    ) : (
                        <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
                            {SECTIONS.map((s) => <Skeleton key={s.id} className="h-40 rounded-lg" />)}
                        </div>
                    )}
                </Scroll>
            </Content>
        </>
    )
}

function SettingsForm({ workspace }: { workspace: Doc<'workspace'> }) {
    const run = useRun()
    const update = useMutation(api.workspace.update)
    const agents = useQuery(api.agents.list)
    const [form, setForm] = useState(() => toForm(workspace))
    const [saving, setSaving] = useState(false)

    const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
    const dirty = JSON.stringify(normalize(form)) !== JSON.stringify(toForm(workspace))
    const handleOk = !form.ownerHandle.trim() || !!handleKind(form.ownerHandle)
    const budgetsOk = budgetOk(form.dailyBudget) && budgetOk(form.weeklyBudget)
    const valid = form.name.trim() && form.ownerName.trim() && handleOk && form.quietStart && form.quietEnd && budgetsOk
    const timezones = Intl.supportedValuesOf('timeZone')

    const save = async () => {
        const f = normalize(form)
        setSaving(true)
        const res = await run(
            update({
                ...f,
                ownerHandle: f.ownerHandle || undefined,
                defaultAgentId: f.defaultAgentId ? (f.defaultAgentId as Id<'agents'>) : undefined,
                newContactTag: f.newContactTag || undefined,
                dailyBudget: parseBudget(f.dailyBudget),
                weeklyBudget: parseBudget(f.weeklyBudget),
            }),
        )
        setSaving(false)
        if (res.ok) setForm(f)
    }

    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24">
            <Section id="general" title="General" description="Your workspace and how you appear in it.">
                <Row label="Workspace name" htmlFor="s-name">
                    <Input id="s-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Row>
                <Row label="Your name" description="Shown in the sidebar." htmlFor="s-owner">
                    <Input id="s-owner" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
                </Row>
                <Row label="Your phone" description={!handleOk ? 'Enter a phone number or an Apple ID email.' : 'Your agent texts you here when it needs you. Use your own number, not one of your agents’.'} error={!handleOk} htmlFor="s-handle">
                    <Input id="s-handle" aria-invalid={!handleOk} value={form.ownerHandle} onChange={(e) => set('ownerHandle', e.target.value)} placeholder="+1 415 555 0100" />
                </Row>
                <Row label="Timezone" description="Used for quiet hours." htmlFor="s-tz">
                    <Select
                        id="s-tz"
                        value={form.timezone}
                        onChange={(v) => set('timezone', v)}
                        options={(timezones.includes(form.timezone) ? timezones : [form.timezone, ...timezones]).map((tz) => ({ value: tz, label: tz.replaceAll('_', ' ') }))}
                    />
                </Row>
            </Section>

            <Section id="messaging" title="Messaging" description="How your agents behave in iMessage.">
                <Row label="Default agent" description="Pre-selected when you add a contact or a number." htmlFor="s-default-agent">
                    <Select
                        id="s-default-agent"
                        value={form.defaultAgentId}
                        onChange={(v) => set('defaultAgentId', v)}
                        options={[{ value: '', label: 'None' }, ...(agents ?? []).map((a) => ({ value: a._id, label: a.name }))]}
                    />
                </Row>
                <Row label="Reply delay" description="A short pause before replying feels more human." htmlFor="s-delay">
                    <Select id="s-delay" value={form.replyDelaySec} onChange={(v) => set('replyDelaySec', v)} options={REPLY_DELAYS} />
                </Row>
                <Row label="Typing indicator" description="Show the typing bubble while an agent writes." inline>
                    <Toggle label="Typing indicator" checked={form.typingIndicator} onChange={(v) => set('typingIndicator', v)} />
                </Row>
                <Row label="Read receipts" description="Mark messages as read when an agent sees them." inline>
                    <Toggle label="Read receipts" checked={form.readReceipts} onChange={(v) => set('readReceipts', v)} />
                </Row>
                <Row label="Quiet hours" description="Agents hold non-urgent messages until quiet hours end." inline>
                    <Toggle label="Quiet hours" checked={form.quietEnabled} onChange={(v) => set('quietEnabled', v)} />
                </Row>
                {form.quietEnabled && (
                    <Row label="Quiet from" description={`In ${form.timezone.replaceAll('_', ' ')}.`}>
                        <span className="flex w-full items-center gap-2">
                            <Input type="time" aria-label="Quiet hours start" value={form.quietStart} onChange={(e) => set('quietStart', e.target.value)} />
                            <span className="text-[13px] text-neutral-400">to</span>
                            <Input type="time" aria-label="Quiet hours end" value={form.quietEnd} onChange={(e) => set('quietEnd', e.target.value)} />
                        </span>
                    </Row>
                )}
            </Section>

            <Section id="contacts" title="Contacts" description="Defaults for people who text your agents.">
                <Row label="Tag new contacts" description="Added to every new contact, e.g. lead. Leave blank for none." htmlFor="s-tag">
                    <Input id="s-tag" value={form.newContactTag} onChange={(e) => set('newContactTag', e.target.value)} placeholder="lead" />
                </Row>
            </Section>

            <Section id="notifications" title="Notifications" description={form.ownerHandle.trim() ? `Your agent texts these to ${form.ownerHandle.trim()}. They name the contact but never quote them.` : 'Add your phone under General to receive these.'}>
                <Row label="New contact" description="When someone texts one of your agents for the first time." inline>
                    <Toggle label="New contact notifications" checked={form.notifyNewContact} onChange={(v) => set('notifyNewContact', v)} />
                </Row>
                <Row label="Handoffs" description="When an agent needs you to step in." inline>
                    <Toggle label="Handoff notifications" checked={form.notifyHandoff} onChange={(v) => set('notifyHandoff', v)} />
                </Row>
            </Section>

            <Section id="usage" title="Usage budget" description="Every reply, action and voice note uses credits (see Analytics). When a budget runs out, agents stop replying and hand conversations to you.">
                <Row label="Daily budget" description={budgetOk(form.dailyBudget) ? 'Credits per day (UTC). Leave blank for no cap.' : 'Enter a number above 0, or leave blank.'} error={!budgetOk(form.dailyBudget)} htmlFor="s-daily">
                    <Input id="s-daily" inputMode="numeric" aria-invalid={!budgetOk(form.dailyBudget)} value={form.dailyBudget} onChange={(e) => set('dailyBudget', e.target.value)} placeholder="No cap" />
                </Row>
                <Row label="Weekly budget" description={budgetOk(form.weeklyBudget) ? 'Credits per week, Monday to Sunday. Leave blank for no cap.' : 'Enter a number above 0, or leave blank.'} error={!budgetOk(form.weeklyBudget)} htmlFor="s-weekly">
                    <Input id="s-weekly" inputMode="numeric" aria-invalid={!budgetOk(form.weeklyBudget)} value={form.weeklyBudget} onChange={(e) => set('weeklyBudget', e.target.value)} placeholder="No cap" />
                </Row>
            </Section>

            <AgentSection />

            <Section id="data" title="Data" description="Conversations and contacts never reach this dashboard; they live on your agent.">
                <Row label="Export settings" description="Agents, numbers, knowledge, settings and usage counts as JSON.">
                    <ExportButton />
                </Row>
            </Section>

            {dirty && (
                <Card className="sticky bottom-4 flex flex-row items-center justify-between gap-3 rounded-lg px-4 py-3 shadow-lg">
                    <span className="text-[13px] text-neutral-600">You have unsaved changes</span>
                    <span className="flex gap-2">
                        <Btn onClick={() => setForm(toForm(workspace))} disabled={saving}>
                            Discard
                        </Btn>
                        <Btn variant="primary" onClick={save} disabled={!valid || saving}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </Btn>
                    </span>
                </Card>
            )}
        </div>
    )
}

const PROVIDER_LABELS: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google Gemini', xai: 'xAI', local: 'Local model' }
// The agent checks in every minute; a few missed beats and it shows as offline
const ONLINE_MS = 3 * 60_000
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string

// The agents you run on your own machines. Tokens are made here in the browser; Convex only ever gets a hash.
function AgentSection() {
    const runners = useQuery(api.runners.list)
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
        <Section id="agent" title="Agent" description="Your agent runs on a machine you choose and keeps every message there. This dashboard never sees them.">
            {runners === undefined ? (
                <div className="p-5">
                    <Skeleton className="h-16" />
                </div>
            ) : (
                runners.map((r) => {
                    const online = !!r.lastSeenAt && now - r.lastSeenAt < ONLINE_MS
                    return (
                        <Row
                            key={r._id}
                            label={r.name}
                            description={
                                r.lastSeenAt
                                    ? `${online ? 'Online' : `Offline, last seen ${relativeTime(r.lastSeenAt, now)}`} · v${r.version} · ${r.transport === 'mac' ? 'Messages on its Mac' : 'through your relay'}${r.demo ? ' · demo replies' : ''}`
                                    : 'Never connected. Start it with the token you copied.'
                            }
                        >
                            <div className="w-full space-y-1">
                                <span className="flex items-center justify-end gap-2">
                                    <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-neutral-300')} aria-hidden />
                                    <ConfirmDelete label="Revoke" what={`${r.name}'s token`} onConfirm={() => void run(revoke({ id: r._id }))} />
                                </span>
                                {r.providers && Object.entries(r.providers).map(([p, ok]) => <EnvRow key={p} label={PROVIDER_LABELS[p] ?? p} env={ok ? 'set on agent' : 'not set'} ok={ok} />)}
                            </div>
                        </Row>
                    )
                })
            )}
            <Row label="Add an agent" description="Name the machine it runs on. You'll get a token to start it with, shown once.">
                <form
                    className="flex w-full gap-1.5"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void add()
                    }}
                >
                    <Input aria-label="Agent name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mac mini" />
                    <Btn type="submit" variant="primary" disabled={!name.trim()}>
                        Add
                    </Btn>
                </form>
            </Row>
            {token && <Setup token={token} onDone={() => setToken(null)} />}
        </Section>
    )
}

// Shown once after adding an agent: the token and how to start it on a Mac or anywhere with Docker.
// Versions are pinned so an agent only changes when you choose to upgrade it.
function Setup({ token, onDone }: { token: string; onDone: () => void }) {
    const mac = `OPENBOTS_CONVEX_URL=${CONVEX_URL} \\\nOPENBOTS_TOKEN=${token} \\\nOPENAI_API_KEY=sk-... \\\nnpx openbots-runner@${runner.version}`
    const docker = `docker run -d --name openbots -v openbots:/data -p 8787:8787 \\\n  -e OPENBOTS_CONVEX_URL=${CONVEX_URL} \\\n  -e OPENBOTS_TOKEN=${token} \\\n  -e OPENBOTS_INBOUND_SECRET=<a long random secret> \\\n  -e OPENBOTS_RELAY_URL=<your Mac relay's URL> \\\n  -e OPENAI_API_KEY=sk-... \\\n  ghcr.io/shidhartha-sen/openbots-runner:${runner.version}`
    return (
        <div className="space-y-3 bg-neutral-50 px-5 py-4">
            <p className="text-[13px] text-neutral-700">
                Copy this token now. It isn't stored anywhere, so it can't be shown again. Model keys go on the agent too, never here; use <code className="rounded bg-neutral-100 px-1">OPENBOTS_LOCAL_URL</code> and{' '}
                <code className="rounded bg-neutral-100 px-1">OPENBOTS_LOCAL_MODEL</code> for a local model instead.
            </p>
            <CopyBlock label="Token" text={token} />
            <CopyBlock label="On the Mac signed in to iMessage" text={mac} />
            <CopyBlock label="Anywhere else, with Docker (needs a relay on your Mac)" text={docker} />
            <Btn onClick={onDone}>I've copied it</Btn>
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

function EnvRow({ label, env, ok }: { label: string; env: string; ok: boolean }) {
    return (
        <div className="flex w-full items-center gap-2 text-[13px]">
            {ok ? <Check className="size-3.5 text-emerald-600" /> : <X className="size-3.5 text-neutral-400" />}
            <span className="flex-1 text-neutral-800">{label}</span>
            <code className={cn('truncate rounded px-1 text-[11px]', ok ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500')}>{env}</code>
        </div>
    )
}

function ExportButton() {
    const convex = useConvex()
    const run = useRun()
    const [busy, setBusy] = useState(false)

    const download = async () => {
        setBusy(true)
        const res = await run(convex.query(api.workspace.exportAll, {}))
        setBusy(false)
        if (!res.ok) return
        const url = URL.createObjectURL(new Blob([JSON.stringify(res.value, null, 2)], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `openbots-export-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <Btn onClick={download} disabled={busy}>
            <Download />
            {busy ? 'Preparing…' : 'Download JSON'}
        </Btn>
    )
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
    return (
        <Card id={`settings-${id}`} className="scroll-mt-4 rounded-lg">
            <CardHeader className="gap-0.5 border-b border-neutral-200/70 px-5 py-4">
                <CardTitle className="text-[14px] text-neutral-900">{title}</CardTitle>
                <CardDescription className="text-[13px] text-neutral-500">{description}</CardDescription>
            </CardHeader>
            <div className="divide-y divide-neutral-100">{children}</div>
        </Card>
    )
}

// Switches stay beside their label even on phones; other controls drop below it
function Row({ label, description, error, htmlFor, inline, children }: { label: string; description?: string; error?: boolean; htmlFor?: string; inline?: boolean; children: ReactNode }) {
    return (
        <div className={cn('grid px-5 py-4', inline ? 'grid-cols-[minmax(0,1fr)_auto] items-center gap-6' : 'gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)] sm:items-center sm:gap-8')}>
            <div>
                <Label htmlFor={htmlFor} className="block text-[13px] text-neutral-900">
                    {label}
                </Label>
                {description && <p className={cn('mt-0.5 text-[12px]', error ? 'text-red-600' : 'text-neutral-500')}>{description}</p>}
            </div>
            <div className="flex sm:justify-end">{children}</div>
        </div>
    )
}
