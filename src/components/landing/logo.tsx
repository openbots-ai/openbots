import { useId } from 'react'
import { cn } from '@/lib/utils'

// Light comes from the top-left: highlight → base → shadow
const SHADES = ['#7d79d8', '#3b37a3', '#2a2768', '#120f3a']

// One eye: an upright oval, tilted so its top leans left
const EYE = { rx: 9.5, ry: 15, tilt: -18 }

const Eye = ({ id, cx, cy }: { id: string; cx: number; cy: number }) => (
    <g transform={`translate(${cx} ${cy}) rotate(${EYE.tilt})`}>
        {/* the blink squashes each eye vertically around its own center */}
        <g className="logo-blink">
            <ellipse
                rx={EYE.rx}
                ry={EYE.ry}
                fill={`url(#${id}-body)`}
            />
            {/* soft sheen plus a crisp catchlight, which is what makes it read as an eye */}
            <ellipse
                cx="-2.5"
                cy="-6"
                rx="4.5"
                ry="7"
                fill={`url(#${id}-gloss)`}
            />
            <circle
                cx="-3"
                cy="-7.5"
                r="2.6"
                fill="#fff"
                fillOpacity="0.92"
            />
        </g>
    </g>
)

// Two eyes looking out, the right one sitting a little higher, like a friendly face peeking in
export const LogoMark = ({ className }: { className?: string }) => {
    // Unique gradient ids: the mark renders more than once per page
    const id = useId().replace(/:/g, '')
    return (
        <svg
            aria-hidden
            className={cn('size-6', className)}
            viewBox="-30 -30 60 60">
            <defs>
                <radialGradient
                    id={`${id}-body`}
                    cx="0.3"
                    cy="0.22"
                    r="0.95">
                    {SHADES.map((color, i) => (
                        <stop
                            key={color}
                            offset={[0, 0.3, 0.7, 1][i]}
                            stopColor={color}
                        />
                    ))}
                </radialGradient>
                <radialGradient id={`${id}-gloss`}>
                    <stop
                        offset="0"
                        stopColor="#fff"
                        stopOpacity="0.35"
                    />
                    <stop
                        offset="1"
                        stopColor="#fff"
                        stopOpacity="0"
                    />
                </radialGradient>
            </defs>
            <Eye
                id={id}
                cx={-12}
                cy={3}
            />
            <Eye
                id={id}
                cx={12}
                cy={-3}
            />
        </svg>
    )
}

export const Logo = ({ className }: { className?: string }) => (
    <span className={cn('inline-flex items-center gap-2 text-lg font-semibold tracking-tight', className)}>
        <LogoMark />
        OpenBots
    </span>
)
