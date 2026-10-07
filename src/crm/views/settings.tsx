import { useState, type ReactNode } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { Bell, Building2, Database, Download, MessageCircle, Users, type LucideIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { cn } from '@/lib/utils'
import { useRun } from '../toast-context'
import { Btn, Content, inputCls, PaneItem, Scroll, SidePane, Toggle, Toolbar } from '../ui'

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'messaging', label: 'Messaging', icon: MessageCircle },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
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
    ownerEmail: string
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
    notifyDigest: boolean
}

// Older workspaces have none of the optional settings; these are the defaults they start from
const toForm = (w: Doc<'workspace'>): Form => ({
    name: w.name,
    ownerName: w.ownerName,
    ownerEmail: w.ownerEmail ?? '',
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
    notifyDigest: w.notifyDigest ?? false,
})

// Mirrors the server's cleanup so the form isn't left "unsaved" after a save
const normalize = (f: Form): Form => ({
    ...f,
    name: f.name.trim(),
    ownerName: f.ownerName.trim(),
    ownerEmail: f.ownerEmail.trim(),
    newContactTag: f.newContactTag.trim().toLowerCase(),
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
                            {SECTIONS.map((s) => <div key={s.id} className="h-40 animate-pulse rounded-lg bg-neutral-100" />)}
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
    const emailOk = !form.ownerEmail.trim() || handleKind(form.ownerEmail) === 'email'
    const valid = form.name.trim() && form.ownerName.trim() && emailOk && form.quietStart && form.quietEnd
    const timezones = Intl.supportedValuesOf('timeZone')

    const save = async () => {
        const f = normalize(form)
        setSaving(true)
        const res = await run(
            update({
                ...f,
                ownerEmail: f.ownerEmail || undefined,
                defaultAgentId: f.defaultAgentId ? (f.defaultAgentId as Id<'agents'>) : undefined,
                newContactTag: f.newContactTag || undefined,
            }),
        )
        setSaving(false)
        if (res.ok) setForm(f)
    }

    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24">
            <Section id="general" title="General" description="Your workspace and how you appear in it.">
                <Row label="Workspace name" htmlFor="s-name">
                    <input id="s-name" className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Row>
                <Row label="Your name" description="Shown in the sidebar." htmlFor="s-owner">
                    <input id="s-owner" className={inputCls} value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
                </Row>
                <Row label="Email" description={!emailOk ? 'Enter a valid email address.' : 'Where notifications and digests go.'} error={!emailOk} htmlFor="s-email">
                    <input id="s-email" type="email" className={cn(inputCls, !emailOk && 'border-red-300')} value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} placeholder="you@example.com" />
                </Row>
                <Row label="Timezone" description="Used for quiet hours and the daily digest." htmlFor="s-tz">
                    <select id="s-tz" className={inputCls} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                        {(timezones.includes(form.timezone) ? timezones : [form.timezone, ...timezones]).map((tz) => (
                            <option key={tz} value={tz}>
                                {tz.replaceAll('_', ' ')}
                            </option>
                        ))}
                    </select>
                </Row>
                <Row label="Plan">
                    <span className="flex h-9 items-center gap-2 text-[13px] text-neutral-700">
                        Personal
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">Free</span>
                    </span>
                </Row>
            </Section>

            <Section id="messaging" title="Messaging" description="How your agents behave in iMessage.">
                <Row label="Default agent" description="Pre-selected when you add a contact or a number." htmlFor="s-default-agent">
                    <select id="s-default-agent" className={inputCls} value={form.defaultAgentId} onChange={(e) => set('defaultAgentId', e.target.value)}>
                        <option value="">None</option>
                        {agents?.map((a) => (
                            <option key={a._id} value={a._id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </Row>
                <Row label="Reply delay" description="A short pause before replying feels more human." htmlFor="s-delay">
                    <select id="s-delay" className={inputCls} value={form.replyDelaySec} onChange={(e) => set('replyDelaySec', Number(e.target.value))}>
                        {REPLY_DELAYS.map((d) => (
                            <option key={d.value} value={d.value}>
                                {d.label}
                            </option>
                        ))}
                    </select>
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
                            <input type="time" aria-label="Quiet hours start" className={inputCls} value={form.quietStart} onChange={(e) => set('quietStart', e.target.value)} />
                            <span className="text-[13px] text-neutral-400">to</span>
                            <input type="time" aria-label="Quiet hours end" className={inputCls} value={form.quietEnd} onChange={(e) => set('quietEnd', e.target.value)} />
                        </span>
                    </Row>
                )}
            </Section>

            <Section id="contacts" title="Contacts" description="Defaults for people who text your agents.">
                <Row label="Tag new contacts" description="Added to every new contact, e.g. lead. Leave blank for none." htmlFor="s-tag">
                    <input id="s-tag" className={inputCls} value={form.newContactTag} onChange={(e) => set('newContactTag', e.target.value)} placeholder="lead" />
                </Row>
            </Section>

            <Section id="notifications" title="Notifications" description={form.ownerEmail.trim() ? `Sent to ${form.ownerEmail.trim()}.` : 'Add an email under General to receive these.'}>
                <Row label="New contact" description="When someone texts one of your agents for the first time." inline>
                    <Toggle label="New contact notifications" checked={form.notifyNewContact} onChange={(v) => set('notifyNewContact', v)} />
                </Row>
                <Row label="Handoffs" description="When an agent needs you to step in." inline>
                    <Toggle label="Handoff notifications" checked={form.notifyHandoff} onChange={(v) => set('notifyHandoff', v)} />
                </Row>
                <Row label="Daily digest" description="A summary of every conversation, each morning." inline>
                    <Toggle label="Daily digest" checked={form.notifyDigest} onChange={(v) => set('notifyDigest', v)} />
                </Row>
            </Section>

            <Section id="data" title="Data" description="Your workspace data belongs to you.">
                <Row label="Export everything" description="Agents, contacts, conversations, messages, knowledge and broadcasts as JSON.">
                    <ExportButton />
                </Row>
            </Section>

            {dirty && (
                <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-lg">
                    <span className="text-[13px] text-neutral-600">You have unsaved changes</span>
                    <span className="flex gap-2">
                        <Btn onClick={() => setForm(toForm(workspace))} disabled={saving}>
                            Discard
                        </Btn>
                        <Btn variant="primary" onClick={save} disabled={!valid || saving}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </Btn>
                    </span>
                </div>
            )}
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
        <section id={`settings-${id}`} className="scroll-mt-4 rounded-lg border border-neutral-200">
            <header className="border-b border-neutral-200/70 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-neutral-900">{title}</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">{description}</p>
            </header>
            <div className="divide-y divide-neutral-100">{children}</div>
        </section>
    )
}

// Switches stay beside their label even on phones; other controls drop below it
function Row({ label, description, error, htmlFor, inline, children }: { label: string; description?: string; error?: boolean; htmlFor?: string; inline?: boolean; children: ReactNode }) {
    return (
        <div className={cn('grid px-5 py-4', inline ? 'grid-cols-[minmax(0,1fr)_auto] items-center gap-6' : 'gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)] sm:items-center sm:gap-8')}>
            <div>
                <label htmlFor={htmlFor} className="block text-[13px] font-medium text-neutral-900">
                    {label}
                </label>
                {description && <p className={cn('mt-0.5 text-[12px]', error ? 'text-red-600' : 'text-neutral-500')}>{description}</p>}
            </div>
            <div className="flex sm:justify-end">{children}</div>
        </div>
    )
}
