import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { useRun } from '../toast-context'
import { Btn, Content, Field, inputCls, Scroll, Toolbar } from '../ui'

export function SettingsView() {
    const workspace = useQuery(api.workspace.get)
    return (
        <Content>
            <Toolbar title="Settings" />
            <Scroll>{workspace ? <WorkspaceForm key={workspace._id} workspace={workspace} /> : <div className="m-4 h-40 max-w-lg animate-pulse rounded-lg bg-neutral-100" />}</Scroll>
        </Content>
    )
}

function WorkspaceForm({ workspace }: { workspace: Doc<'workspace'> }) {
    const run = useRun()
    const update = useMutation(api.workspace.update)
    const [name, setName] = useState(workspace.name)
    const [ownerName, setOwnerName] = useState(workspace.ownerName)
    const dirty = name !== workspace.name || ownerName !== workspace.ownerName

    return (
        <div className="m-4 max-w-lg space-y-3.5 rounded-lg border border-neutral-200 p-4">
            <h2 className="text-[13px] font-medium">Workspace</h2>
            <Field label="Workspace name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Your name" hint="Used in the greeting on Home.">
                <input className={inputCls} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>
            <div className="flex justify-end">
                <Btn variant="primary" disabled={!dirty || !name.trim() || !ownerName.trim()} onClick={() => run(update({ name, ownerName }))}>
                    Save
                </Btn>
            </div>
        </div>
    )
}
