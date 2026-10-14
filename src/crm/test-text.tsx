import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Check } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { Input } from '@/components/ui/input'
import { useEngineTask } from './use-engine-task'
import { Btn, Select } from './ui'

const GREETING = 'Hi! This is your OpenBots agent saying hello. Texting works 👋'

// Sends one text from one of your Twilio numbers, through your engine (which holds your Twilio login), to check that
// texting works end to end
export function TestText() {
    const numbers = useQuery(api.numbers.list)
    const task = useEngineTask()
    const twilio = (numbers ?? []).filter((n) => n.channel === 'twilio')
    const [open, setOpen] = useState(false)
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [body, setBody] = useState(GREETING)
    const [state, setState] = useState<{ sending?: boolean; sentTo?: string; error?: string }>({})

    if (!twilio.length) return <p className="text-[12px] text-neutral-500">Add a Twilio number in Numbers to send a test text.</p>
    const sender = from || twilio[0].handle

    const send = async () => {
        setState({ sending: true })
        try {
            const res = await task({ kind: 'twilioTestText', from: sender, to, body })
            setState(res.ok && 'sentTo' in res.value ? { sentTo: res.value.sentTo } : { error: res.ok ? 'Your engine didn’t confirm the text' : res.error })
        } catch (e) {
            // Convex prefixes server errors with request metadata; keep the human part
            const msg = e instanceof Error ? e.message : String(e)
            setState({ error: msg.match(/Uncaught Error: (.*?)(?:\n|\s+at |$)/)?.[1] ?? 'Couldn’t send that. Try again.' })
        }
    }

    if (!open) return <Btn onClick={() => setOpen(true)}>Send a test text</Btn>

    return (
        <form
            className="space-y-2"
            onSubmit={(e) => {
                e.preventDefault()
                void send()
            }}>
            {twilio.length > 1 && <Select<string> value={sender} onChange={setFrom} options={twilio.map((n) => ({ value: n.handle, label: `From ${n.handle}` }))} />}
            {twilio.length === 1 && <p className="text-[12px] text-neutral-500">From {sender}</p>}
            <Input aria-label="Phone number to text" type="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To, e.g. +1 639 555 0100" className="h-8" />
            <Input aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={320} className="h-8" />
            {state.error && <p className="text-[12px] text-destructive">{state.error}</p>}
            {state.sentTo && (
                <p className="flex items-center gap-1.5 text-[12px] text-emerald-700">
                    <Check className="size-3.5" />
                    Sent to {state.sentTo}. Twilio delivers it in a few seconds.
                </p>
            )}
            <div className="flex gap-2">
                <Btn type="submit" variant="primary" disabled={state.sending || !to.trim() || !body.trim()} className="flex-1">
                    {state.sending ? 'Sending…' : 'Send'}
                </Btn>
                <Btn type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Close
                </Btn>
            </div>
        </form>
    )
}
