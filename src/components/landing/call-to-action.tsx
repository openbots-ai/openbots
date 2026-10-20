import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { GitHubMark } from '@/components/landing/logo'
import { ShaderBackground } from '@/components/ui/shader-background'
import { GITHUB_URL, README_URL } from '@/lib/site'

// The two texts in the iMessage-style aside: how you actually get OpenBots
const thread = [
    { mine: true, text: 'how do i get my own?' },
    { mine: false, text: 'clone the repo, deploy your own copy, add your own keys. it’s free and open source ✨' },
]

export default function CallToAction() {
    return (
        <section
            id="get-started"
            className="scroll-mt-24 px-3 pb-40 md:px-6">
            {/* bg-indigo-950 shows until the WebGL canvas paints (or if WebGL is unavailable) */}
            <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-2xl bg-indigo-950 px-8 py-20 text-white md:px-14 md:py-24">
                <ShaderBackground className="absolute inset-0" />
                <div className="relative max-w-xl">
                    <h2 className="type-title text-balance">Run your own</h2>
                    <p className="type-body-lg mt-5 max-w-md text-white/75">
                        openbots is free and open source. host it yourself, bring your own AI and texting accounts, and pay those providers directly.
                    </p>

                    <div
                        aria-hidden
                        className="mt-10 flex max-w-md flex-col gap-2">
                        {thread.map(({ mine, text }, i) => (
                            <motion.p
                                key={text}
                                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.4 + i * 0.7 }}
                                style={{ originX: mine ? 1 : 0, originY: 1 }}
                                className={
                                    mine
                                        ? 'self-end rounded-[18px] bg-[#0A84FF] px-3.5 py-2 text-[15px]'
                                        : 'max-w-[85%] self-start rounded-[18px] bg-white/15 px-3.5 py-2 text-[15px] backdrop-blur'
                                }>
                                {text}
                            </motion.p>
                        ))}
                    </div>

                    <div className="mt-10 flex flex-wrap items-center gap-3">
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="type-body inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-medium text-neutral-950 transition-transform hover:scale-[1.02]">
                            <GitHubMark /> Star on GitHub
                        </a>
                        <a
                            href={README_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="type-body inline-flex h-12 items-center gap-1.5 rounded-full px-5 font-medium text-white ring-1 ring-white/30 backdrop-blur-md transition-colors hover:bg-white/10">
                            Self-host it <ArrowRight className="size-4" />
                        </a>
                    </div>
                </div>
            </motion.div>
        </section>
    )
}
