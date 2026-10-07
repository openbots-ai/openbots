import type { MouseEvent } from 'react'
import { BookOpen, Bot, ChartLine, ChevronsUpDown, CircleHelp, Contact, CreditCard, House, Megaphone, MessageCircle, MessagesSquare, Radio, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import type { Doc } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { CONTACT_EMAIL } from '@/lib/site'
import { viewHref, type View } from './lib/view'
import { useNav } from './nav'

const GROUPS: { label?: string; items: { view: View; label: string; icon: LucideIcon }[] }[] = [
    { items: [{ view: 'home', label: 'Home', icon: House }] },
    { label: 'Build', items: [{ view: 'agents', label: 'Agents', icon: Bot }, { view: 'knowledge', label: 'Knowledge', icon: BookOpen }] },
    { label: 'Deploy', items: [{ view: 'numbers', label: 'iMessage Numbers', icon: MessageCircle }, { view: 'broadcasts', label: 'Broadcasts', icon: Megaphone }] },
    { label: 'Data', items: [{ view: 'conversations', label: 'Conversations', icon: MessagesSquare }, { view: 'contacts', label: 'Contacts', icon: Contact }] },
    { label: 'Monitor', items: [{ view: 'analytics', label: 'Analytics', icon: ChartLine }, { view: 'live', label: 'Live', icon: Radio }] },
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
            <a href="/crm" onClick={link('home')} className="flex items-center gap-2 px-1.5 pb-3">
                <img src="/favicon.svg" alt="" className="size-5" />
                <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
            </a>

            <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 shadow-xs">
                <span className="grid size-8 place-items-center rounded-md bg-primary-gradient text-sm font-semibold text-white">{workspace?.name.slice(0, 1).toUpperCase() ?? ''}</span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[10px] text-neutral-400">Workspace</span>
                    <span className="block truncate text-[13px] font-semibold">{workspace?.name ?? '…'}</span>
                </span>
                <ChevronsUpDown className="size-3.5 text-neutral-400" />
            </div>

            <nav className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
                {GROUPS.map((group, i) => (
                    <div key={i}>
                        {group.label && <p className="mb-1 px-2 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">{group.label}</p>}
                        <ul className="space-y-0.5">
                            {group.items.map((item) => (
                                <li key={item.view}>
                                    <a
                                        href={viewHref(item.view)}
                                        onClick={link(item.view)}
                                        aria-current={item.view === view ? 'page' : undefined}
                                        className={cn(
                                            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900',
                                            item.view === view && 'bg-neutral-200/70 font-medium text-neutral-900',
                                        )}
                                    >
                                        <item.icon className="size-4" />
                                        {item.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="space-y-2 pt-3">
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[13px]">
                    <CreditCard className="size-4 text-neutral-500" />
                    <span className="flex-1">Personal plan</span>
                    <span className="text-[11px] text-neutral-400">Free</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[13px]">
                    <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">{workspace?.ownerName.slice(0, 1).toUpperCase() ?? ''}</span>
                    <span className="truncate">{workspace?.ownerName ?? '…'}</span>
                </div>
                <div className="flex justify-between px-1 pt-1 text-[12px] text-neutral-500">
                    <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-1.5 hover:text-neutral-900">
                        <CircleHelp className="size-3.5" />
                        Help
                    </a>
                    <a href="/changelog" className="flex items-center gap-1.5 hover:text-neutral-900">
                        <Sparkles className="size-3.5" />
                        Updates
                    </a>
                </div>
            </div>
        </aside>
    )
}
