import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Search, SearchX, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const inputCls = 'h-9 w-full rounded-md border border-neutral-200 bg-white px-2.5 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400'

export function Toolbar({ title, children }: { title: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-neutral-200/70 px-4 py-2.5">
            <h1 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-neutral-900">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
    )
}

export function SearchInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
    return (
        <label className={cn('relative block', className)}>
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-400" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Search..."
                className={cn(inputCls, 'h-8 pl-8', !className && 'w-44 sm:w-56')}
            />
        </label>
    )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }

export function Btn({ variant = 'secondary', className, ...props }: BtnProps) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5',
                {
                    primary: 'bg-neutral-900 text-white hover:bg-neutral-800',
                    secondary: 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50',
                    ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
                }[variant],
                className,
            )}
        />
    )
}

// Two-step delete so nothing is lost to a stray click (and no window.confirm)
export function ConfirmDelete({ onConfirm, label = 'Delete' }: { onConfirm: () => void; label?: string }) {
    const [armed, setArmed] = useState(false)
    return armed ? (
        <span className="flex items-center gap-1.5">
            <Btn variant="ghost" onClick={() => setArmed(false)}>Keep</Btn>
            <Btn variant="danger" onClick={onConfirm}>Confirm delete</Btn>
        </span>
    ) : (
        <Btn variant="danger" onClick={() => setArmed(true)}>{label}</Btn>
    )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto px-4 py-3">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13px]">
                <thead>
                    <tr>
                        {head.map((h, i) => (
                            <th key={i} className={cn('bg-neutral-50 px-3 py-2.5 font-medium text-neutral-500', i === 0 && 'rounded-l-md', i === head.length - 1 && 'rounded-r-md')}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    )
}

export function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
    return (
        <tr onClick={onClick} className={cn('group', onClick && 'cursor-pointer')}>
            {children}
        </tr>
    )
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
    return <td className={cn('border-b border-neutral-100 px-3 py-3 text-neutral-700 group-hover:bg-neutral-50/80', className)}>{children}</td>
}

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                    {Array.from({ length: cols }, (_, c) => (
                        <td key={c} className="border-b border-neutral-100 px-3 py-4">
                            <div className="h-4 animate-pulse rounded bg-neutral-100" />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-3 grid size-10 place-items-center rounded-lg bg-neutral-100 text-neutral-500">
                <Icon className="size-5" />
            </div>
            <p className="text-sm font-medium text-neutral-900">{title}</p>
            <p className="mt-1 max-w-xs text-[13px] text-neutral-500">{body}</p>
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}

export function NotFound({ what, onBack }: { what: string; onBack: () => void }) {
    return (
        <Content>
            <EmptyState icon={SearchX} title={`This ${what} doesn't exist`} body="It may have been deleted, or the link is wrong." action={<Btn onClick={onBack}>Go back</Btn>} />
        </Content>
    )
}

export function AgentAvatar({ agent, size = 28 }: { agent: { name: string; avatar?: string; hue: number }; size?: number }) {
    return agent.avatar ? (
        <img src={agent.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full bg-neutral-100 object-cover" style={{ width: size, height: size }} />
    ) : (
        <span
            className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
            style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${agent.hue} 55% 52%)` }}
        >
            {agent.name.slice(0, 1).toUpperCase()}
        </span>
    )
}

export function Initials({ name, size = 32 }: { name: string; size?: number }) {
    const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    return (
        <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-b from-neutral-300 to-neutral-400 font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>
            {initials}
        </span>
    )
}

const BADGE: Record<string, string> = {
    live: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    draft: 'bg-neutral-100 text-neutral-600 ring-neutral-500/15',
    paused: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    scheduled: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    sent: 'bg-neutral-100 text-neutral-600 ring-neutral-500/15',
}

export function StatusBadge({ status }: { status: string }) {
    return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset', BADGE[status])}>{status}</span>
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/25 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-200/70 px-5 py-3.5">
                    <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-neutral-100">
                        <X className="size-4" />
                    </button>
                </div>
                <div className="space-y-3.5 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200/70 px-5 py-3">{footer}</div>}
            </div>
        </div>
    )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-600">{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-neutral-400">{hint}</span>}
        </label>
    )
}

export function SidePane({ children }: { children: ReactNode }) {
    return <aside className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-neutral-200/70 p-2 md:flex">{children}</aside>
}

export function PaneItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-100 [&_svg]:size-4', active && 'bg-neutral-100 font-medium text-neutral-900')}
        >
            {children}
        </button>
    )
}

export function PaneLabel({ children }: { children: ReactNode }) {
    return <p className="px-2.5 pt-4 pb-1 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">{children}</p>
}

export function Content({ children }: { children: ReactNode }) {
    return <section className="flex min-w-0 flex-1 flex-col">{children}</section>
}

export function Scroll({ children }: { children: ReactNode }) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
}
