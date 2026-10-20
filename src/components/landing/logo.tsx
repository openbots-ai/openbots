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

// GitHub's mark, for the links to the repo (lucide no longer ships brand icons)
export const GitHubMark = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden
        className={cn('size-4', className)}>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
)
