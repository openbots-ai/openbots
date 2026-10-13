import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Menu } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { View } from './lib/view'
import { NavContext } from './nav'
import { Onboarding } from './onboarding'
import { Sidebar } from './sidebar'
import { useView } from './use-view'
import { AgentDetail } from './views/agent-detail'
import { AgentsView } from './views/agents'
import { ConnectionsView } from './views/connections'
import { AnalyticsView } from './views/analytics'
import { KnowledgeView } from './views/knowledge'
import { ModelsView } from './views/models'
import { NumbersView } from './views/numbers'
import { SettingsView } from './views/settings'

export function Shell() {
    const { view, id, go } = useView()
    const workspace = useQuery(api.workspace.get)
    const [menuOpen, setMenuOpen] = useState(false)

    // A fresh deployment has no workspace yet: ask for the two names it needs, nothing is made up
    if (workspace === null) return <Onboarding />

    return (
        <NavContext value={go}>
            <div className="flex h-dvh bg-[#f5f5f7] text-neutral-900 antialiased">
                <div className="hidden md:block">
                    <Sidebar view={view} workspace={workspace} />
                </div>
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetContent side="left" showCloseButton={false} className="w-60 gap-0 border-0 p-0 md:hidden">
                        <SheetTitle className="sr-only">Menu</SheetTitle>
                        <Sidebar view={view} workspace={workspace} onNavigate={() => setMenuOpen(false)} />
                    </SheetContent>
                </Sheet>
                <div className="flex min-w-0 flex-1 flex-col p-2 md:pl-0">
                    <div className="mb-2 flex items-center gap-2 md:hidden">
                        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="rounded-md">
                            <Menu className="size-5" />
                        </Button>
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
        case 'models':
            return <ModelsView />
        case 'analytics':
            return <AnalyticsView />
        case 'connections':
            return <ConnectionsView />
        case 'settings':
            return <SettingsView />
    }
}
