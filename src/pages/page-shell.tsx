import { useEffect, type ReactNode } from 'react'
import { Header } from '@/components/landing/header'
import Footer from '@/components/landing/footer'

// Shared frame for every page other than the landing page
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
    useEffect(() => {
        document.title = `${title} · OpenDots`
    }, [title])

    return (
        <>
            <Header />
            <main className="mx-auto max-w-6xl px-6">{children}</main>
            <Footer />
        </>
    )
}
