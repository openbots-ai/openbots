import { useState, type ReactNode } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { Bell, Building2, Database, Download, Gauge, MessageCircle, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { CREDITS_NOTE, DEFAULT_CONTACT_REPLIES_PER_HOUR, DEFAULT_DAILY_BUDGET, NEW_CONTACT_ALERTS_PER_HOUR } from '@convex/lib/usage'
import { cn } from '@/lib/utils'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AllowedPeople } from '../allowed-people'
import { OwnerPhone } from '../owner-phone'
import { useRun } from '../use-run'
import { Btn, Content, PaneItem, Scroll, Select, SidePane, Toggle, Toolbar } from '../ui'

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'allowed', label: 'Allowed people', icon: ShieldCheck },
    { id: 'messaging', label: 'Messaging', icon: MessageCircle },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'usage', label: 'Usage budget', icon: Gauge },
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
    smsPowers: boolean
    yesAll: boolean
    timezone: string
    defaultAgentId: string
    quietEnabled: boolean
    quietStart: string
    quietEnd: string
    replyDelaySec: number
    newContactTag: string
    notifyNewContact: boolean
    notifyHandoff: boolean
    // Kept as text so the field can be empty (the default daily cap, or no weekly cap)
    dailyBudget: string
    weeklyBudget: string
    // Blank means the default
    contactRepliesPerHour: string
}

// Older workspaces have none of the optional settings; these are the defaults they start from
const toForm = (w: Doc<'workspace'>): Form => ({
    name: w.name,
    ownerName: w.ownerName,
    ownerEmail: w.ownerEmail ?? '',
    smsPowers: w.smsPowers ?? false,
    yesAll: w.yesAll ?? false,
    timezone: w.timezone ?? browserTimezone(),
    defaultAgentId: w.defaultAgentId ?? '',
    quietEnabled: w.quietEnabled ?? false,
    quietStart: w.quietStart ?? '22:00',
    quietEnd: w.quietEnd ?? '08:00',
    replyDelaySec: w.replyDelaySec ?? 2,
    newContactTag: w.newContactTag ?? '',
    notifyNewContact: w.notifyNewContact ?? true,
    notifyHandoff: w.notifyHandoff ?? true,
    dailyBudget: w.dailyBudget?.toString() ?? '',
    weeklyBudget: w.weeklyBudget?.toString() ?? '',
    contactRepliesPerHour: w.contactRepliesPerHour?.toString() ?? '',
})

// '' means the default daily budget, or no weekly budget; anything else must be a positive number
const parseBudget = (s: string) => (s.trim() ? Number(s) : undefined)
const budgetOk = (s: string) => !s.trim() || Number(s) > 0
const repliesOk = (s: string) => !s.trim() || (Number.isInteger(Number(s)) && Number(s) >= 1 && Number(s) <= 1000)

// Mirrors the server's cleanup so the form isn't left "unsaved" after a save
const normalize = (f: Form): Form => ({
    ...f,
    name: f.name.trim(),
    ownerName: f.ownerName.trim(),
    ownerEmail: f.ownerEmail.trim(),
    newContactTag: f.newContactTag.trim().toLowerCase(),
    // The server reads a blank daily budget as the default, and shows it
    dailyBudget: f.dailyBudget.trim() ? String(Number(f.dailyBudget)) : String(DEFAULT_DAILY_BUDGET),
    weeklyBudget: f.weeklyBudget.trim() && String(Number(f.weeklyBudget)),
    contactRepliesPerHour: f.contactRepliesPerHour.trim() ? String(Number(f.contactRepliesPerHour)) : String(DEFAULT_CONTACT_REPLIES_PER_HOUR),
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

function SettingsForm({ workspace }: { workspace: Doc<'workspace'> & { ownerVerified: boolean } }) {
    const run = useRun()
    const update = useMutation(api.workspace.update)
    const agents = useQuery(api.agents.list)
    const runners = useQuery(api.runners.list)
    const [form, setForm] = useState(() => toForm(workspace))
    const [saving, setSaving] = useState(false)

    const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
    const dirty = JSON.stringify(normalize(form)) !== JSON.stringify(toForm(workspace))
    const emailOk = !form.ownerEmail.trim() || handleKind(form.ownerEmail) === 'email'
    const emailing = !!form.ownerEmail.trim() && emailOk && !!runners?.some((r) => r.services?.some((s) => s.service === 'resend' && !s.error))
    const budgetsOk = budgetOk(form.dailyBudget) && budgetOk(form.weeklyBudget) && repliesOk(form.contactRepliesPerHour)
    const valid = form.name.trim() && form.ownerName.trim() && emailOk && form.quietStart && form.quietEnd && budgetsOk
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
                dailyBudget: parseBudget(f.dailyBudget),
                weeklyBudget: parseBudget(f.weeklyBudget),
                contactRepliesPerHour: parseBudget(f.contactRepliesPerHour),
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
                <Row label="Your phone" description="Your own number (or Apple ID email), not one of your agents’. Once you’ve verified it with the code your engine texts, your agents answer you from it and text you handoffs, alerts and check-ins there." htmlFor="s-handle">
                    <OwnerPhone />
                </Row>
                <Row
                    label="Computer use over SMS"
                    description="Lets texts from your phone over SMS (Twilio) use computer use, reminders and watches, not just iMessage. SMS can be faked: anyone who fakes your number could control your engine’s computer. Only turn this on if that computer has nothing important on it."
                    inline>
                    <Toggle label="Computer use over SMS" checked={form.smsPowers} onChange={(v) => set('smsPowers', v)} />
                </Row>
                <Row
                    label="Ask before computer actions"
                    description="Your agent texts you before it types, sends, pays or deletes anything on your computer. Replying YES ALL to one of those texts turns this off. Off, a web page or email on the screen could trick it into doing something you didn’t ask for."
                    inline>
                    <Toggle label="Ask before computer actions" checked={!form.yesAll} onChange={(v) => set('yesAll', !v)} />
                </Row>
                <Row label="Email" description={!emailOk ? 'Enter a valid email address.' : 'Where your engine also emails you, if it has Resend set up.'} error={!emailOk} htmlFor="s-email">
                    <Input id="s-email" type="email" aria-invalid={!emailOk} value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} placeholder="you@example.com" />
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

            <Section
                id="allowed"
                title="Allowed people"
                description="Your agents answer only you and the people on this list. Texts from anyone else are ignored: never read by a model, kept or answered, and you aren’t alerted. So strangers can’t use your AI keys or texting credit. People here get replies, not your powers (computer use, reminders, watches)."
                >
                <AllowedPeople ownerVerified={workspace.ownerVerified} />
            </Section>

            <Section id="messaging" title="Messaging" description="How your agents behave when they text.">
                <Row label="Default agent" description="Answers texts to numbers that have no agent of their own." htmlFor="s-default-agent">
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
                <Row label="Quiet hours" description="Every reply to a text that arrives in quiet hours waits until they end, and so do watch alerts and check-ins. Reminders still go out on time." inline>
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

            <Section
                id="notifications"
                title="Notifications"
                description={
                    emailing
                        ? `Your engine texts these to your phone and emails them to ${form.ownerEmail.trim()}. They name the contact but never quote them.`
                        : 'Your engine texts these to your phone once it’s verified (under General). They name the contact but never quote them. To get them by email too, set up Resend in Connections.'
                }>
                <Row label="New contact" description={`When someone on your Allowed people list texts one of your agents for the first time. At most ${NEW_CONTACT_ALERTS_PER_HOUR} an hour, then one note that more are texting.`} inline>
                    <Toggle label="New contact notifications" checked={form.notifyNewContact} onChange={(v) => set('notifyNewContact', v)} />
                </Row>
                <Row label="Handoffs" description="When an agent needs you to step in." inline>
                    <Toggle label="Handoff notifications" checked={form.notifyHandoff} onChange={(v) => set('notifyHandoff', v)} />
                </Row>
            </Section>

            <Section id="usage" title="Usage budget" description={`${CREDITS_NOTE} When a budget runs out, agents stop replying and hand conversations to you. The daily budget is on from the start, so even the people you allow can’t run up your AI and texting bills. See Analytics for what you used.`}>
                <Row
                    label="Daily budget"
                    description={budgetOk(form.dailyBudget) ? `Credits per day (UTC), about one per reply. Leave blank for the default (${DEFAULT_DAILY_BUDGET}).` : 'Enter a number above 0, or leave blank.'}
                    error={!budgetOk(form.dailyBudget)}
                    htmlFor="s-daily">
                    <Input id="s-daily" inputMode="numeric" aria-invalid={!budgetOk(form.dailyBudget)} value={form.dailyBudget} onChange={(e) => set('dailyBudget', e.target.value)} placeholder={String(DEFAULT_DAILY_BUDGET)} />
                </Row>
                <Row label="Weekly budget" description={budgetOk(form.weeklyBudget) ? 'Credits per week, Monday to Sunday. Leave blank for no cap.' : 'Enter a number above 0, or leave blank.'} error={!budgetOk(form.weeklyBudget)} htmlFor="s-weekly">
                    <Input id="s-weekly" inputMode="numeric" aria-invalid={!budgetOk(form.weeklyBudget)} value={form.weeklyBudget} onChange={(e) => set('weeklyBudget', e.target.value)} placeholder="No cap" />
                </Row>
                <Row
                    label="Replies per contact"
                    description={
                        repliesOk(form.contactRepliesPerHour)
                            ? `The most replies an agent sends one person in an hour. Past it, the agent stops replying to them and tells you once. Your own chats have no limit. Leave blank for the default (${DEFAULT_CONTACT_REPLIES_PER_HOUR}).`
                            : 'Enter a whole number from 1 to 1000, or leave blank.'
                    }
                    error={!repliesOk(form.contactRepliesPerHour)}
                    htmlFor="s-contact-replies">
                    <Input
                        id="s-contact-replies"
                        inputMode="numeric"
                        aria-invalid={!repliesOk(form.contactRepliesPerHour)}
                        value={form.contactRepliesPerHour}
                        onChange={(e) => set('contactRepliesPerHour', e.target.value)}
                        placeholder={String(DEFAULT_CONTACT_REPLIES_PER_HOUR)}
                    />
                </Row>
            </Section>

            <Section id="data" title="Data" description="Conversations and contacts never reach this dashboard; they live on your engine.">
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
