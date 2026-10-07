import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Bot, Plus, Tag } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { blankAgent } from '../lib/draft'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useNav } from '../nav'
import { useRun } from '../use-run'
import { Input } from '@/components/ui/input'
import { AgentAvatar, Btn, Cell, Content, Dialog, EmptyState, Field, PaneItem, PaneLabel, Row, Scroll, SearchInput, SidePane, SkeletonRows, StatusBadge, Table, Toolbar } from '../ui'
import { useNow } from '../use-now'

export function AgentsView() {
    const go = useNav()
    const now = useNow()
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    const [folder, setFolder] = useState<string | null>(null)
    const [q, setQ] = useState('')
    const [creating, setCreating] = useState(false)

    const folders = [...new Set((agents ?? []).flatMap((a) => (a.folder ? [a.folder] : [])))].sort()
    const shown = agents?.filter((a) => (!folder || a.folder === folder) && matches(q, a.name, a.role))

    return (
        <>
            <SidePane>
                <PaneItem active={!folder} onClick={() => setFolder(null)}>
                    <Bot />
                    All Agents
                    <span className="ml-auto text-[11px] text-neutral-400">{agents?.length}</span>
                </PaneItem>
                <PaneLabel>Types</PaneLabel>
                {folders.map((f) => (
                    <PaneItem key={f} active={folder === f} onClick={() => setFolder(f)}>
                        <Tag />
                        {f}
                        <span className="ml-auto text-[11px] text-neutral-400">{agents?.filter((a) => a.folder === f).length}</span>
                    </PaneItem>
                ))}
                {agents && folders.length === 0 && <p className="px-2.5 text-[12px] text-neutral-400">Set a type on an agent to group it here.</p>}
            </SidePane>
            <Content>
                <Toolbar title={folder ?? 'All Agents'}>
                    <SearchInput value={q} onChange={setQ} />
                    <Btn variant="primary" onClick={() => setCreating(true)}>
                        <Plus />
                        Create an Agent
                    </Btn>
                </Toolbar>
                <Scroll>
                    {shown?.length === 0 ? (
                        <EmptyState
                            icon={Bot}
                            title={q || folder ? 'No matching agents' : 'No agents yet'}
                            body={q || folder ? 'Try a different search or type.' : 'Create your first agent, then give it an iMessage number.'}
                            action={!q && !folder && <Btn variant="primary" onClick={() => setCreating(true)}><Plus />Create an Agent</Btn>}
                        />
                    ) : (
                        <Table head={['Agent', 'Role', 'iMessage', 'Status', 'Edited']}>
                            {!shown ? (
                                <SkeletonRows cols={5} />
                            ) : (
                                shown.map((a) => (
                                    <Row key={a._id} onClick={() => go('agents', a._id)}>
                                        <Cell>
                                            <span className="flex items-center gap-2.5">
                                                <AgentAvatar agent={a} />
                                                <span className="font-medium text-neutral-900">{a.name}</span>
                                            </span>
                                        </Cell>
                                        <Cell>{a.role}</Cell>
                                        <Cell>
                                            {numbers?.filter((n) => n.agentId === a._id).map((n) => n.handle).join(', ') || <span className="text-neutral-400">None</span>}
                                        </Cell>
                                        <Cell>
                                            <StatusBadge status={a.status} />
                                        </Cell>
                                        <Cell className="text-neutral-500">{relativeTime(a.updatedAt, now)}</Cell>
                                    </Row>
                                ))
                            )}
                        </Table>
                    )}
                </Scroll>
            </Content>
            {creating && <NewAgentDialog onClose={() => setCreating(false)} />}
        </>
    )
}

function NewAgentDialog({ onClose }: { onClose: () => void }) {
    const go = useNav()
    const run = useRun()
    const create = useMutation(api.agents.create)
    const [name, setName] = useState('')
    const [role, setRole] = useState('')

    const submit = async () => {
        const res = await run(create(blankAgent(name.trim(), role.trim())))
        if (res.ok) go('agents', res.value)
    }

    return (
        <Dialog
            title="Create an agent"
            onClose={onClose}
            footer={
                <>
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!name.trim()} onClick={submit}>
                        Create
                    </Btn>
                </>
            }
        >
            <Field label="Name">
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Iris" />
            </Field>
            <Field label="Role" hint="What it handles. You can change everything later.">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Scheduling" />
            </Field>
        </Dialog>
    )
}
