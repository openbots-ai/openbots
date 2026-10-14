import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, Bell, BookOpen, MessageCircle } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AgentConfigBar } from '@/components/agent-config-bar'
import { LIVE_SLOTS, resolveModels, type SlotId } from '@convex/lib/models'
import { INHERIT } from '@convex/lib/models'
import { DEFAULT_CONFIG } from '@/lib/agent-options'
import { AVATARS, pickAgentFields, type AgentFields, type AgentStatus } from '../lib/draft'
import { useNav } from '../nav'
import { useKeyModels, withKeyOptions } from '../lib/key-models'
import { CheckIns } from '../check-ins'
import { NoKeyNote } from '../slot-select'
import { useRun } from '../use-run'
import { AgentAvatar, Btn, ConfirmDelete, Content, Field, NotFound, Scroll, Select, StatusBadge, Toolbar } from '../ui'

const NO_NUMBER = 'none'

const avatarCls = (selected: boolean) => cn('size-auto rounded-full p-0 ring-2 ring-offset-2 hover:bg-transparent', selected ? 'ring-neutral-900' : 'ring-transparent')

export function AgentDetail({ id }: { id: string }) {
    const go = useNav()
    const agent = useQuery(api.agents.get, { id })
    if (agent === undefined) return <Content><Toolbar title="Loading…" /></Content>
    if (agent === null) return <NotFound what="agent" onBack={() => go('agents')} />
    return <AgentEditor agent={agent} />
}

function AgentEditor({ agent }: { agent: Doc<'agents'> }) {
    const go = useNav()
    const run = useRun()
    const update = useMutation(api.agents.update)
    const remove = useMutation(api.agents.remove)
    const assign = useMutation(api.numbers.assign)
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    const knowledge = useQuery(api.knowledge.list)
    const workspace = useQuery(api.workspace.get)
    const computers = useQuery(api.runners.list)
    const jobs = (computers ?? []).flatMap((r) => r.jobs ?? []).filter((j) => j.agentId === agent._id).reduce((sum, j) => ({ reminders: sum.reminders + j.reminders, watches: sum.watches + j.watches }), { reminders: 0, watches: 0 })
    const [form, setForm] = useState(() => pickAgentFields(agent))

    const set = <K extends keyof AgentFields>(key: K, value: AgentFields[K]) => setForm((f) => ({ ...f, [key]: value }))
    const fieldsDirty = JSON.stringify(pickAgentFields(form)) !== JSON.stringify(pickAgentFields(agent))
    // What this agent picked for each slot (INHERIT when it follows the workspace)
    const slotValue = (slot: SlotId) => form.models?.[slot] ?? (slot === 'brain' ? form.model : undefined) ?? INHERIT
    const setSlot = (slot: SlotId, id: string) => {
        const next = { ...form.models }
        if (id === INHERIT) delete next[slot]
        else next[slot] = id
        set('models', next)
        // The old single `model` field is the brain's override for agents made before slots
        if (slot === 'brain') set('model', undefined)
    }
    // The models your keys can use, and what each slot would use if this agent didn't pick its own. That depends on
    // the agent's other picks: Backup's default comes from a provider other than its Brain's.
    const available = useKeyModels() ?? []
    const inheritedFor = (slot: SlotId) => {
        const others = { ...form.models }
        delete others[slot]
        return resolveModels(workspace?.models, others, slot === 'brain' ? undefined : form.model, available)[slot].option
    }
    const folders = [...new Set((agents ?? []).flatMap((a) => (a.folder ? [a.folder] : [])))]
    const myNumbers = numbers?.filter((n) => n.agentId === agent._id) ?? []
    // The phone number is picked here but only assigned on Save, like every other field.
    // null means "not touched", so the picker follows the live assignment until you change it.
    const [numberChoice, setNumberChoice] = useState<string | null>(null)
    const currentNumber = myNumbers[0]?._id ?? NO_NUMBER
    const numberId = numberChoice ?? currentNumber
    const numberDirty = numberChoice !== null && numberChoice !== currentNumber
    const freeNumbers = numbers?.filter((n) => !n.agentId || n.agentId === agent._id) ?? []
    const dirty = fieldsDirty || numberDirty
    const myDocs = knowledge?.filter((k) => k.agentId === agent._id) ?? []

    const save = async () => {
        if (fieldsDirty) {
            const res = await run(update({ id: agent._id, ...form, name: form.name.trim(), folder: form.folder?.trim() || undefined }))
            if (!res.ok) return
        }
        if (numberDirty) {
            if (currentNumber !== NO_NUMBER) await run(assign({ id: currentNumber as Id<'numbers'>, agentId: undefined }))
            if (numberChoice !== NO_NUMBER) await run(assign({ id: numberChoice as Id<'numbers'>, agentId: agent._id }))
            setNumberChoice(null)
        }
    }
    const destroy = async () => {
        const res = await run(remove({ id: agent._id }))
        if (res.ok) go('agents')
    }

    return (
        <Content>
            <Toolbar
                title={
                    <>
                        <Btn variant="ghost" size="icon-sm" aria-label="Back to agents" onClick={() => go('agents')} className="text-neutral-500">
                            <ArrowLeft />
                        </Btn>
                        <AgentAvatar agent={form} size={24} />
                        <span className="truncate">{agent.name}</span>
                        <StatusBadge status={agent.status} />
                    </>
                }
            >
                <ConfirmDelete onConfirm={destroy} what={agent.name} />
                <Btn variant="primary" disabled={!dirty || !form.name.trim()} onClick={save}>
                    {dirty ? 'Save changes' : 'Saved'}
                </Btn>
            </Toolbar>
            <div className="border-b border-neutral-200/70 px-4 py-2.5">
                <AgentConfigBar
                    model={resolveModels(workspace?.models, form.models, form.model, available).brain.option.id}
                    models={available}
                    noModels={<NoKeyNote />}
                    language={form.language ?? DEFAULT_CONFIG.language}
                    temperature={form.temperature}
                    replyLength={form.replyLength}
                    onModelChange={(id) => setSlot('brain', id)}
                    onLanguageChange={(id) => set('language', id)}
                    onTemperatureChange={(value) => set('temperature', value)}
                    onReplyLengthChange={(value) => set('replyLength', value)}
                    voice={form.voice ?? DEFAULT_CONFIG.voice}
                    showVoice={false}
                    slots={LIVE_SLOTS.filter((slot) => slot.id !== 'brain').map((slot) => ({
                        slot: withKeyOptions(slot, available, slotValue(slot.id)),
                        value: slotValue(slot.id),
                        inherited: inheritedFor(slot.id),
                        onChange: (id: string) => setSlot(slot.id, id),
                    }))}
                />
            </div>
            <Scroll>
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label="Name">
                                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
                            </Field>
                            <Field label="Role">
                                <Input value={form.role} onChange={(e) => set('role', e.target.value)} />
                            </Field>
                            <Field label="Status" hint="Only live agents reply on their own. Draft and paused agents leave texts for you.">
                                <Select<AgentStatus>
                                    value={form.status}
                                    onChange={(v) => set('status', v)}
                                    options={[
                                        { value: 'draft', label: 'Draft' },
                                        { value: 'live', label: 'Live' },
                                        { value: 'paused', label: 'Paused' },
                                    ]}
                                />
                            </Field>
                            <Field label="Type">
                                <Input list="agent-folders" value={form.folder ?? ''} onChange={(e) => set('folder', e.target.value || undefined)} placeholder="None" />
                                <datalist id="agent-folders">
                                    {folders.map((f) => (
                                        <option key={f} value={f} />
                                    ))}
                                </datalist>
                            </Field>
                        </div>
                        <div className="space-y-1.5">
                            <span className="block text-xs font-medium text-neutral-600">Avatar</span>
                            <div className="flex flex-wrap gap-2">
                                <Btn variant="ghost" aria-label="No avatar" aria-pressed={!form.avatar} onClick={() => set('avatar', undefined)} className={avatarCls(!form.avatar)}>
                                    <AgentAvatar agent={{ ...form, avatar: undefined }} size={36} />
                                </Btn>
                                {AVATARS.map((src) => (
                                    <Btn key={src} variant="ghost" aria-label={`Use ${src.split('/').pop()?.replace('.webp', '')}`} aria-pressed={form.avatar === src} onClick={() => set('avatar', src)} className={avatarCls(form.avatar === src)}>
                                        <AgentAvatar agent={{ ...form, avatar: src }} size={36} />
                                    </Btn>
                                ))}
                            </div>
                        </div>
                        <Field label="Personality & instructions" hint="How it talks, what it handles, and what it should hand back to you.">
                            <Textarea className="min-h-40 leading-relaxed" value={form.prompt} onChange={(e) => set('prompt', e.target.value)} />
                        </Field>
                        <Field label="Phone number" hint={freeNumbers.length ? 'The number people text to reach this agent.' : 'No free numbers. Add one in Numbers.'}>
                            <Select<string>
                                value={numberId}
                                onChange={setNumberChoice}
                                options={[{ value: NO_NUMBER, label: 'None' }, ...freeNumbers.map((n) => ({ value: n._id as string, label: n.handle }))]}
                            />
                        </Field>
                    </div>

                    <div className="space-y-4">
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-1 flex items-center gap-2 text-[13px] font-medium"><Bell className="size-4 text-neutral-500" />Check-ins</h2>
                            <p className="mb-2 text-[12px] text-neutral-500">Texts {agent.name} sends you on a schedule, in your timezone.</p>
                            {/* Check-ins go to the phone in Settings; without one the engine skips them */}
                            {workspace && !workspace.ownerHandle && <p className="mb-2 text-[12px] text-amber-700">Add your phone in Settings so {agent.name} can text you.</p>}
                            <CheckIns agent={agent} />
                            {(jobs.reminders > 0 || jobs.watches > 0) && (
                                <p className="mt-3 text-[12px] text-neutral-500">
                                    {jobs.reminders} reminder{jobs.reminders === 1 ? '' : 's'} and {jobs.watches} watch{jobs.watches === 1 ? '' : 'es'} active. Text {agent.name} to list or cancel them.
                                </p>
                            )}
                        </section>
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><MessageCircle className="size-4 text-neutral-500" />iMessage</h2>
                            {myNumbers.length ? (
                                <ul className="space-y-1 text-[13px] text-neutral-700">{myNumbers.map((n) => <li key={n._id}>{n.handle}</li>)}</ul>
                            ) : (
                                <p className="text-[13px] text-neutral-500">No number yet. People can't text this agent until it has one.</p>
                            )}
                            <Btn className="mt-3" onClick={() => go('numbers')}>Manage numbers</Btn>
                        </section>
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><BookOpen className="size-4 text-neutral-500" />Knowledge</h2>
                            {myDocs.length ? (
                                <ul className="space-y-1 text-[13px] text-neutral-700">{myDocs.map((k) => <li key={k._id} className="truncate">{k.title}</li>)}</ul>
                            ) : (
                                <p className="text-[13px] text-neutral-500">No documents. Add some so it knows your rules.</p>
                            )}
                            <Btn className="mt-3" onClick={() => go('knowledge')}>Manage knowledge</Btn>
                        </section>
                    </div>
                </div>
            </Scroll>
        </Content>
    )
}
