import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { LIVE_SLOTS as SLOTS, resolveModels, type Provider } from '@convex/lib/models'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProviderMark } from '@/components/agent-config-bar'
import { SLOT_ICONS } from '@/components/slot-icons'
import { useNav } from '../nav'
import { useKeyModels, withKeyOptions } from '../lib/key-models'
import { SlotSelect } from '../slot-select'
import { useRun } from '../use-run'
import { AgentAvatar, Content, Scroll, Toolbar } from '../ui'

const PROVIDER_NAMES: Record<Provider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI',
    local: 'local models',
    elevenlabs: 'ElevenLabs',
    deepgram: 'Deepgram',
    cartesia: 'Cartesia',
    typesafe: 'TypeSafe',
    none: '',
}

export function ModelsView() {
    const go = useNav()
    const run = useRun()
    const workspace = useQuery(api.workspace.get)
    const agents = useQuery(api.agents.list)
    const setModel = useMutation(api.workspace.setModel)

    // What your agents' keys can use; each choice here is one of these
    const available = useKeyModels()
    const keys = available ?? []
    const defaults = resolveModels(workspace?.models, undefined, undefined, keys)
    const mixes = (agents ?? []).map((a) => ({ agent: a, models: resolveModels(workspace?.models, a.models, a.model, keys) }))
    // Providers in use, counting what the defaults resolve to as well as each agent's own picks
    const providers = [...new Set([...SLOTS.map((slot) => defaults[slot.id].option.provider), ...mixes.flatMap((m) => SLOTS.map((slot) => m.models[slot.id].option.provider))])].filter(
        (p): p is Exclude<Provider, 'none'> => p !== 'none',
    )
    const keyProviders = [...new Set(keys.map((o) => o.provider))]

    return (
        <Content>
            <Toolbar title="Models">
                <span className="text-[12px] text-neutral-500">Set a default for each part of your agents, then override it per agent</span>
            </Toolbar>
            <Scroll>
                <div className="space-y-4 p-4">
                    <Card className="flex flex-wrap items-center justify-between gap-4 rounded-lg p-5">
                        <div className="max-w-xl">
                            <h2 className="text-[17px] font-semibold tracking-tight">Pick the models behind your agents</h2>
                            <p className="mt-1 text-[13px] text-neutral-500">
                                Pick the model that writes your agents’ replies, and a backup from another provider that takes over if the first one fails. You can pick any model your engine’s keys can use.
                            </p>
                            <p className="mt-2 text-[12px] text-neutral-600">
                                {!available ? (
                                    '…'
                                ) : keys.length ? (
                                    `${keys.length} model${keys.length === 1 ? '' : 's'} from ${keyProviders.map((p) => PROVIDER_NAMES[p]).join(', ')}`
                                ) : (
                                    <>
                                        No AI key connected yet.{' '}
                                        <button type="button" onClick={() => go('connections')} className="cursor-pointer font-medium text-neutral-900 underline-offset-2 hover:underline">
                                            Connect one
                                        </button>
                                    </>
                                )}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <span className="text-[11px] text-neutral-500">{providers.length} providers in use</span>
                            <span className="flex -space-x-1">
                                {providers.map((p) => (
                                    <Tooltip key={p}>
                                        <TooltipTrigger render={<span className="grid size-8 place-items-center rounded-full bg-white shadow-sm ring-1 ring-black/8" />}>
                                            <ProviderMark provider={p} />
                                        </TooltipTrigger>
                                        <TooltipContent>{PROVIDER_NAMES[p]}</TooltipContent>
                                    </Tooltip>
                                ))}
                            </span>
                        </div>
                    </Card>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {SLOTS.map((slot) => {
                            const Icon = SLOT_ICONS[slot.id]
                            const chosen = workspace?.models?.[slot.id] ?? defaults[slot.id].option.id
                            const own = mixes.filter((m) => m.models[slot.id].overridden)
                            const onDefault = mixes.filter((m) => !m.models[slot.id].overridden)
                            return (
                                <Card key={slot.id} className="flex flex-col gap-3 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
                                            <Icon className="size-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 text-[14px] font-semibold">
                                                {slot.label}
                                                {slot.isNew && <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">New</Badge>}
                                            </p>
                                            <p className="mt-0.5 text-[12px] leading-snug text-neutral-500">{slot.blurb}</p>
                                        </div>
                                    </div>
                                    <SlotSelect slot={withKeyOptions(slot, keys, chosen)} value={chosen} onChange={(model) => run(setModel({ slot: slot.id, model }))} />
                                    <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                                        <span className="flex -space-x-1.5">
                                            {onDefault.slice(0, 6).map((m) => (
                                                <span key={m.agent._id} className="rounded-full ring-2 ring-white">
                                                    <AgentAvatar agent={m.agent} size={20} />
                                                </span>
                                            ))}
                                        </span>
                                        <span>
                                            {agents ? `${onDefault.length} of ${agents.length} agents` : '…'}
                                            {own.length > 0 && ` · ${own.map((m) => m.agent.name).join(', ')} ${own.length === 1 ? 'uses its' : 'use their'} own`}
                                        </span>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>

                    <Card className="rounded-lg">
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-200/70 px-4 py-3">
                            <h2 className="text-[13px] font-medium">Each agent’s mix</h2>
                            <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                                <span className="size-2 rounded-full bg-primary" />
                                Own choice
                                <span className="ml-2 size-2 rounded-full bg-neutral-300" />
                                Workspace default
                            </span>
                        </div>
                        <div className="overflow-x-auto px-2 pb-2">
                            <table className="w-full min-w-[1100px] text-left text-[12px]">
                                <thead>
                                    <tr className="text-neutral-500">
                                        <th className="sticky left-0 bg-white px-2 py-2.5 font-normal">Agent</th>
                                        {SLOTS.map((s) => {
                                            const Icon = SLOT_ICONS[s.id]
                                            return (
                                                <th key={s.id} className="px-2 py-2.5 font-normal">
                                                    <span className="flex items-center gap-1.5">
                                                        <Icon className="size-3.5" />
                                                        {s.label}
                                                    </span>
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {mixes.map(({ agent, models }) => (
                                        <tr key={agent._id} onClick={() => go('agents', agent._id)} className="group cursor-pointer border-t border-neutral-100">
                                            <td className="sticky left-0 bg-white px-2 py-2 group-hover:bg-neutral-50">
                                                <span className="flex items-center gap-2 text-[13px] font-medium">
                                                    <AgentAvatar agent={agent} size={22} />
                                                    {agent.name}
                                                </span>
                                            </td>
                                            {SLOTS.map((s) => {
                                                const r = models[s.id]
                                                return (
                                                    <td key={s.id} className="px-1 py-2 group-hover:bg-neutral-50">
                                                        <span className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1', r.overridden ? 'bg-primary/6 font-medium text-neutral-900 ring-1 ring-primary/15' : 'text-neutral-500')}>
                                                            <ProviderMark provider={r.option.provider} className="size-3.5" />
                                                            <span className="truncate">{r.option.label}</span>
                                                        </span>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                    {!agents && (
                                        <tr>
                                            <td colSpan={SLOTS.length + 1} className="px-2 py-6">
                                                <div className="h-4 animate-pulse rounded bg-neutral-100" />
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </Scroll>
        </Content>
    )
}
