import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
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
import { useRun } from '../use-run'
import { Btn, Cell, Content, Dialog, EmptyState, Field, Row, Scroll, Select, SkeletonRows, Table, Toolbar } from '../ui'

const CHANNEL: Record<Doc<'numbers'>['channel'], { label: string; detail: string }> = {
    twilio: { label: 'Twilio', detail: 'SMS' },
    sendblue: { label: 'Sendblue', detail: 'iMessage' },
    bluebubbles: { label: 'BlueBubbles', detail: 'iMessage' },
}

export function NumbersView() {
    const go = useNav()
    const run = useRun()
    const numbers = useQuery(api.numbers.list)
    const agents = useQuery(api.agents.list)
    const connections = useQuery(api.connections.list)
    const assign = useMutation(api.numbers.assign)
    const remove = useMutation(api.numbers.remove)
    const workspace = useQuery(api.workspace.get)
    const [adding, setAdding] = useState(false)
    const texting = connections?.filter((c) => c.provider === 'twilio' || c.provider === 'sendblue' || c.provider === 'bluebubbles') ?? []

    const add = (
        <Btn variant="primary" onClick={() => (texting.length ? setAdding(true) : go('connections'))}>
            {texting.length ? <Plus /> : <Plug />}
            {texting.length ? 'Add number' : 'Connect texting'}
        </Btn>
    )

    return (
        <Content>
            <Toolbar title="Numbers">{connections && add}</Toolbar>
            <Scroll>
                {numbers?.length === 0 ? (
                    <EmptyState
                        icon={MessageCircle}
                        title="No numbers yet"
                        body={
                            texting.length
                                ? 'Add a number from your connected account, then point it at an agent. People text that number to reach the agent.'
                                : 'First connect a texting account (BlueBubbles or Sendblue for iMessage, Twilio for SMS) in Connections.'
                        }
                        action={connections && add}
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
            {adding && <AddNumberDialog connections={texting} agents={agents ?? []} defaultAgentId={workspace?.defaultAgentId} onClose={() => setAdding(false)} />}
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

type Texting = { _id: Id<'connections'>; provider: 'twilio' | 'sendblue' | 'bluebubbles' | string; label: string; details?: Record<string, string> }

function AddNumberDialog({ connections, agents, defaultAgentId, onClose }: { connections: Texting[]; agents: Doc<'agents'>[]; defaultAgentId?: Id<'agents'>; onClose: () => void }) {
    const [connectionId, setConnectionId] = useState(connections[0]._id)
    const [agentId, setAgentId] = useState<Id<'agents'> | undefined>(defaultAgentId ?? agents[0]?._id)
    const conn = connections.find((c) => c._id === connectionId)!

    return (
        <Dialog title="Add a number" onClose={onClose}>
            {connections.length > 1 && (
                <Field label="Through">
                    <Select value={connectionId} onChange={(v) => setConnectionId(v as Id<'connections'>)} options={connections.map((c) => ({ value: c._id, label: CHANNEL[c.provider as 'twilio'].label }))} />
                </Field>
            )}
            <Field label="Agent" hint="Texts to this number go to this agent.">
                <AgentSelect agents={agents} value={agentId} onChange={setAgentId} />
            </Field>
            {conn.provider === 'twilio' ? <TwilioNumbers agentId={agentId} onDone={onClose} /> : <LineForm connection={conn} agentId={agentId} onDone={onClose} />}
        </Dialog>
    )
}

// Sendblue line or the Mac's iMessage address: already exists, just tell us which it is
function LineForm({ connection, agentId, onDone }: { connection: Texting; agentId?: Id<'agents'>; onDone: () => void }) {
    const run = useRun()
    const addLine = useMutation(api.numbers.addLine)
    const [handle, setHandle] = useState(connection.details?.account ?? '')
    const ok = handleKind(handle) !== null
    const bb = connection.provider === 'bluebubbles'

    return (
        <form
            className="space-y-3.5"
            onSubmit={async (e) => {
                e.preventDefault()
                const res = await run(addLine({ connectionId: connection._id, handle, agentId }))
                if (res.ok) onDone()
            }}>
            <Field
                label={bb ? 'Your iMessage phone number or Apple ID email' : 'Your Sendblue line'}
                hint={handle.trim() && !ok ? 'Enter a phone number or an email address.' : bb ? 'The address the Mac running BlueBubbles sends from.' : 'The number Sendblue gave you, e.g. +1 (415) 555-0123.'}
                error={!!handle.trim() && !ok}>
                <Input autoFocus aria-invalid={!!handle.trim() && !ok} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={bb ? 'you@icloud.com' : '+1 (415) 555-0123'} />
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

type Found = { sid?: string; phoneNumber: string; friendlyName: string; locality?: string; region?: string; smsUrl?: string }

// Twilio: search numbers for sale (bought on your Twilio account) or reuse one you already own
function TwilioNumbers({ agentId, onDone }: { agentId?: Id<'agents'>; onDone: () => void }) {
    const run = useRun()
    const available = useAction(api.numbers.twilioAvailable)
    const existing = useAction(api.numbers.twilioExisting)
    const purchase = useAction(api.numbers.twilioPurchase)
    const reuse = useAction(api.numbers.twilioUse)
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
        const res = await run(next === 'buy' ? available({ country, areaCode: areaCode || undefined }) : existing({}))
        setBusy(null)
        if (!res.ok) return
        if (res.value.ok) setResults(res.value.value)
        else setError(res.value.error)
    }

    const pick = async (n: Found) => {
        setBusy(n.phoneNumber)
        setError('')
        const res = await run(mode === 'buy' ? purchase({ phoneNumber: n.phoneNumber, agentId }) : reuse({ sid: n.sid!, phoneNumber: n.phoneNumber, agentId }))
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
                {mode === 'buy' ? 'Numbers are bought on your Twilio account and Twilio bills you for them. ' : ''}We point the number’s incoming texts here automatically.
            </p>
        </div>
    )
}
