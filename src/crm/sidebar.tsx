import type { MouseEvent } from 'react'
import { BookOpen, Bot, ChartLine, ChevronsUpDown, CircleHelp, Contact, CreditCard, MessageCircle, MessagesSquare, Radio, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import type { Doc } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CONTACT_EMAIL } from '@/lib/site'
import { viewHref, type View } from './lib/view'
import { useNav } from './nav'

const GROUPS: { label?: string; items: { view: View; label: string; icon: LucideIcon }[] }[] = [
    {
        label: 'Build',
        items: [
            { view: 'agents', label: 'Agents', icon: Bot },
            { view: 'knowledge', label: 'Knowledge', icon: BookOpen },
            { view: 'numbers', label: 'iMessage Numbers', icon: MessageCircle },
        ],
    },
    {
        label: 'Data',
        items: [
            { view: 'conversations', label: 'Conversations', icon: MessagesSquare },
            { view: 'contacts', label: 'Contacts', icon: Contact },
            { view: 'analytics', label: 'Analytics', icon: ChartLine },
            { view: 'live', label: 'Live', icon: Radio },
        ],
    },
    { label: 'System', items: [{ view: 'settings', label: 'Settings', icon: Settings }] },
]

export function Sidebar({ view, workspace, onNavigate }: { view: View; workspace?: Doc<'workspace'> | null; onNavigate?: () => void }) {
    const go = useNav()

    // Real hrefs so cmd-click opens a tab; plain clicks stay in-app
    const link = (target: View) => (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        go(target)
        onNavigate?.()
    }

    return (
        <aside className="flex h-full w-60 flex-col bg-[#f5f5f7] px-3 py-3">
            <a href="/crm" onClick={link('agents')} className="flex items-center gap-2 px-1.5 pb-3">
                <img src="/favicon.svg" alt="" className="size-5" />
                <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
            </a>

            <Card className="mb-4 flex flex-row items-center gap-2.5 rounded-lg px-2.5 py-2">
                <Avatar className="rounded-md after:rounded-md">
                    <AvatarFallback className="rounded-md bg-primary-gradient font-semibold text-white">{workspace?.name.slice(0, 1).toUpperCase() ?? ''}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                    <span className="block text-[10px] text-neutral-400">Workspace</span>
                    <span className="block truncate text-[13px] font-semibold">{workspace?.name ?? '…'}</span>
                </span>
                <ChevronsUpDown className="size-3.5 text-neutral-400" />
            </Card>

            <nav className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
                {GROUPS.map((group, i) => (
                    <div key={i}>
                        {group.label && <p className="mb-1 px-2 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">{group.label}</p>}
                        <ul className="space-y-0.5">
                            {group.items.map((item) => (
                                <li key={item.view}>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        nativeButton={false}
                                        render={<a href={viewHref(item.view)} onClick={link(item.view)} aria-current={item.view === view ? 'page' : undefined} />}
                                        className={cn(
                                            'w-full justify-start gap-2.5 rounded-md px-2 text-[13px] font-normal text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 active:scale-100',
                                            item.view === view && 'bg-neutral-200/70 font-medium text-neutral-900',
                                        )}
                                    >
                                        <item.icon />
                                        {item.label}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="space-y-2 pt-3">
                <Card className="flex flex-row items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]">
                    <CreditCard className="size-4 text-neutral-500" />
                    <span className="flex-1">Personal plan</span>
                    <Badge variant="secondary" className="text-[11px] font-normal text-neutral-500">Free</Badge>
                </Card>
                <Card className="flex flex-row items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]">
                    <Avatar className="size-5">
                        <AvatarFallback className="bg-emerald-600 text-[10px] font-semibold text-white">{workspace?.ownerName.slice(0, 1).toUpperCase() ?? ''}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{workspace?.ownerName ?? '…'}</span>
                </Card>
                <div className="flex justify-between px-1 pt-1 text-[12px] text-neutral-500">
                    <Button variant="link" size="xs" nativeButton={false} render={<a href={`mailto:${CONTACT_EMAIL}`} />} className="h-auto px-0 text-[12px] text-neutral-500 hover:text-neutral-900 hover:no-underline">
                        <CircleHelp className="size-3.5" />
                        Help
                    </Button>
                    <Button variant="link" size="xs" nativeButton={false} render={<a href="/changelog" />} className="h-auto px-0 text-[12px] text-neutral-500 hover:text-neutral-900 hover:no-underline">
                        <Sparkles className="size-3.5" />
                        Updates
                    </Button>
                </div>
            </div>
        </aside>
    )
}
