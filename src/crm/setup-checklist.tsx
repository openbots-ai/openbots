import { useQuery } from 'convex/react'
import { Check } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { cn } from '@/lib/utils'
import type { View } from './lib/view'
import { useNav } from './nav'
import { Btn } from './ui'

// What's left before agents answer real texts. Hidden once everything is done.
export function SetupChecklist({ onCreate }: { onCreate: () => void }) {
    const go = useNav()
    const connections = useQuery(api.connections.list)
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    if (!connections || !agents || !numbers) return null

    const ok = (providers: string[]) => connections.some((c) => providers.includes(c.provider) && c.status === 'ok')
    const steps: { done: boolean; title: string; body: string; action: string; go?: View; onClick?: () => void }[] = [
        { done: ok(['openai', 'anthropic', 'google', 'xai']), title: 'Add your AI key', body: 'OpenAI, Anthropic, Gemini or xAI. Agents reply with it.', action: 'Add a key', go: 'connections' },
        {
            done: agents.some((a) => a.status === 'live'),
            title: 'Create an agent and set it live',
            body: agents.length ? 'Open an agent below and set its Status to Live.' : 'Give it a job and a personality.',
            action: agents.length ? '' : 'Create an agent',
            onClick: onCreate,
        },
        { done: ok(['bluebubbles', 'sendblue', 'twilio']), title: 'Connect texting', body: 'BlueBubbles or Sendblue for iMessage, Twilio for SMS.', action: 'Connect', go: 'connections' },
        { done: numbers.some((n) => n.agentId), title: 'Give it a number', body: 'The number people text to reach your agent.', action: 'Add a number', go: 'numbers' },
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
            <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                            <Btn className="mt-auto self-start" onClick={() => (s.onClick ? s.onClick() : s.go && go(s.go))}>
                                {s.action}
                            </Btn>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    )
}
