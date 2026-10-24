import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { CircleCheck, LoaderCircle, Monitor } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { useNow } from './use-now'
import { useRun } from './use-run'
import { Btn, Dialog } from './ui'

const OS = { windows: 'Windows', mac: 'Mac', linux: 'Linux', other: 'Computer' } as const

// "Connect this computer?" for a code shown by the engine or the desktop app. Approving adds it to your workspace;
// the computer made its own token and only sent its hash, so nothing secret passes through here.
export function PairDialog({ code, onClose }: { code: string; onClose: () => void }) {
    const run = useRun()
    const pairing = useQuery(api.pairing.lookup, { code })
    const approve = useMutation(api.pairing.approve)
    const now = useNow(5_000)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)

    if (done || pairing?.approved) {
        return (
            <Dialog title="Computer connected" onClose={onClose} footer={<Btn variant="primary" onClick={onClose}>Done</Btn>}>
                <div className="flex flex-col items-center gap-2 py-3 text-center">
                    <CircleCheck className="size-10 text-emerald-600" />
                    <p className="text-[14px] font-medium">{pairing?.name ?? 'Your computer'} is connected</p>
                    <p className="text-[13px] text-neutral-500">It’s starting up now and shows as online in Connections within a minute. You can close this.</p>
                </div>
            </Dialog>
        )
    }
    if (pairing === undefined) {
        return (
            <Dialog title="Connect a computer" onClose={onClose}>
                <div className="grid h-24 place-items-center">
                    <LoaderCircle className="size-5 animate-spin text-neutral-400" />
                </div>
            </Dialog>
        )
    }
    if (!pairing || pairing.expiresAt < now) {
        return (
            <Dialog title="Connect a computer" onClose={onClose} footer={<Btn variant="primary" onClick={onClose}>OK</Btn>}>
                <p className="text-[13px] text-neutral-600">
                    The code <span className="font-mono font-medium">{code}</span> has expired or doesn’t exist. The computer shows a new code every 10 minutes; use the one on its
                    screen now.
                </p>
            </Dialog>
        )
    }
    return (
        <Dialog
            title="Connect this computer?"
            onClose={onClose}
            footer={
                <>
                    <Btn variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Btn>
                    <Btn
                        variant="primary"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true)
                            const res = await run(approve({ code: pairing.code }))
                            setBusy(false)
                            if (res.ok) setDone(true)
                        }}>
                        {busy ? 'Connecting…' : 'Connect'}
                    </Btn>
                </>
            }>
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                    <Monitor className="size-5" />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{pairing.name}</p>
                    <p className="text-[12px] text-neutral-500">
                        {OS[pairing.os]} · code <span className="font-mono">{pairing.code}</span>
                    </p>
                </div>
            </div>
            <p className="text-[12px] text-neutral-500">
                Only connect a computer you just set up yourself, with this same code on its screen. Once connected it answers your agents’ texts and can use the keys you
                saved in Connections.
            </p>
        </Dialog>
    )
}
