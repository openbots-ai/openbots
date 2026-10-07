import { Label, PolarAngleAxis, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'

const usedConfig = { used: { label: 'Used', color: 'var(--primary)' } } satisfies ChartConfig

// Plan usage as a shadcn radial chart: the ring fills with the share of the allowance used
export function UsageGauge({ label, used, limit, note, animate = true, className }: { label: string; used: number; limit: number; note: string; animate?: boolean; className?: string }) {
    const share = Math.min(1, used / limit)
    const pct = Math.round(share * 100)
    return (
        <div className="flex flex-col items-center text-center">
            <ChartContainer config={usedConfig} className={cn('aspect-square h-40', className)}>
                <RadialBarChart data={[{ used: pct, fill: share >= 0.85 ? 'oklch(0.769 0.188 70.08)' : 'var(--color-used)' }]} startAngle={90} endAngle={-270} innerRadius={58} outerRadius={74} barSize={12}>
                    {/* A 0–100 angle axis makes the full ring the background track */}
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
                    <RadialBar dataKey="used" background={{ fill: 'var(--muted)' }} cornerRadius={10} isAnimationActive={animate} />
                    <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                        <Label
                            content={({ viewBox }) =>
                                viewBox && 'cx' in viewBox && 'cy' in viewBox ? (
                                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                                            {pct}%
                                        </tspan>
                                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                                            used
                                        </tspan>
                                    </text>
                                ) : null
                            }
                        />
                    </PolarRadiusAxis>
                </RadialBarChart>
            </ChartContainer>
            <p className="text-[13px] font-medium text-neutral-900">{label}</p>
            <p className="text-[11px] text-neutral-500">{note}</p>
        </div>
    )
}
