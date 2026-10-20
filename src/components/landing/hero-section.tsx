import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { GitHubMark } from '@/components/landing/logo'
import { GITHUB_URL } from '@/lib/site'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AgentCursors } from '@/components/landing/agent-cursors'

// The dashboard demo pulls in the chart library, so it streams in just after the headline paints
const CreateAgentDemo = lazy(() => import('@/components/landing/create-agent-demo'))

export default function HeroSection() {
    return (
        <section className="bg-background relative">
            <AgentCursors />
            <Stagger
                onMount
                gap={0.12}
                className="px-6 pt-24 text-center md:pt-32">
                <StaggerItem>
                    <h1 className="type-display mx-auto max-w-4xl text-balance max-md:text-[min(3rem,10vw)]">
                        {/* Two lines on every screen size: each line stays whole, and phones scale the type to fit */}
                        <span className="block whitespace-nowrap bg-gradient-to-b from-neutral-400 to-neutral-600 bg-clip-text text-transparent dark:from-neutral-300 dark:to-neutral-500">Your AI agent</span>
                        <span className="bg-primary-gradient block whitespace-nowrap bg-clip-text pb-1 text-transparent">Made your way</span>
                    </h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-6 max-w-xl text-balance">
                        <span data-cursor-target="phrase" className="whitespace-nowrap">Build it piece by piece.</span> Pick the models behind it, set its personality and rules, and give it the docs it should know. Then just text it in iMessage or SMS. Free and open source, on your own computer.
                    </p>
                </StaggerItem>
                <StaggerItem className="mt-10 flex flex-wrap items-center justify-center gap-3">
                    <Button
                        variant="hero"
                        size="lg"
                        className="type-body h-13 px-8"
                        nativeButton={false}
                        render={
                            <a href="/dashboard">Explore the builder</a>
                        }
                    />
                    <Button
                        variant="ghost"
                        size="lg"
                        className="type-body h-13 px-6"
                        nativeButton={false}
                        render={
                            <a
                                href={GITHUB_URL}
                                target="_blank"
                                rel="noreferrer">
                                <GitHubMark /> Self-host it
                            </a>
                        }
                    />
                </StaggerItem>
            </Stagger>

            <div
                id="product"
                className="mx-auto mt-14 max-w-6xl scroll-mt-24 px-3 md:mt-16 md:px-6">
                <Suspense fallback={<div className="min-h-[40rem]" />}>
                    <CreateAgentDemo />
                </Suspense>
                <p className="type-caption text-muted-foreground mt-6 text-center">Example agents · an illustrated walkthrough of the dashboard</p>
            </div>
        </section>
    )
}
