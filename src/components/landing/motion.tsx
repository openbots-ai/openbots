import type { ReactNode } from 'react'
import { motion, type Variants } from 'motion/react'

const ease = [0.22, 1, 0.36, 1] as const

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease } },
}

type Props = { children: ReactNode; className?: string }

// Fades content up once when it scrolls into view.
export const Reveal = ({ children, className }: Props) => (
    <motion.div
        className={className}
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}>
        {children}
    </motion.div>
)

// Reveals its StaggerItem children one after another, on scroll or (with onMount) immediately.
export const Stagger = ({ children, className, gap = 0.08, onMount = false }: Props & { gap?: number; onMount?: boolean }) => (
    <motion.div
        className={className}
        initial="hidden"
        {...(onMount ? { animate: 'visible' } : { whileInView: 'visible', viewport: { once: true, amount: 0.2 } })}
        variants={{ visible: { transition: { staggerChildren: gap } } }}>
        {children}
    </motion.div>
)

export const StaggerItem = ({ children, className }: Props) => (
    <motion.div
        className={className}
        variants={fadeUp}>
        {children}
    </motion.div>
)
