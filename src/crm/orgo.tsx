import { useState } from 'react'
import { useAction } from 'convex/react'
import { AlertCircle, ExternalLink, LoaderCircle } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { Input } from '@/components/ui/input'
import { KeyForm, type Saved } from './key-form'
import { useRun } from './use-run'
import { Btn, ConfirmDelete } from './ui'

type Runner = Omit<Doc<'runners'>, 'tokenHash'>

// Where Orgo computers download the engine from: this site, which builds it with every deploy
const engineUrl = () => `${window.location.origin}/engine/openbots-engine.mjs`

// Save an Orgo key, then create always-on computers on it. Orgo bills the account that owns the key.
export function OrgoCreate({ saved }: { saved?: Saved }) {
    const create = useAction(api.orgo.create)
    const run = useRun()
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)

    const submit = async () => {
        setBusy(true)
        const res = await run(create({ name, engineUrl: engineUrl() }))
        setBusy(false)
        if (res.ok) setName('')
    }

    return (
        <div className="space-y-3">
            <p className="text-[12px] text-neutral-600">
                An always-on cloud computer on your own{' '}
                <a href="https://www.orgo.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-neutral-900 underline-offset-2 hover:underline">
                    Orgo
                    <ExternalLink className="size-3" />
                </a>{' '}
                account, set up for you. Orgo bills you for it directly.
            </p>
            {saved && (
                <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submit()
                    }}>
                    <Input aria-label="Orgo computer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My VM" className="h-8 min-w-0 flex-1" />
                    <Btn type="submit" variant="primary" disabled={!name.trim() || busy}>
                        {busy ? 'Creating…' : 'Create on Orgo'}
                    </Btn>
                </form>
            )}
            <KeyForm service="orgo" saved={saved} />
        </div>
    )
}

// Setup progress and Start / Stop / Delete for a computer on Orgo
export function OrgoControls({ runner }: { runner: Runner }) {
    const retry = useAction(api.orgo.retrySetup)
    const start = useAction(api.orgo.start)
    const stop = useAction(api.orgo.stop)
    const remove = useAction(api.orgo.remove)
    const run = useRun()
    const setup = runner.setup
    const working = setup?.status === 'creating' || setup?.status === 'installing'

    return (
        <div className="space-y-1.5">
            {working && (
                <p className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    {setup?.status === 'creating' ? 'Creating the computer on Orgo…' : `${setup?.step ?? 'Setting up'}…`}
                </p>
            )}
            {setup?.status === 'failed' && (
                <p className="flex items-start gap-1.5 text-[12px] text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                        Setup stopped{setup.step ? ` at “${setup.step}”` : ''}: {setup.error}
                    </span>
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                {setup?.status === 'failed' && runner.orgo && (
                    <Btn variant="primary" onClick={() => void run(retry({ id: runner._id, engineUrl: engineUrl() }))}>
                        Retry setup
                    </Btn>
                )}
                {runner.orgo && !working && (
                    <>
                        <Btn onClick={() => void run(start({ id: runner._id }))}>Start</Btn>
                        <Btn onClick={() => void run(stop({ id: runner._id }))}>Stop</Btn>
                    </>
                )}
                <ConfirmDelete label="Delete" what={`${runner.name} on Orgo, with everything on it`} onConfirm={() => void run(remove({ id: runner._id }))} />
            </div>
        </div>
    )
}
