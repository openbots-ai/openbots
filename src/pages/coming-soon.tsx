import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoMark } from '@/components/landing/logo'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'

export function ComingSoon({ title }: { title: string }) {
    return (
        <PageShell title={title}>
            <Stagger
                onMount
                gap={0.1}
                className="flex min-h-[calc(100svh-24rem)] flex-col items-center justify-center py-28 text-center">
                <StaggerItem>
                    <LogoMark className="size-12" />
                </StaggerItem>
                <StaggerItem>
                    <p className="type-label text-muted-foreground mt-8">{title}</p>
                    <h1 className="type-title mt-2">Coming soon</h1>
                </StaggerItem>
                <StaggerItem>
                    <p className="type-body-lg text-muted-foreground mx-auto mt-4 max-w-md text-balance">
                        We are putting the finishing touches on this page. In the meantime, the builder is open.
                    </p>
                </StaggerItem>
                <StaggerItem className="mt-10 flex flex-wrap items-center justify-center gap-3">
                    <Button
                        size="lg"
                        className="type-body h-12 px-7"
                        nativeButton={false}
                        render={<a href="/dashboard">Explore the builder</a>}
                    />
                    <Button
                        variant="ghost"
                        size="lg"
                        className="type-body h-12 px-5 has-data-[icon=inline-start]:pl-4"
                        nativeButton={false}
                        render={
                            <a href="/">
                                <ArrowLeft data-icon="inline-start" /> Back to home
                            </a>
                        }
                    />
                </StaggerItem>
            </Stagger>
        </PageShell>
    )
}
