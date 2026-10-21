import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { BadgeCheck } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { handleKey, handleKind } from '@convex/lib/handles'
import { CODE_SENDS_PER_HOUR, CODE_TTL_MS, HOUR_MS } from '@convex/lib/owner'
import { TASK_EXPIRED } from '@convex/lib/tasks'
import { Input } from '@/components/ui/input'
import { codeSender } from './lib/owner'
import { Btn } from './ui'
import { useNow } from './use-now'
import { useRun } from './use-run'

// Settings → Your phone: type it, get a code by text, type the code. Until then agents answer nobody, you included.
export function OwnerPhone() {
    const run = useRun()
    const now = useNow(15_000)
    const phone = useQuery(api.workspace.ownerPhone)
    const runners = useQuery(api.runners.list)
    const numbers = useQuery(api.numbers.list)
    const send = useMutation(api.workspace.sendOwnerCode)
    const confirm = useMutation(api.workspace.confirmOwnerCode)
    const remove = useMutation(api.workspace.removeOwnerHandle)
    const [draft, setDraft] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    if (!phone || !runners || !numbers) return <div className="h-9 w-full" />

    const value = draft ?? phone.handle ?? ''
    const editing = draft !== null || !phone.handle
    const kind = handleKind(value)
    const sameAsSaved = !!phone.handle && handleKey(value) === handleKey(phone.handle)
    const sender = codeSender(runners, numbers, now)
    const sendsLeft = CODE_SENDS_PER_HOUR - phone.sentTimes.filter((t) => now - t < HOUR_MS).length
    const pending = sameAsSaved && !phone.verified ? phone.code : null
    const expired = pending?.sentAt !== undefined && now - pending.sentAt > CODE_TTL_MS

    const sendCode = async () => {
        setBusy(true)
        setError('')
        const res = await run(send({ handle: value }))
        setBusy(false)
        if (res.ok) {
            setDraft(null)
            setCode('')
        }
    }
    const check = async () => {
        setBusy(true)
        const res = await run(confirm({ code }))
        setBusy(false)
        if (!res.ok) return
        if (res.value.ok) {
            setCode('')
            setError('')
        } else setError(res.value.error)
    }

    if (phone.verified && !editing)
        return (
            <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-900">
                    <BadgeCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="truncate">{phone.handle}</span>
                    <span className="sr-only">verified</span>
                </span>
                <Btn onClick={() => setDraft(phone.handle ?? '')}>Change</Btn>
                <Btn variant="danger" onClick={() => void run(remove({}))}>
                    Remove
                </Btn>
            </div>
        )

    const status = pending
        ? pending.status === 'sending'
            ? 'Your engine is texting the code…'
            : pending.status === 'failed'
              ? pending.error === TASK_EXPIRED
                  ? 'Your engine didn’t pick that up in time. Is it running? Send the code again.'
                  : `The code couldn’t be sent: ${pending.error ?? 'unknown problem'}`
              : expired
                ? 'That code has expired. Send a new one.'
                : !pending.attemptsLeft
                  ? 'Too many wrong tries. Send a new code.'
                  : null
        : null
    const canEnter = pending?.status === 'sent' && !expired && pending.attemptsLeft > 0

    return (
        <div className="flex w-full flex-col gap-2">
            <span className="flex gap-2">
                <Input
                    id="s-handle"
                    aria-label="Your phone"
                    aria-invalid={!!value.trim() && !kind}
                    value={value}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="+1 415 555 0100"
                    autoComplete="tel"
                />
                <Btn variant={canEnter ? 'secondary' : 'primary'} onClick={sendCode} disabled={busy || !kind || !sender.ready || sendsLeft <= 0}>
                    {pending && sameAsSaved ? 'Resend' : 'Send code'}
                </Btn>
            </span>
            {canEnter && (
                <span className="flex gap-2">
                    <Input aria-label="Code from the text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" onKeyDown={(e) => e.key === 'Enter' && code.trim() && void check()} />
                    <Btn variant="primary" onClick={check} disabled={busy || !code.trim()}>
                        Verify
                    </Btn>
                </span>
            )}
            <p role="status" className="text-[12px] text-neutral-500">
                {error ? (
                    <span className="text-red-600">{error}</span>
                ) : status ? (
                    <span className="text-amber-700">{status}</span>
                ) : canEnter ? (
                    `Code sent to ${phone.handle}. Type it here within 10 minutes.`
                ) : !sender.ready ? (
                    <span className="text-amber-700">{sender.why}</span>
                ) : sendsLeft <= 0 ? (
                    `You’ve asked for ${CODE_SENDS_PER_HOUR} codes in the last hour. Try again later.`
                ) : value.trim() && !kind ? (
                    <span className="text-red-600">Enter a phone number with its area code, or an Apple ID email.</span>
                ) : phone.handle && !phone.verified && sameAsSaved ? (
                    <span className="text-amber-700">Not verified yet. Until it is, your agents answer nobody and can’t text you.</span>
                ) : (
                    'Your engine texts this number a code.'
                )}
            </p>
            {draft !== null && phone.handle && (
                <Btn variant="ghost" className="self-start sm:self-end" onClick={() => setDraft(null)}>
                    Cancel
                </Btn>
            )}
        </div>
    )
}
