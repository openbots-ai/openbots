import { type ComponentProps, type ReactNode } from 'react'
import { Search, SearchX, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog as DialogRoot, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table as TableRoot, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
        <div className={cn('relative', className ?? 'w-44 sm:w-56')}>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label="Search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search..." className="pl-8" />
        </div>
    )
}

type BtnProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'icon-sm' }

// The shared Button is pill-shaped for the landing page; the CRM uses squarer, denser controls
export function Btn({ variant = 'secondary', size = 'sm', className, ...props }: BtnProps) {
    return (
        <Button
            variant={({ primary: 'default', secondary: 'outline', ghost: 'ghost', danger: 'outline' } as const)[variant]}
            size={size}
            className={cn('rounded-md', variant === 'danger' && 'text-destructive hover:bg-destructive/10', className)}
            {...props}
        />
    )
}

// `title`, `description` and `confirm` reword it for an action that isn't a delete (e.g. resetting a token)
export function ConfirmDelete({
    onConfirm,
    label = 'Delete',
    what = 'this',
    title,
    description = "This can't be undone.",
    confirm = 'Delete',
}: {
    onConfirm: () => void
    label?: string
    what?: string
    title?: string
    description?: string
    confirm?: string
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger render={<Btn variant="danger" />}>{label}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title ?? `Delete ${what}?`}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onConfirm}>
                        {confirm}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
    return (
        <div className="px-4 py-3">
            <TableRoot className="min-w-[640px] text-[13px]">
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        {head.map((h, i) => (
                            <TableHead key={i} className="text-muted-foreground">
                                {h}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>{children}</TableBody>
            </TableRoot>
        </div>
    )
}

export function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
    return (
        <TableRow onClick={onClick} className={cn(onClick && 'cursor-pointer')}>
            {children}
        </TableRow>
    )
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
    return <TableCell className={cn('py-3 text-neutral-700', className)}>{children}</TableCell>
}

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, r) => (
                <TableRow key={r} className="hover:bg-transparent">
                    {Array.from({ length: cols }, (_, c) => (
                        <TableCell key={c} className="py-4">
                            <Skeleton className="h-4" />
                        </TableCell>
                    ))}
                </TableRow>
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
    return (
        <Avatar style={{ width: size, height: size }}>
            {agent.avatar && <AvatarImage src={agent.avatar} alt="" className="bg-neutral-100" />}
            <AvatarFallback className="font-semibold text-white" style={{ fontSize: size * 0.42, background: `hsl(${agent.hue} 55% 52%)` }}>
                {agent.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    )
}

export function Initials({ name, size = 32 }: { name: string; size?: number }) {
    const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    return (
        <Avatar style={{ width: size, height: size }}>
            <AvatarFallback className="bg-gradient-to-b from-neutral-300 to-neutral-400 font-semibold text-white" style={{ fontSize: size * 0.38 }}>
                {initials}
            </AvatarFallback>
        </Avatar>
    )
}

const BADGE: Record<string, string> = {
    live: 'bg-emerald-50 text-emerald-700 border-emerald-600/15',
    draft: 'bg-neutral-100 text-neutral-600 border-neutral-500/15',
    paused: 'bg-amber-50 text-amber-700 border-amber-600/15',
    scheduled: 'bg-sky-50 text-sky-700 border-sky-600/15',
    sent: 'bg-neutral-100 text-neutral-600 border-neutral-500/15',
}

export function StatusBadge({ status }: { status: string }) {
    return (
        <Badge variant="outline" className={cn('text-[11px] capitalize', BADGE[status])}>
            {status}
        </Badge>
    )
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
    return (
        <DialogRoot open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-md">
                <DialogHeader className="border-b px-5 py-3.5">
                    <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3.5 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <DialogFooter className="m-0 flex-row flex-wrap items-center justify-end px-5 py-3">{footer}</DialogFooter>}
            </DialogContent>
        </DialogRoot>
    )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: boolean; children: ReactNode }) {
    return (
        <Label className="flex-col items-stretch gap-1.5 font-normal">
            <span className="text-xs font-medium text-neutral-600">{label}</span>
            {children}
            {hint && <span className={cn('text-[11px] leading-snug', error ? 'text-destructive' : 'text-muted-foreground')}>{hint}</span>}
        </Label>
    )
}

type Option<T> = { value: T; label: ReactNode }

export function Select<T extends string | number>({
    value,
    onChange,
    options,
    className,
    id,
    'aria-label': ariaLabel,
}: {
    value: T
    onChange: (value: T) => void
    options: Option<T>[]
    className?: string
    id?: string
    'aria-label'?: string
}) {
    return (
        <SelectRoot items={options} value={value} onValueChange={(v) => v !== null && onChange(v as T)}>
            <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </SelectRoot>
    )
}

export function SidePane({ children }: { children: ReactNode }) {
    return <aside className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-neutral-200/70 p-2 md:flex">{children}</aside>
}

export function PaneItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className={cn('w-full justify-start gap-2 rounded-md px-2.5 text-[13px] font-normal text-neutral-600 active:scale-100 [&_svg]:size-4', active && 'bg-neutral-100 font-medium text-neutral-900')}
        >
            {children}
        </Button>
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

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    return <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
}
