import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Trash2, X } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { handleKind } from '@convex/lib/handles'
import { dayKey } from '@convex/lib/usage'
import { Input } from '@/components/ui/input'
import { ignoredLine } from './lib/owner'
import { relativeTime } from './lib/time'
import { Btn } from './ui'
import { useNow } from './use-now'
import { useRun } from './use-run'

// Settings → Allowed people: who your agents answer besides you, and the strangers they ignored
export function AllowedPeople({ ownerVerified }: { ownerVerified: boolean }) {
    const run = useRun()
    const now = useNow()
    const people = useQuery(api.allowed.list)
    const ignored = useQuery(api.allowed.ignored, { today: dayKey(now) })
    const add = useMutation(api.allowed.add)
    const remove = useMutation(api.allowed.remove)
    const dismiss = useMutation(api.allowed.dismiss)
    const [name, setName] = useState('')
    const [handle, setHandle] = useState('')
    const [busy, setBusy] = useState(false)
    const handleOk = !handle.trim() || !!handleKind(handle)

    const save = async () => {
        setBusy(true)
        const res = await run(add({ name, handle }))
        setBusy(false)
        if (res.ok) {
            setName('')
            setHandle('')
        }
    }

    return (
        <div className="space-y-4 px-5 py-4">
            {!ownerVerified && (
                <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                    Your phone isn’t verified yet (under General), so your agents answer nobody right now, not even the people below.
                </p>
            )}
            {people === undefined ? (
                <div className="h-10" />
            ) : people.length ? (
                <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                    {people.map((p) => (
                        <li key={p._id} className="flex items-center gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] text-neutral-900">{p.name}</span>
                                <span className="block truncate text-[12px] text-neutral-500">{p.handle}</span>
                            </span>
                            <Btn size="icon-sm" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => void run(remove({ id: p._id }))}>
                                <Trash2 />
                            </Btn>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[12px] text-neutral-500">Nobody yet. Your agents answer only you.</p>
            )}

            <form
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                onSubmit={(e) => {
                    e.preventDefault()
                    void save()
                }}>
                <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
                <Input aria-label="Phone or Apple ID email" aria-invalid={!handleOk} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Phone or Apple ID email" />
                <Btn type="submit" variant="primary" disabled={busy || !name.trim() || !handle.trim() || !handleOk}>
                    Add
                </Btn>
            </form>
            {!handleOk && <p className="text-[12px] text-red-600">Enter a phone number with its area code, or an Apple ID email.</p>}

            {ignored && (ignored.today > 0 || ignored.recent.length > 0) && (
                <div className="space-y-2 border-t border-neutral-100 pt-4">
                    <p className="text-[12px] text-neutral-600">{ignoredLine(ignored.today) || 'No texts from people not on your list were ignored today.'} Your engine didn’t read, keep or answer them.</p>
                    {ignored.recent.length > 0 && (
                        <ul className="space-y-1">
                            {ignored.recent.map((r) => (
                                <li key={r._id} className="flex items-center gap-2 text-[13px]">
                                    <span className="min-w-0 flex-1 truncate text-neutral-700">
                                        {r.handle} <span className="text-[11px] text-neutral-400">{relativeTime(r.at, now)}</span>
                                    </span>
                                    <Btn onClick={() => void run(add({ name: r.handle, handle: r.handle }))}>Allow</Btn>
                                    <Btn size="icon-sm" variant="ghost" aria-label={`Forget ${r.handle}`} onClick={() => void run(dismiss({ id: r._id }))}>
                                        <X />
                                    </Btn>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
