import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useNav } from './nav'
import { useRun } from './use-run'
import { Btn, Dialog, Field, Select } from './ui'

// Sends a text into the dashboard exactly as if it had arrived in iMessage: same contact matching,
// same agent reply, same notifications. Handy before a relay is connected, and for trying an agent out.
export function TestTextDialog({ onClose, agentId }: { onClose: () => void; agentId?: Id<'agents'> }) {
    const go = useNav()
    const run = useRun()
    const simulate = useMutation(api.inbound.simulate)
    const numbers = useQuery(api.numbers.list)
    const agents = useQuery(api.agents.list)
    const usable = (numbers ?? []).filter((n) => n.agentId && (!agentId || n.agentId === agentId))
    const [to, setTo] = useState<string | null>(null)
    const [from, setFrom] = useState('')
    const [name, setName] = useState('')
    const [body, setBody] = useState('')
    const number = to ?? usable[0]?._id ?? ''
    const handle = usable.find((n) => n._id === number)?.handle
    const fromOk = handleKind(from) !== null

    const send = async () => {
        if (!handle) return
        const res = await run(simulate({ to: handle, from, body, name: name.trim() || undefined }))
        if (res.ok) go('conversations', res.value.conversationId)
    }

    return (
        <Dialog
            title="Test a text"
            onClose={onClose}
            footer={
                <>
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!handle || !fromOk || !body.trim()} onClick={send}>
                        Send
                    </Btn>
                </>
            }
        >
            <p className="text-[12px] leading-snug text-neutral-500">The text goes through the same path as a real iMessage, so the agent replies for real and it shows up in Conversations.</p>
            <Field label="To" hint={numbers && !usable.length ? 'Add an iMessage number and assign it to an agent first.' : undefined} error>
                <Select
                    value={number}
                    onChange={setTo}
                    options={usable.map((n) => ({ value: n._id as string, label: `${n.handle} · ${agents?.find((a) => a._id === n.agentId)?.name ?? ''}` }))}
                />
            </Field>
            <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="From (phone or email)" hint={from.trim() && !fromOk ? 'Enter a phone number or an email address.' : undefined} error>
                    <Input autoFocus aria-invalid={!!from.trim() && !fromOk} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="+1 (212) 555-0100" />
                </Field>
                <Field label="Their name" hint="Used if they're new.">
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
            </div>
            <Field label="Message">
                <Textarea className="min-h-20" value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
        </Dialog>
    )
}
