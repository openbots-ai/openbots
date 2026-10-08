import { Button } from '@/components/ui/button'
import { PhoneDemo } from '@/components/landing/phone-demo'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AgentCursors } from '@/components/landing/agent-cursors'

export default function HeroSection() {
    return (
        <section className="bg-background relative">
            <AgentCursors />
            <Stagger
                onMount
                gap={0.12}
                className="px-6 pt-24 text-center md:pt-32">
                <StaggerItem>
                    <h1 className="type-display mx-auto max-w-4xl text-balance">
                        <span className="bg-gradient-to-b from-neutral-400 to-neutral-600 bg-clip-text text-transparent dark:from-neutral-300 dark:to-neutral-500">Your own personal AI assistant.</span>{' '}
                        <span className="bg-primary-gradient bg-clip-text pb-1 text-transparent">Made your way.</span>
                    </h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-6 max-w-xl text-balance">
                        Pick the model behind <span data-cursor-target="phrase" className="whitespace-nowrap">every single part</span>, give it a whole personality and show it a task once. Then just text it. It asks before anything goes out, so no rogue moves.
                    </p>
                </StaggerItem>
                <StaggerItem>
                    <Button
                        variant="hero"
                        size="lg"
                        className="type-body mt-10 h-13 px-8"
                        nativeButton={false}
                        render={
                            <a href="#early-access">Join early access</a>
                        }
                    />
                </StaggerItem>
            </Stagger>

            <div
                id="product"
                className="mt-16 px-4 md:mt-20">
                <PhoneDemo />
                <p className="type-caption text-muted-foreground mt-6 text-center">Example conversations · fictional places and amounts</p>
            </div>
        </section>
    )
}
