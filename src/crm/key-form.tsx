import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, Lock } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { checkFields, FIELDS, seal, sealContext, type SealedService } from '@convex/lib/sealed'
import { Input } from '@/components/ui/input'
import { relativeTime } from './lib/time'
import { useNow } from './use-now'
import { useRun } from './use-run'
import { Btn, ConfirmDelete } from './ui'

type Runner = Omit<Doc<'runners'>, 'tokenHash'>
export type Saved = { service: SealedService; runnerIds: Id<'runners'>[]; updatedAt: number }

// A key entered here is locked in this browser for each of your engines before it's sent, so Convex stores only
// what it can't open. The field is write-only: once saved, it shows when, never the key.
export function KeyForm({ service, runners, saved }: { service: SealedService; runners: Runner[]; saved?: Saved }) {
    const ws = useQuery(api.workspace.get)
    const set = useMutation(api.secrets.set)
    const remove = useMutation(api.secrets.remove)
    const run = useRun()
    const now = useNow(60_000)
    const [open, setOpen] = useState(false)
    const [values, setValues] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const started = runners.filter((r) => r.publicKey)
    // Engines added (or reset) after this key was saved can't open it
    const missing = saved ? started.filter((r) => !saved.runnerIds.includes(r._id)) : []

    const save = async () => {
        if (!ws) return
        let fields
        try {
            fields = checkFields(service, values)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            return
        }
        setSaving(true)
        try {
            const sealed = await Promise.all(started.map(async (r) => ({ runnerId: r._id, sealed: await seal(r.publicKey!, sealContext(ws._id, r._id, service), fields) })))
            const res = await run(set({ service, sealed }))
            if (res.ok) {
                setValues({})
                setError(null)
                setOpen(false)
            }
        } catch {
            // Keep the message plain: nothing from the key or the failure goes on screen
            setError('Couldn’t lock this key for your engine. Reload the page and try again.')
        } finally {
            setSaving(false)
        }
    }

    if (!started.length) return <p className="text-[12px] text-neutral-500">Add your engine above and start it once, then enter this key here.</p>

    return (
        <div className="space-y-2">
            {saved && (
                <p className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                    <Lock className="size-3.5" />
                    Saved {relativeTime(saved.updatedAt, now)}, readable only by your engine
                </p>
            )}
            {missing.length > 0 && (
                <p className="flex items-center gap-1.5 text-[12px] text-amber-700">
                    <AlertCircle className="size-3.5" />
                    Not on {missing.map((r) => r.name).join(', ')} yet: enter it again to add it there
                </p>
            )}
            {open ? (
                <form
                    className="space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void save()
                    }}>
                    {FIELDS[service].map((f) => (
                        <Input
                            key={f.name}
                            aria-label={f.label}
                            type={f.secret ? 'password' : 'text'}
                            autoComplete="off"
                            placeholder={`${f.label}${f.optional ? ' (optional)' : ''}${f.placeholder ? `: ${f.placeholder}` : ''}`}
                            value={values[f.name] ?? ''}
                            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                            className="h-8"
                        />
                    ))}
                    {error && <p className="text-[12px] text-destructive">{error}</p>}
                    <div className="flex gap-2">
                        <Btn type="submit" variant="primary" disabled={saving || !ws}>
                            {saving ? 'Saving…' : 'Save'}
                        </Btn>
                        <Btn type="button" variant="ghost" onClick={() => {
                                setValues({})
                                setError(null)
                                setOpen(false)
                            }}>
                            Cancel
                        </Btn>
                    </div>
                </form>
            ) : (
                <div className="flex items-center gap-2">
                    <Btn variant="primary" onClick={() => setOpen(true)}>
                        {saved ? 'Replace' : 'Add key'}
                    </Btn>
                    {saved && <ConfirmDelete label="Remove" what={`the saved ${service} key`} onConfirm={() => void run(remove({ service }))} />}
                </div>
            )}
        </div>
    )
}
