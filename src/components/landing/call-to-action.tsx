import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { ShaderBackground } from '@/components/ui/shader-background'
import { Button } from '@/components/ui/button'
import { SECTION } from '@/components/landing/section-heading'

export default function CallToAction() {
    return (
        <section
            id="get-started"
            className={`${SECTION} px-3 md:px-6`}>
            {/* bg-indigo-950 shows until the WebGL canvas paints (or if WebGL is unavailable) */}
            <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-2xl bg-indigo-950 px-8 py-28 text-white md:px-14 md:py-36">
                <ShaderBackground className="absolute inset-0" />

                <div className="relative mx-auto max-w-xl text-center">
                    <h2 className="type-title text-balance">Build your first agent</h2>
                    <p className="type-body-lg mx-auto mt-5 max-w-md text-balance text-white/75">
                        Name it, pick its models and connect your own keys. Then just text it.
                    </p>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
                        {/* White on the indigo panel, like every button on a primary-colored background */}
                        <Button
                            size="lg"
                            className="type-body h-12 bg-white px-7 text-indigo-950 hover:bg-white/90"
                            nativeButton={false}
                            render={
                                <a href="/dashboard">
                                    Start building <ArrowRight data-icon="inline-end" />
                                </a>
                            }
                        />
                        <a
                            href="/pricing"
                            className="type-body font-medium text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline">
                            See pricing
                        </a>
                    </div>
                </div>
            </motion.div>
        </section>
    )
}
