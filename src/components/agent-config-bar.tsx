import type { ReactNode } from 'react'
import { Aperture, Asterisk, Check, Pause, Play, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_CONFIG, LANGUAGES, MODELS, REPLY_LENGTHS, VOICES, languageOf, modelOf, voiceOf, type Provider, type ReplyLength } from '@/lib/agent-options'

export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
    if (provider === 'openai') return <Aperture className={cn('size-4 text-neutral-900', className)} />
    if (provider === 'anthropic') return <Asterisk className={cn('size-4 text-[#D97757]', className)} strokeWidth={3} />
    return (
        <svg viewBox="0 0 24 24" className={cn('size-4', className)} aria-hidden>
            <defs>
                <linearGradient id="gemini-mark" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4285F4" />
                    <stop offset="1" stopColor="#9B72CB" />
                </linearGradient>
            </defs>
            <path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" fill="url(#gemini-mark)" />
        </svg>
    )
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
    className?: string
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
    className,
}: Props) {
    const m = modelOf(model)
    const v = voiceOf(voice)
    const open = (control: Control) => (!interactive && menu?.control === control ? menu.hovered : undefined)
    const modelItems = MODELS.map((o) => ({ id: o.id, label: <><ProviderMark provider={o.provider} />{o.label}</> }))
    const voiceItems = VOICES.map((o) => ({ id: o.id, label: <><VoiceAvatar voice={o.id} />{o.name}<span className="text-muted-foreground">{o.accent}</span></> }))
    const languageItems = LANGUAGES.map((o) => ({ id: o.id, label: <LanguageLabel id={o.id} /> }))

    return (
        <div inert={!interactive} className={cn('flex flex-wrap items-center gap-2', className)}>
            {/* Model and its tuning share one pill, split by a hairline */}
            <div className={cn('relative inline-flex items-center rounded-lg bg-neutral-100/90', ring(highlight === 'model' || highlight === 'settings'))}>
                {open('model') && <MenuPicture items={modelItems} selected={m.id} hovered={open('model')!} />}
                <Select value={m.id} onValueChange={(id) => id && onModelChange(id)}>
                    <SelectTrigger aria-label="Model" className={cn(pill, 'rounded-r-none bg-transparent')}>
                        <ProviderMark provider={m.provider} />
                        {m.label}
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
                {open('voice') && <MenuPicture items={voiceItems} selected={v.id} hovered={open('voice')!} />}
                <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={playing ? `Stop ${v.name} preview` : `Preview ${v.name}`}
                    onClick={onTogglePlay}
                    disabled={interactive && !onTogglePlay}
                    className="rounded-md bg-white shadow-xs ring-black/5">
                    {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                </Button>
                <span className="ml-2 h-5 w-px bg-neutral-300/80" />
                <Tooltip>
                    <Select value={v.id} onValueChange={(id) => id && onVoiceChange(id)}>
                        <TooltipTrigger render={<SelectTrigger aria-label="Voice" className={cn(pill, 'bg-transparent pl-2')} />}>
                            <VoiceAvatar voice={v.id} />
                            {v.name}
                        </TooltipTrigger>
                        <SelectContent alignItemWithTrigger={false} align="start" className="min-w-48">
                            {voiceItems.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <TooltipContent side="bottom">
                        {v.name} · {v.accent}
                    </TooltipContent>
                </Tooltip>
            </div>

            <div className="relative">
                {open('language') && <MenuPicture items={languageItems} selected={language} hovered={open('language')!} />}
                <Select value={language} onValueChange={(id) => id && onLanguageChange(id)}>
                    <SelectTrigger aria-label="Language" className={cn(pill, ring(highlight === 'language'))}>
                        <LanguageLabel id={language} />
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
        </div>
    )
}
