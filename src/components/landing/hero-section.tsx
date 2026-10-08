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
                        Build it piece by piece. Pick the model behind <span data-cursor-target="phrase" className="whitespace-nowrap">every single part</span>, set its personality, voice and rules, and decide what it remembers. Then just text it in iMessage.
                    </p>
                </StaggerItem>
                <StaggerItem>
                    <Button
                        variant="hero"
                        size="lg"
                        className="type-body mt-10 h-13 px-8"
                        nativeButton={false}
                        render={
                            <a href="/dashboard">Explore the builder</a>
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
