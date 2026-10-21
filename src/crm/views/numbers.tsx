import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Mail, MessageCircle, Phone, Plug, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useNav } from '../nav'
import { useEngineTask } from '../use-engine-task'
import { useRun } from '../use-run'
import { Btn, Cell, Content, Dialog, EmptyState, Field, Row, Scroll, Select, SkeletonRows, Table, Toolbar } from '../ui'

type Channel = Doc<'numbers'>['channel']

const CHANNEL: Record<Channel, { label: string; detail: string }> = {
    mac: { label: 'Messages on a Mac', detail: 'iMessage' },
    relay: { label: 'Your relay', detail: 'Relay' },
    twilio: { label: 'Twilio', detail: 'SMS' },
    sendblue: { label: 'Sendblue', detail: 'iMessage' },
    bluebubbles: { label: 'BlueBubbles', detail: 'iMessage' },
}

export function NumbersView() {
    const go = useNav()
    const run = useRun()
    const numbers = useQuery(api.numbers.list)
    const agents = useQuery(api.agents.list)
    const runners = useQuery(api.runners.list)
    const assign = useMutation(api.numbers.assign)
    const remove = useMutation(api.numbers.remove)
    const workspace = useQuery(api.workspace.get)
    const [adding, setAdding] = useState(false)
    // The ways your agents can text, and the addresses they reported for them
    const texting = [...new Set(runners?.flatMap((r) => r.channels ?? []) ?? [])]
    const lines = runners?.flatMap((r) => r.lines ?? []) ?? []

    const add = (
        <Btn variant="primary" onClick={() => (texting.length ? setAdding(true) : go('connections'))}>
            {texting.length ? <Plus /> : <Plug />}
            {texting.length ? 'Add number' : 'Set up texting'}
        </Btn>
    )

    return (
        <Content>
            <Toolbar title="Numbers">{runners && add}</Toolbar>
            <Scroll>
                {numbers?.length === 0 ? (
                    <EmptyState
                        icon={MessageCircle}
                        title="No numbers yet"
                        body={
                            texting.length
                                ? 'Add a number your engine texts from, then point it at an agent. You and the people in Settings → Allowed people text that number to reach the agent; texts from anyone else are ignored.'
                                : 'First set up texting in Connections (Messages on a Mac, BlueBubbles or Sendblue for iMessage, Twilio for SMS).'
                        }
                        action={runners && add}
                    />
                ) : (
                    <Table head={['Number', 'Through', 'Agent', '']}>
                        {!numbers ? (
                            <SkeletonRows cols={4} />
                        ) : (
                            numbers.map((n) => (
                                <Row key={n._id}>
                                    <Cell className="font-medium text-neutral-900">
                                        <span className="flex items-center gap-1.5">
                                            {n.kind === 'phone' ? <Phone className="size-3.5 text-neutral-400" /> : <Mail className="size-3.5 text-neutral-400" />}
                                            {n.handle}
                                        </span>
                                    </Cell>
                                    <Cell>
                                        <span className="flex items-center gap-1.5">
                                            {CHANNEL[n.channel].label}
                                            <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-normal">
                                                {CHANNEL[n.channel].detail}
                                            </Badge>
                                        </span>
                                    </Cell>
                                    <Cell>
                                        <AgentSelect agents={agents ?? []} value={n.agentId} onChange={(agentId) => run(assign({ id: n._id, agentId }))} className="max-w-56" />
                                    </Cell>
                                    <Cell className="w-12 text-right">
                                        <Btn variant="ghost" size="icon-sm" aria-label={`Remove ${n.handle}`} title={n.channel === 'twilio' ? 'Stops using it here. It stays in your Twilio account.' : 'Remove'} onClick={() => run(remove({ id: n._id }))}>
                                            <Trash2 />
                                        </Btn>
                                    </Cell>
                                </Row>
                            ))
                        )}
                    </Table>
                )}
            </Scroll>
            {adding && <AddNumberDialog channels={texting} lines={lines} agents={agents ?? []} defaultAgentId={workspace?.defaultAgentId} onClose={() => setAdding(false)} />}
        </Content>
    )
}

function AgentSelect({ agents, value, onChange, className }: { agents: Doc<'agents'>[]; value?: Id<'agents'>; onChange: (id?: Id<'agents'>) => void; className?: string }) {
    return (
        <Select
            aria-label="Agent"
            className={className}
            value={value ?? ''}
            onChange={(v) => onChange(v ? (v as Id<'agents'>) : undefined)}
            options={[{ value: '', label: 'Unassigned' }, ...agents.map((a) => ({ value: a._id, label: a.name }))]}
        />
    )
}

type Line = NonNullable<Doc<'runners'>['lines']>[number]

function AddNumberDialog({ channels, lines, agents, defaultAgentId, onClose }: { channels: Channel[]; lines: Line[]; agents: Doc<'agents'>[]; defaultAgentId?: Id<'agents'>; onClose: () => void }) {
    const [channel, setChannel] = useState(channels[0])
    const [agentId, setAgentId] = useState<Id<'agents'> | undefined>(defaultAgentId ?? agents[0]?._id)

    return (
        <Dialog title="Add a number" onClose={onClose}>
            {channels.length > 1 && (
                <Field label="Through">
                    <Select value={channel} onChange={(v) => setChannel(v as Channel)} options={channels.map((c) => ({ value: c, label: CHANNEL[c].label }))} />
                </Field>
            )}
            <Field label="Agent" hint="Texts to this number go to this agent.">
                <AgentSelect agents={agents} value={agentId} onChange={setAgentId} />
            </Field>
            {channel === 'twilio' ? <TwilioNumbers agentId={agentId} onDone={onClose} /> : <LineForm key={channel} channel={channel} suggested={lines.find((l) => l.channel === channel)?.handle} agentId={agentId} onDone={onClose} />}
        </Dialog>
    )
}

// A line that already exists (your Mac's iMessage address, a Sendblue line, your relay's number): just say which
function LineForm({ channel, suggested, agentId, onDone }: { channel: Channel; suggested?: string; agentId?: Id<'agents'>; onDone: () => void }) {
    const run = useRun()
    const addLine = useMutation(api.numbers.add)
    const [handle, setHandle] = useState(suggested ?? '')
    const ok = handleKind(handle) !== null
    const imessage = channel === 'bluebubbles' || channel === 'mac'

    return (
        <form
            className="space-y-3.5"
            onSubmit={async (e) => {
                e.preventDefault()
                const res = await run(addLine({ channel, handle, agentId }))
                if (res.ok) onDone()
            }}>
            <Field
                label={imessage ? 'Your iMessage phone number or Apple ID email' : channel === 'sendblue' ? 'Your Sendblue line' : 'The number your relay texts from'}
                hint={handle.trim() && !ok ? 'Enter a phone number or an email address.' : imessage ? 'The address that Mac sends from.' : 'e.g. +1 (415) 555-0123.'}
                error={!!handle.trim() && !ok}>
                <Input autoFocus aria-invalid={!!handle.trim() && !ok} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={imessage ? 'you@icloud.com' : '+1 (415) 555-0123'} />
            </Field>
            <div className="flex justify-end">
                <Btn type="submit" variant="primary" disabled={!ok}>
                    Add number
                </Btn>
            </div>
        </form>
    )
}

const COUNTRIES = [
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'AU', label: 'Australia' },
]

type Found = { sid?: string; phoneNumber: string; friendlyName: string; locality?: string; region?: string }

// Twilio: search numbers for sale (bought on your Twilio account) or reuse one you already own. Your engine does the
// talking to Twilio; the dashboard only sees the numbers.
function TwilioNumbers({ agentId, onDone }: { agentId?: Id<'agents'>; onDone: () => void }) {
    const run = useRun()
    const task = useEngineTask()
    const [mode, setMode] = useState<'buy' | 'own'>('buy')
    const [country, setCountry] = useState('US')
    const [areaCode, setAreaCode] = useState('')
    const [results, setResults] = useState<Found[] | null>(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState<string | null>(null)

    const load = async (next: 'buy' | 'own') => {
        setBusy('search')
        setError('')
        setResults(null)
        const res = await run(task(next === 'buy' ? { kind: 'twilioSearch', country, areaCode: areaCode || undefined } : { kind: 'twilioOwned' }))
        setBusy(null)
        if (!res.ok) return
        if (res.value.ok) setResults('numbers' in res.value.value ? res.value.value.numbers : [])
        else setError(res.value.error)
    }

    const pick = async (n: Found) => {
        setBusy(n.phoneNumber)
        setError('')
        const res = await run(task(mode === 'buy' ? { kind: 'twilioBuy', phoneNumber: n.phoneNumber, agentId } : { kind: 'twilioUse', sid: n.sid!, phoneNumber: n.phoneNumber, agentId }))
        setBusy(null)
        if (!res.ok) return
        if (res.value.ok) onDone()
        else setError(res.value.error)
    }

    return (
        <div className="space-y-3">
            <ToggleGroup
                value={[mode]}
                onValueChange={(v: string[]) => {
                    if (!v[0]) return
                    setMode(v[0] as 'buy' | 'own')
                    setResults(null)
                    setError('')
                    if (v[0] === 'own') void load('own')
                }}
                variant="outline"
                size="sm"
                className="w-full">
                <ToggleGroupItem value="buy" className="flex-1 text-[12px]">
                    Buy a new number
                </ToggleGroupItem>
                <ToggleGroupItem value="own" className="flex-1 text-[12px]">
                    Use one I have
                </ToggleGroupItem>
            </ToggleGroup>

            {mode === 'buy' && (
                <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void load('buy')
                    }}>
                    <Field label="Country">
                        <Select value={country} onChange={setCountry} options={COUNTRIES} className="w-40" />
                    </Field>
                    <Field label="Area code">
                        <Input inputMode="numeric" value={areaCode} onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Any" className="w-24" />
                    </Field>
                    <Btn type="submit" disabled={busy === 'search'}>
                        <Search />
                        Search
                    </Btn>
                </form>
            )}

            {error && (
                <p role="alert" className="text-destructive text-[13px]">
                    {error}
                </p>
            )}

            {busy === 'search' && <Skeleton className="h-32 rounded-md" />}
            {results && (
                <ul className="max-h-64 divide-y divide-neutral-100 overflow-y-auto rounded-md border">
                    {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-neutral-400">{mode === 'buy' ? 'No numbers found. Try another area code.' : 'No numbers in your Twilio account yet.'}</li>}
                    {results.map((n) => (
                        <li key={n.phoneNumber} className="flex items-center gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-medium">{n.friendlyName}</span>
                                <span className="block truncate text-[11px] text-neutral-500">{[n.locality, n.region].filter(Boolean).join(', ') || n.phoneNumber}</span>
                            </span>
                            <Btn variant={mode === 'buy' ? 'primary' : 'secondary'} disabled={!!busy} onClick={() => pick(n)} className={cn(busy === n.phoneNumber && 'opacity-70')}>
                                {busy === n.phoneNumber ? 'Setting up…' : mode === 'buy' ? 'Buy' : 'Use'}
                            </Btn>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-[11px] leading-snug text-neutral-400">
                {mode === 'buy' ? 'Numbers are bought on your Twilio account and Twilio bills you for them. ' : ''}Your engine points the number’s incoming texts at itself.
            </p>
        </div>
    )
}
