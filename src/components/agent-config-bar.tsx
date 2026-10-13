import type { ReactNode } from 'react'
import { Check, CircleDashed, HardDrive, Pause, Play, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SLOT_ICONS } from '@/components/slot-icons'
import { INHERIT, type ModelOption, type Slot } from '@convex/lib/models'
import { DEFAULT_CONFIG, LANGUAGES, MODELS, REPLY_LENGTHS, VOICES, languageOf, modelOf, voiceOf, type Provider, type ReplyLength } from '@/lib/agent-options'

// Real provider logos, sourced online (LobeHub's open AI-logo set, Simple Icons, and the providers' own sites)
const LOGOS: Record<Exclude<Provider, 'none' | 'local'>, string> = {
    openai: '/logos/openai.svg',
    anthropic: '/logos/claude.svg',
    google: '/logos/gemini.svg',
    xai: '/logos/grok.svg',
    elevenlabs: '/logos/elevenlabs.svg',
    deepgram: '/logos/deepgram.svg',
    cartesia: '/logos/cartesia.svg',
    typesafe: '/logos/typesafe.png',
}

export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
    // "Off" and "Same as Brain" have no provider
    if (provider === 'none') return <CircleDashed className={cn('size-4 shrink-0 text-neutral-400', className)} />
    // A model on your own hardware has no brand to show
    if (provider === 'local') return <HardDrive className={cn('size-4 shrink-0 text-neutral-600', className)} />
    return <img src={LOGOS[provider]} alt="" className={cn('size-4 shrink-0 rounded-[3px] object-contain', className)} />
}

export function VoiceAvatar({ voice, className }: { voice: string; className?: string }) {
    const v = voiceOf(voice)
    return (
        <span
            className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white', className)}
            style={{ background: `linear-gradient(160deg, hsl(${v.hue} 70% 68%), hsl(${v.hue} 55% 42%))` }}>
            {v.name[0]}
        </span>
    )
}

const LanguageLabel = ({ id }: { id: string }) => {
    const l = languageOf(id)
    return (
        <>
            <span className="text-[15px] leading-none">{l.flag}</span>
            <span>
                {l.label}
                {l.region && <span className="ml-1 font-normal text-muted-foreground">({l.region})</span>}
            </span>
        </>
    )
}

// Pill-shaped shadcn triggers on a soft grey, like the reference design
const pill = 'h-9 rounded-lg border-0 bg-neutral-100/90 px-3 text-[13px] font-medium text-neutral-800 hover:bg-neutral-200/70 dark:bg-input/30'
const ring = (on: boolean) => on && 'ring-2 ring-neutral-900/15'

type Highlight = 'model' | 'settings' | 'voice' | 'language'
type Control = 'model' | 'voice' | 'language'

// A drawn copy of the open shadcn select menu, for the look-only bar: it stays inside the landing mock
// (and its scaling) instead of portalling out over the page like the real popup does
export function MenuPicture({ items, selected, hovered, up }: { items: { id: string; label: ReactNode }[]; selected: string; hovered: string; up?: boolean }) {
    return (
        <span className={cn('absolute left-0 z-20 flex min-w-52 flex-col rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 animate-in fade-in-0 zoom-in-95', up ? 'bottom-full mb-1 slide-in-from-bottom-2' : 'top-full mt-1 slide-in-from-top-2')}>
            {items.map((item) => (
                <span key={item.id} className={cn('relative flex items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm whitespace-nowrap transition-colors [&_svg]:shrink-0', item.id === hovered && 'bg-accent text-accent-foreground')}>
                    {item.label}
                    {item.id === selected && <Check className="absolute right-2 size-4" />}
                </span>
            ))}
        </span>
    )
}

type Props = {
    // '' means not picked yet: the pill shows a placeholder (the landing demo starts empty)
    model: string
    voice: string
    language: string
    temperature?: number
    replyLength?: ReplyLength
    playing?: boolean
    // Draws a focus ring on one control; the landing demo uses it to show what is being set
    highlight?: Highlight
    // False renders a look-only copy (the landing demo): same components, nothing clickable
    interactive?: boolean
    // Look-only bar: which menu is drawn open, and the option the pointer is on
    menu?: { control: Control; hovered: string }
    onModelChange?: (id: string) => void
    onVoiceChange?: (id: string) => void
    onLanguageChange?: (id: string) => void
    onTemperatureChange?: (value: number) => void
    onReplyLengthChange?: (value: ReplyLength) => void
    onTogglePlay?: () => void
    // The other model slots (computer use, voice notes, …), each shown as its own picker after the language
    slots?: SlotPick[]
    className?: string
}

export type SlotPick = {
    slot: Slot
    // A model id, or INHERIT to follow the workspace
    value: string
    // What the workspace would use; when set, "Workspace default" is offered first
    inherited?: ModelOption
    onChange?: (id: string) => void
    // Look-only bar: draws a focus ring while the demo sets this slot
    highlight?: boolean
}

// One model slot as a compact pill: the slot's icon, then the chosen model's logo and name
function SlotPill({ slot, value, inherited, onChange = noop, highlight }: SlotPick) {
    const Icon = SLOT_ICONS[slot.id]
    const following = value === INHERIT && inherited
    const current = following ? inherited : slot.options.find((o) => o.id === value)
    return (
        <Tooltip>
            <Select value={value} onValueChange={(id) => id && onChange(id)}>
                <TooltipTrigger render={<SelectTrigger aria-label={slot.label} className={cn(pill, 'gap-1.5 pr-2 pl-2.5', ring(!!highlight))} />}>
                    <Icon className="size-3.5 text-neutral-500" />
                    {current && <ProviderMark provider={current.provider} className="size-3.5" />}
                    <span className={cn(following && 'text-neutral-500')}>{current?.label ?? 'Not set'}</span>
                </TooltipTrigger>
                <SelectContent alignItemWithTrigger={false} align="start" className="min-w-72">
                    {inherited && (
                        <SelectItem value={INHERIT}>
                            <span className="text-muted-foreground">Workspace default ({inherited.label})</span>
                        </SelectItem>
                    )}
                    {slot.options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                            <ProviderMark provider={o.provider} />
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <TooltipContent side="bottom" className="max-w-60">
                <span className="font-medium">{slot.label}</span> · {slot.blurb}
            </TooltipContent>
        </Tooltip>
    )
}

const noop = () => {}

// Model + tuning, voice-note voice with a preview, and language: the row above an agent's settings
export function AgentConfigBar({
    model,
    voice,
    language,
    temperature = DEFAULT_CONFIG.temperature,
    replyLength = DEFAULT_CONFIG.replyLength,
    playing,
    highlight,
    interactive = true,
    menu,
    onModelChange = noop,
    onVoiceChange = noop,
    onLanguageChange = noop,
    onTemperatureChange = noop,
    onReplyLengthChange = noop,
    onTogglePlay,
    slots,
    className,
}: Props) {
    const m = model ? modelOf(model) : undefined
    const v = voice ? voiceOf(voice) : undefined
    const open = (control: Control) => (!interactive && menu?.control === control ? menu.hovered : undefined)
    const modelItems = MODELS.map((o) => ({ id: o.id, label: <><ProviderMark provider={o.provider} />{o.label}</> }))
    const voiceItems = VOICES.map((o) => ({ id: o.id, label: <><VoiceAvatar voice={o.id} />{o.name}<span className="text-muted-foreground">{o.accent}</span></> }))
    const languageItems = LANGUAGES.map((o) => ({ id: o.id, label: <LanguageLabel id={o.id} /> }))

    return (
        <div inert={!interactive} className={cn('flex flex-wrap items-center gap-2', className)}>
            {/* Model and its tuning share one pill, split by a hairline */}
            <div className={cn('relative inline-flex items-center rounded-lg bg-neutral-100/90', ring(highlight === 'model' || highlight === 'settings'))}>
                {open('model') && <MenuPicture items={modelItems} selected={model} hovered={open('model')!} />}
                <Select value={model} onValueChange={(id) => id && onModelChange(id)}>
                    <SelectTrigger aria-label="Model" className={cn(pill, 'rounded-r-none bg-transparent', !m && 'text-neutral-500')}>
                        <ProviderMark provider={m?.provider ?? 'none'} />
                        {m?.label ?? 'Pick a model'}
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} align="start" className="min-w-52">
                        {modelItems.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="h-5 w-px bg-neutral-300/80" />
                <Popover>
                    <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Model settings" className="size-9 rounded-l-none rounded-r-lg text-neutral-600 hover:bg-neutral-200/70 data-popup-open:bg-neutral-200/70" />}>
                        <Settings2 />
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 gap-4 p-4">
                        <div className="space-y-3">
                            <div className="flex justify-between text-xs font-medium text-neutral-600">
                                <span id="creativity-label">Creativity</span>
                                <span className="text-neutral-400 tabular-nums">{temperature.toFixed(1)}</span>
                            </div>
                            <Slider
                                aria-labelledby="creativity-label"
                                min={0}
                                max={1}
                                step={0.1}
                                value={[temperature]}
                                onValueChange={(value) => onTemperatureChange(Array.isArray(value) ? value[0] : value)}
                            />
                            <div className="flex justify-between text-[11px] text-neutral-400">
                                <span>Precise</span>
                                <span>Creative</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <span className="block text-xs font-medium text-neutral-600">Reply length</span>
                            <ToggleGroup
                                aria-label="Reply length"
                                variant="outline"
                                size="sm"
                                spacing={0}
                                value={[replyLength]}
                                onValueChange={(value) => value[0] && onReplyLengthChange(value[0] as ReplyLength)}
                                className="w-full">
                                {REPLY_LENGTHS.map((r) => (
                                    <ToggleGroupItem key={r.id} value={r.id} className="flex-1 text-[12px]">
                                        {r.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div className={cn('relative inline-flex items-center rounded-lg bg-neutral-100/90 pl-1.5', ring(highlight === 'voice'))}>
                {open('voice') && <MenuPicture items={voiceItems} selected={voice} hovered={open('voice')!} />}
                <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={playing ? `Stop ${v?.name} preview` : `Preview ${v?.name ?? 'voice'}`}
                    onClick={onTogglePlay}
                    disabled={interactive && !onTogglePlay}
                    className="rounded-md bg-white shadow-xs ring-black/5">
                    {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                </Button>
                <span className="ml-2 h-5 w-px bg-neutral-300/80" />
                <Tooltip>
                    <Select value={voice} onValueChange={(id) => id && onVoiceChange(id)}>
                        <TooltipTrigger render={<SelectTrigger aria-label="Voice" className={cn(pill, 'bg-transparent pl-2', !v && 'text-neutral-500')} />}>
                            {v ? <VoiceAvatar voice={v.id} /> : <CircleDashed className="size-4 text-neutral-400" />}
                            {v?.name ?? 'Pick a voice'}
                        </TooltipTrigger>
                        <SelectContent alignItemWithTrigger={false} align="start" className="min-w-48">
                            {voiceItems.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <TooltipContent side="bottom">{v ? `${v.name} · ${v.accent}` : 'No voice yet'}</TooltipContent>
                </Tooltip>
            </div>

            <div className="relative">
                {open('language') && <MenuPicture items={languageItems} selected={language} hovered={open('language')!} />}
                <Select value={language} onValueChange={(id) => id && onLanguageChange(id)}>
                    <SelectTrigger aria-label="Language" className={cn(pill, ring(highlight === 'language'), !language && 'text-neutral-500')}>
                        {language ? <LanguageLabel id={language} /> : 'Pick a language'}
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} align="start" className="min-w-48">
                        {languageItems.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {slots?.map((pick) => <SlotPill key={pick.slot.id} {...pick} />)}
        </div>
    )
}
