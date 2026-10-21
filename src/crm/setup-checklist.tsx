import { useQuery } from 'convex/react'
import { Check } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { AI_PROVIDERS } from '@convex/lib/models'
import { cn } from '@/lib/utils'
import { codeSender } from './lib/owner'
import type { View } from './lib/view'
import { useNav } from './nav'
import { Btn } from './ui'
import { useNow } from './use-now'

// What's left before agents answer real texts. Hidden once everything is done.
export function SetupChecklist({ onCreate }: { onCreate: () => void }) {
    const go = useNav()
    const runners = useQuery(api.runners.list)
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    const saved = useQuery(api.secrets.list)
    const workspace = useQuery(api.workspace.get)
    const now = useNow()
    if (!runners || !agents || !numbers || !saved || workspace === undefined) return null

    const verified = !!workspace?.ownerVerified
    // The code is texted by your engine, from one of your numbers
    const sender = codeSender(runners, numbers, now)
    const steps: { done: boolean; title: string; body: string; action: string; go?: View; onClick?: () => void; waiting?: boolean }[] = [
        // A key saved in Connections counts before any engine runs: every engine picks it up when it starts
        {
            done: runners.some((r) => r.models?.length) || saved.some((k) => (AI_PROVIDERS as readonly string[]).includes(k.service)),
            title: 'Add an AI key',
            body: 'OpenAI, Anthropic, Gemini, xAI or a local model. Save it in Connections (your engines pick it up) or set it on your engine.',
            action: 'Add a key',
            go: 'connections',
        },
        {
            done: runners.some((r) => r.lastSeenAt),
            title: 'Start your engine',
            body: 'It runs on a machine you choose and keeps your messages there. Add it to get a token.',
            action: 'Add your engine',
            go: 'connections',
        },
        { done: agents.length > 0, title: 'Create an agent', body: 'Give it a job and a personality.', action: 'Create an agent', onClick: onCreate },
        { done: runners.some((r) => r.channels?.length), title: 'Set up texting', body: 'Messages on a Mac, BlueBubbles or Sendblue for iMessage, Twilio for SMS.', action: 'See how', go: 'connections' },
        { done: numbers.some((n) => n.agentId), title: 'Give it a number', body: 'The number you, and the people you allow, text to reach your agent.', action: 'Add a number', go: 'numbers' },
        {
            done: verified,
            title: 'Verify your phone',
            body: sender.ready
                ? 'Your engine texts it a code. Until it’s verified your agents answer nobody, you included, and can’t text you handoffs or check-ins.'
                : `Needs a running engine that can text, since the code is sent by text. ${sender.why}`,
            action: 'Verify in Settings',
            go: 'settings',
            waiting: !sender.ready,
        },
        {
            done: agents.some((a) => a.status === 'live'),
            title: 'Set an agent live',
            body: verified
                ? 'Open an agent below and set its Status to Live. It answers only you and the people in Settings → Allowed people.'
                : 'Verify your phone first: until then a live agent answers nobody. Then set its Status to Live; it answers only you and the people in Settings → Allowed people.',
            action: '',
        },
    ]
    const left = steps.filter((s) => !s.done).length
    if (!left) return null

    return (
        <section aria-label="Set up" className="mx-4 mt-4 rounded-lg border border-neutral-200 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-[14px] font-semibold">Get your agents texting</h2>
                <span className="text-[12px] text-neutral-500">
                    {steps.length - left} of {steps.length} done
                </span>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {steps.map((s, i) => (
                    <li key={s.title} className={cn('flex flex-col gap-2 rounded-md p-3', s.done ? 'bg-emerald-50/60' : 'bg-neutral-50')}>
                        <span className="flex items-center gap-2 text-[13px] font-medium">
                            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold', s.done ? 'bg-emerald-600 text-white' : 'bg-white text-neutral-600 ring-1 ring-black/10')}>
                                {s.done ? <Check className="size-3" /> : i + 1}
                            </span>
                            {s.title}
                        </span>
                        <span className="text-[12px] leading-snug text-neutral-500">{s.body}</span>
                        {!s.done && s.action && (
                            <Btn className="mt-auto self-start" disabled={s.waiting} onClick={() => (s.onClick ? s.onClick() : s.go && go(s.go))}>
                                {s.action}
                            </Btn>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    )
}
