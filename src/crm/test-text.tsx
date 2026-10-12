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

// Texts an agent from the dashboard: the reply is written by the real model with your key, using its memory and
// knowledge, but the conversation is marked as a test and nothing is sent to any phone.
export function TestTextDialog({ onClose, agentId: fixedAgent }: { onClose: () => void; agentId?: Id<'agents'> }) {
    const go = useNav()
    const run = useRun()
    const simulate = useMutation(api.inbound.simulate)
    const agents = useQuery(api.agents.list)
    const [picked, setPicked] = useState<string | null>(null)
    const [from, setFrom] = useState('')
    const [name, setName] = useState('')
    const [body, setBody] = useState('')
    const agentId = fixedAgent ?? picked ?? agents?.[0]?._id
    const fromOk = handleKind(from) !== null

    const send = async () => {
        if (!agentId) return
        const res = await run(simulate({ agentId: agentId as Id<'agents'>, from, body, name: name.trim() || undefined }))
        if (res.ok) go('conversations', res.value.conversationId)
    }

    return (
        <Dialog
            title="Test a text"
            onClose={onClose}
            footer={
                <>
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!agentId || !fromOk || !body.trim()} onClick={send}>
                        Send
                    </Btn>
                </>
            }>
            <p className="text-[12px] leading-snug text-neutral-500">The agent replies for real, with your AI key, its knowledge and what it remembers. It shows up in Conversations marked as a test, and nothing is sent to any phone.</p>
            {!fixedAgent && (
                <Field label="To">
                    <Select value={agentId ?? ''} onChange={setPicked} options={(agents ?? []).map((a) => ({ value: a._id as string, label: `${a.name} · ${a.role}` }))} />
                </Field>
            )}
            <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Pretend to be (phone or email)" hint={from.trim() && !fromOk ? 'Enter a phone number or an email address.' : undefined} error>
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
