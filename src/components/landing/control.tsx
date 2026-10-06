import { CircleCheck, KeyRound, ListChecks, PauseCircle, ShieldCheck } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/landing/motion'

const points = [
    { icon: ShieldCheck, title: 'Nothing sends without your yes', body: 'Emails, payments and anything a customer will see wait for one tap in iMessage.' },
    { icon: KeyRound, title: 'Access, one app at a time', body: 'Marcus gets the CRM. Leo gets the invoices. Nobody gets the keys to everything.' },
    { icon: ListChecks, title: 'Receipts for everything', body: 'Every click, edit and send is logged in plain English with a timestamp.' },
    { icon: PauseCircle, title: 'Text "pause" to stop it', body: 'The agent stops mid-task. Pulling its access takes one tap.' },
]

const activity = [
    { time: '11:42 PM', text: 'Signed in to Salesforce' },
    { time: '11:48 PM', text: 'Logged notes on 3 Northwind calls' },
    { time: '12:05 AM', text: 'Drafted 6 follow-ups' },
    { time: '8:14 AM', text: 'Sent 6 follow-ups after your approval' },
]

// An approval request in iMessage, followed by the agent's activity log
const ApprovalMock = () => (
    <div className="w-full max-w-sm space-y-3 text-left text-[13px] leading-snug">
        <div className="rounded-[1.6rem] bg-white p-4 text-black shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1 ring-black/8">
            <div className="flex items-center gap-2">
                <span
                    className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(180deg, hsl(200 35% 68%), hsl(200 30% 50%))' }}>
                    M
                </span>
                <span className="text-xs font-semibold">Marcus</span>
                <span className="ml-auto text-[11px] text-neutral-400">8:12 AM</span>
            </div>
            <p className="imsg imsg-them imsg-tail relative mt-3 max-w-[90%] rounded-[18px] bg-[#E9E9EB] px-3 py-2">
                6 follow-ups for the Northwind deal are ready. want me to send them?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] font-semibold">
                <span className="rounded-full bg-[#0A84FF] py-2 text-center text-white">Send all</span>
                <span className="rounded-full bg-neutral-100 py-2 text-center text-[#0A84FF]">Let me review</span>
            </div>
        </div>

        <div className="rounded-[1.6rem] bg-white p-4 text-black shadow-[0_24px_48px_-16px_rgba(0,0,0,0.2)] ring-1 ring-black/8">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Marcus · activity</p>
            <ol className="mt-2.5 space-y-2">
                {activity.map((a, i) => (
                    <li
                        key={a.text}
                        className="flex items-center gap-2.5 text-[12px]">
                        <CircleCheck className={i === activity.length - 1 ? 'size-3.5 text-[#0A84FF]' : 'size-3.5 text-emerald-500'} />
                        <span className="flex-1">{a.text}</span>
                        <span className="tabular-nums text-neutral-400">{a.time}</span>
                    </li>
                ))}
            </ol>
        </div>
    </div>
)

export default function Control() {
    return (
        <section
            id="control"
            className="px-6 py-28 md:py-40">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
                <div>
                    <Reveal>
                        <h2 className="type-title text-balance">You still sign off</h2>
                        <p className="type-body-lg text-muted-foreground mt-4 max-w-md text-balance">
                            Agents do the busywork. Anything that leaves the building waits for you.
                        </p>
                    </Reveal>

                    <Stagger className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
                        {points.map(({ icon: Icon, title, body }) => (
                            <StaggerItem key={title}>
                                <Icon className="size-5" />
                                <h3 className="type-subheading mt-3">{title}</h3>
                                <p className="type-body-sm text-muted-foreground mt-1.5">{body}</p>
                            </StaggerItem>
                        ))}
                    </Stagger>
                </div>

                <Reveal className="flex justify-center rounded-[2rem] bg-neutral-100/70 px-6 py-12 ring-1 ring-black/4 md:px-12 md:py-16 dark:bg-white/5 dark:ring-white/8">
                    <ApprovalMock />
                </Reveal>
            </div>
        </section>
    )
}
