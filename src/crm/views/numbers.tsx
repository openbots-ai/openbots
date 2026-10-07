import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Mail, MessageCircle, Phone, Plus, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { Input } from '@/components/ui/input'
import { useRun } from '../use-run'
import { Btn, Cell, Content, Dialog, EmptyState, Field, Row, Scroll, Select, SkeletonRows, Table, Toolbar } from '../ui'

export function NumbersView() {
    const run = useRun()
    const numbers = useQuery(api.numbers.list)
    const agents = useQuery(api.agents.list)
    const assign = useMutation(api.numbers.assign)
    const remove = useMutation(api.numbers.remove)
    const workspace = useQuery(api.workspace.get)
    const [adding, setAdding] = useState(false)

    return (
        <Content>
            <Toolbar title="iMessage Numbers">
                <Btn variant="primary" onClick={() => setAdding(true)}>
                    <Plus />
                    Add number
                </Btn>
            </Toolbar>
            <Scroll>
                {numbers?.length === 0 ? (
                    <EmptyState icon={MessageCircle} title="No numbers yet" body="Add a phone number or Apple ID email, then point it at an agent." action={<Btn variant="primary" onClick={() => setAdding(true)}><Plus />Add number</Btn>} />
                ) : (
                    <Table head={['Handle', 'Type', 'Agent', '']}>
                        {!numbers ? (
                            <SkeletonRows cols={4} />
                        ) : (
                            numbers.map((n) => (
                                <Row key={n._id}>
                                    <Cell className="font-medium text-neutral-900">{n.handle}</Cell>
                                    <Cell>
                                        <span className="flex items-center gap-1.5 text-neutral-500">
                                            {n.kind === 'phone' ? <Phone className="size-3.5" /> : <Mail className="size-3.5" />}
                                            {n.kind === 'phone' ? 'Phone' : 'Email'}
                                        </span>
                                    </Cell>
                                    <Cell>
                                        <AgentSelect agents={agents ?? []} value={n.agentId} onChange={(agentId) => run(assign({ id: n._id, agentId }))} className="max-w-56" />
                                    </Cell>
                                    <Cell className="w-12 text-right">
                                        <Btn variant="ghost" size="icon-sm" aria-label={`Remove ${n.handle}`} onClick={() => run(remove({ id: n._id }))}>
                                            <Trash2 />
                                        </Btn>
                                    </Cell>
                                </Row>
                            ))
                        )}
                    </Table>
                )}
            </Scroll>
            {adding && <AddNumberDialog agents={agents ?? []} defaultAgentId={workspace?.defaultAgentId} onClose={() => setAdding(false)} />}
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

function AddNumberDialog({ agents, defaultAgentId, onClose }: { agents: Doc<'agents'>[]; defaultAgentId?: Id<'agents'>; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.numbers.create)
    const [handle, setHandle] = useState('')
    const [agentId, setAgentId] = useState<Id<'agents'> | undefined>(defaultAgentId)
    const ok = handleKind(handle) !== null

    const save = async () => {
        const res = await run(create({ handle, agentId }))
        if (res.ok) onClose()
    }

    return (
        <Dialog title="Add iMessage number" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!ok} onClick={save}>Add</Btn></>}>
            <Field label="Phone number or Apple ID email" hint={handle.trim() && !ok ? 'Enter a phone number or an email address.' : undefined} error>
                <Input autoFocus aria-invalid={!!handle.trim() && !ok} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="+1 (415) 555-0100" />
            </Field>
            <Field label="Agent">
                <AgentSelect agents={agents} value={agentId} onChange={setAgentId} />
            </Field>
        </Dialog>
    )
}
