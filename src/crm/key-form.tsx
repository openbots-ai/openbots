import { useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { Lock } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { checkFields, FIELDS, type SealedService } from '@convex/lib/sealed'
import { Input } from '@/components/ui/input'
import { relativeTime } from './lib/time'
import { useNow } from './use-now'
import { useRun } from './use-run'
import { Btn, ConfirmDelete } from './ui'

export type Saved = { service: SealedService; updatedAt: number }

// A key saved here belongs to your account: every agent and every engine you run uses it. The backend encrypts it
// before storing it. The field is write-only: once saved, it shows when, never the key.
export function KeyForm({ service, saved }: { service: SealedService; saved?: Saved }) {
    const save = useAction(api.secrets.save)
    const remove = useMutation(api.secrets.remove)
    const run = useRun()
    const now = useNow(60_000)
    const [open, setOpen] = useState(false)
    const [values, setValues] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const submit = async () => {
        let fields
        try {
            fields = checkFields(service, values)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            return
        }
        setSaving(true)
        const res = await run(save({ service, fields: fields as Record<string, string> }))
        setSaving(false)
        if (res.ok) {
            setValues({})
            setError(null)
            setOpen(false)
        }
    }

    return (
        <div className="space-y-2">
            {saved && (
                <p className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                    <Lock className="size-3.5" />
                    Saved {relativeTime(saved.updatedAt, now)}, encrypted
                </p>
            )}
            {open ? (
                <form
                    className="space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submit()
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
                        <Btn type="submit" variant="primary" disabled={saving}>
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
