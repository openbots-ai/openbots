import { ArrowUpRight } from 'lucide-react'
import { ShaderBackground } from '@/components/ui/shader-background'

export default function CallToAction() {
    return (
        <section id="early-access" className="scroll-mt-24 px-3 pb-24 md:px-6 md:pb-36">
            <div className="relative overflow-hidden rounded-2xl bg-indigo-950 px-8 py-20 text-white md:px-14 md:py-24">
                <ShaderBackground className="absolute inset-0" />
                <div className="relative max-w-xl">
                    <p className="type-label mb-4 text-white/65">Early access · coming soon</p>
                    <h2 className="type-title text-balance">what would you want yours to help with?</h2>
                    <p className="type-body-lg mt-5 max-w-md text-white/75">
                        signups aren’t open yet. peek at the builder and plan yours: the model, the voice, the vibe, all of it.
                    </p>
                    <a href="/dashboard" className="type-body mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-indigo-950 transition-colors hover:bg-white/90">
                        Explore the builder <ArrowUpRight className="size-4" />
                    </a>
                </div>
            </div>
        </section>
    )
}
