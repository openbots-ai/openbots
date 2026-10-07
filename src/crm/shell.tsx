import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Menu } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { View } from './lib/view'
import { NavContext } from './nav'
import { Sidebar } from './sidebar'
import { useView } from './use-view'
import { AgentDetail } from './views/agent-detail'
import { AgentsView } from './views/agents'
import { AnalyticsView } from './views/analytics'
import { ContactsView } from './views/contacts'
import { ConversationsView } from './views/conversations'
import { KnowledgeView } from './views/knowledge'
import { NumbersView } from './views/numbers'
import { SettingsView } from './views/settings'

export function Shell() {
    const { view, id, go } = useView()
    const workspace = useQuery(api.workspace.get)
    const seed = useMutation(api.seed.run)
    const [menuOpen, setMenuOpen] = useState(false)

    // An empty deployment (no workspace row yet) gets the mascot team and sample data
    useEffect(() => {
        if (workspace === null) void seed()
    }, [workspace, seed])

    return (
        <NavContext value={go}>
            <div className="flex h-dvh bg-[#f5f5f7] text-neutral-900 antialiased">
                <div className="hidden md:block">
                    <Sidebar view={view} workspace={workspace} />
                </div>
                {menuOpen && (
                    <div className="fixed inset-0 z-40 md:hidden">
                        <div className="absolute inset-0 bg-neutral-950/25" onClick={() => setMenuOpen(false)} />
                        <div className="relative h-full w-60 shadow-xl">
                            <Sidebar view={view} workspace={workspace} onNavigate={() => setMenuOpen(false)} />
                        </div>
                    </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col p-2 md:pl-0">
                    <div className="mb-2 flex items-center gap-2 md:hidden">
                        <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="grid size-9 place-items-center rounded-md hover:bg-neutral-200/60">
                            <Menu className="size-5" />
                        </button>
                        <span className="text-sm font-semibold">OpenBots</span>
                    </div>
                    <main className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200/80 bg-white">
                        <ViewSwitch view={view} id={id} />
                    </main>
                </div>
            </div>
        </NavContext>
    )
}

function ViewSwitch({ view, id }: { view: View; id?: string }) {
    switch (view) {
        case 'agents':
            return id ? <AgentDetail key={id} id={id} /> : <AgentsView />
        case 'knowledge':
            return <KnowledgeView />
        case 'numbers':
            return <NumbersView />
        case 'conversations':
            return <ConversationsView key="all" id={id} />
        case 'live':
            return <ConversationsView key="live" id={id} live />
        case 'contacts':
            return <ContactsView />
        case 'analytics':
            return <AnalyticsView />
        case 'settings':
            return <SettingsView />
    }
}
