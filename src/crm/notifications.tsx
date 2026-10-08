import { useMutation, useQuery } from 'convex/react'
import { Bell, CalendarClock, Hand, UserPlus } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { relativeTime } from './lib/time'
import { useNav } from './nav'
import { useNow } from './use-now'
import { useRun } from './use-run'
import { Btn } from './ui'

const ICONS = { new_contact: UserPlus, handoff: Hand, digest: CalendarClock }

export function Notifications({ onNavigate }: { onNavigate?: () => void }) {
    const go = useNav()
    const run = useRun()
    const now = useNow()
    const unread = useQuery(api.notifications.unreadCount)
    const items = useQuery(api.notifications.list)
    const markRead = useMutation(api.notifications.markRead)
    const markAllRead = useMutation(api.notifications.markAllRead)

    const open = (n: Doc<'notifications'>) => {
        if (!n.read) void run(markRead({ id: n._id }))
        if (n.conversationId) {
            go('conversations', n.conversationId)
            onNavigate?.()
        }
    }

    return (
        <Popover>
            <PopoverTrigger render={<Btn variant="ghost" size="icon-sm" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative shrink-0 text-neutral-600" />}>
                <Bell />
                {!!unread && <span className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-[#f5f5f7]" />}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 gap-0 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <span className="text-[13px] font-semibold">Notifications</span>
                    <Btn variant="ghost" className="h-7 px-2 text-[12px]" disabled={!unread} onClick={() => run(markAllRead({}))}>
                        Mark all read
                    </Btn>
                </div>
                <ul className="max-h-96 overflow-y-auto py-1">
                    {items?.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-neutral-400">Nothing yet. New contacts and handoffs show up here.</li>}
                    {items?.map((n) => {
                        const Icon = ICONS[n.kind]
                        return (
                            <li key={n._id}>
                                <button type="button" onClick={() => open(n)} className={cn('flex w-full cursor-pointer gap-2.5 px-3 py-2 text-left hover:bg-neutral-50', !n.read && 'bg-primary/4')}>
                                    <Icon className="mt-0.5 size-4 shrink-0 text-neutral-500" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex justify-between gap-2">
                                            <span className={cn('truncate text-[13px]', !n.read && 'font-medium')}>{n.title}</span>
                                            <span className="shrink-0 text-[11px] text-neutral-400">{relativeTime(n.at, now)}</span>
                                        </span>
                                        <span className="line-clamp-2 text-[12px] whitespace-pre-line text-neutral-500">{n.body}</span>
                                    </span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </PopoverContent>
        </Popover>
    )
}
