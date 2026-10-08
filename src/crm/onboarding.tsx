import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRun } from './use-run'
import { Btn, Field } from './ui'

// First visit to an empty deployment: creates the workspace, then the dashboard takes over (the query updates)
export function Onboarding() {
    const run = useRun()
    const create = useMutation(api.workspace.create)
    const [ownerName, setOwnerName] = useState('')
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const workspaceName = name.trim() || (ownerName.trim() ? `${ownerName.trim()}'s agents` : '')

    const submit = async () => {
        setBusy(true)
        await run(create({ name: workspaceName, ownerName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
        setBusy(false)
    }

    return (
        <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <span className="mb-2 flex items-center gap-2">
                        <img src="/favicon.svg" alt="" className="size-6" />
                        <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
                    </span>
                    <CardTitle>Set up your workspace</CardTitle>
                    <CardDescription>Your agents, numbers and conversations live here. You can change these any time in Settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="space-y-3.5"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submit()
                        }}
                    >
                        <Field label="Your name">
                            <Input autoFocus value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Alex" />
                        </Field>
                        <Field label="Workspace name">
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={workspaceName || 'e.g. Acme'} />
                        </Field>
                        <Btn type="submit" variant="primary" className="w-full" disabled={!ownerName.trim() || !workspaceName || busy}>
                            {busy ? 'Creating…' : 'Create workspace'}
                        </Btn>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
