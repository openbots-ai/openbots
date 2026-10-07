import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowUp, History, Plus, Sparkles } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { draftFromPrompt } from '../lib/draft'
import { matches } from '../lib/text'
import { greetingFor } from '../lib/time'
import { useNav } from '../nav'
import { useRun } from '../toast-context'
import { AgentAvatar, Content, PaneItem, SearchInput, SidePane } from '../ui'
import { useNow } from '../use-now'

const SUGGESTIONS = ['Someone who chases my unpaid invoices every Friday', 'An agent named Iris who books my meetings', 'A research buddy who texts me a morning brief']

export function HomeView() {
    const go = useNav()
    const run = useRun()
    const now = useNow()
    const workspace = useQuery(api.workspace.get)
    const agents = useQuery(api.agents.list)
    const create = useMutation(api.agents.create)
    const [text, setText] = useState('')
    const [q, setQ] = useState('')

    const drafts = agents?.filter((a) => a.status === 'draft' && matches(q, a.name, a.role, a.prompt))

    const submit = async () => {
        const draft = draftFromPrompt(text)
        if (!draft) return
        const res = await run(create(draft))
        if (res.ok) go('agents', res.value)
    }

    return (
        <>
            <SidePane>
                <p className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] font-medium">
                    <History className="size-4" />
                    Drafts
                </p>
                <SearchInput value={q} onChange={setQ} className="mb-1 w-full" />
                <PaneItem onClick={() => setText('')}>
                    <Plus />
                    New agent
                </PaneItem>
                {drafts === undefined
                    ? Array.from({ length: 4 }, (_, i) => <div key={i} className="mx-2.5 my-2 h-4 animate-pulse rounded bg-neutral-100" />)
                    : drafts.map((a) => (
                          <PaneItem key={a._id} onClick={() => go('agents', a._id)}>
                              <AgentAvatar agent={a} size={20} />
                              <span className="truncate">{a.name}</span>
                              <span className="ml-auto truncate text-[11px] text-neutral-400">{a.role}</span>
                          </PaneItem>
                      ))}
            </SidePane>
            <Content>
                <div className="flex h-14 items-center gap-2 border-b border-neutral-200/70 px-4 text-[13px] font-medium">
                    <Sparkles className="size-4 text-indigo-500" />
                    Builder
                </div>
                <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-16">
                    <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight">
                        {greetingFor(new Date(now).getHours())}
                        {workspace ? `, ${workspace.ownerName}` : ''}
                    </h1>
                    <div className="w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-sm focus-within:border-neutral-300">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    void submit()
                                }
                            }}
                            rows={3}
                            aria-label="Describe the agent you want"
                            placeholder="Describe the agent you want. Who is it, what does it handle, how should it text?"
                            className="w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] outline-none placeholder:text-neutral-400"
                        />
                        <div className="flex items-center justify-between px-3 pb-3">
                            <span className="text-[11px] text-neutral-400">Enter creates a draft you can edit</span>
                            <button
                                type="button"
                                aria-label="Create draft"
                                disabled={!text.trim()}
                                onClick={submit}
                                className="grid size-7 cursor-pointer place-items-center rounded-full bg-neutral-900 text-white disabled:cursor-not-allowed disabled:bg-neutral-200"
                            >
                                <ArrowUp className="size-4" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 flex max-w-xl flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button key={s} type="button" onClick={() => setText(s)} className="cursor-pointer rounded-full border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50">
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </Content>
        </>
    )
}
