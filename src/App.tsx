import { lazy, Suspense } from 'react'
import { ReactLenis } from 'lenis/react'
import 'lenis/dist/lenis.css'
import { MotionConfig } from 'motion/react'
import { Header } from '@/components/landing/header'
import HeroSection from '@/components/landing/hero-section'
import Trust from '@/components/landing/trust'
import CallToAction from '@/components/landing/call-to-action'
import Footer from '@/components/landing/footer'
import { ComingSoon } from '@/pages/coming-soon'
import { ContactPage } from '@/pages/contact'
import { PrivacyPage, TermsPage } from '@/pages/legal'
import { isCrmPath } from '@/crm/lib/route'

// Loaded only on /dashboard so the landing bundle never ships Convex or the dashboard
const CrmApp = lazy(() => import('@/crm/crm-app'))
// The CRM demo pulls in the chart library, so it loads on its own instead of with the first paint
const CreateAgentDemo = lazy(() => import('@/components/landing/create-agent-demo'))
const PricingPage = lazy(() => import('@/pages/pricing').then((module) => ({ default: module.PricingPage })))
const FeaturesPage = lazy(() => import('@/pages/features').then((module) => ({ default: module.FeaturesPage })))

const Landing = () => (
    <>
        <Header />
        <HeroSection />
        <main className="mx-auto max-w-6xl overflow-hidden">
            <Suspense fallback={<div id="create-agent" className="min-h-[60rem]" />}>
                <CreateAgentDemo />
            </Suspense>
            <Trust />
            <CallToAction />
        </main>
        <Footer />
    </>
)

const comingSoon: Record<string, string> = {
    '/changelog': 'Changelog',
    '/docs': 'Docs',
    '/careers': 'Careers',
    '/security': 'Security',
}

// Plain path-based routing: every link is a normal <a>, so each page is a full load
function Page() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'

    if (path === '/privacy') return <PrivacyPage />
    if (path === '/terms') return <TermsPage />
    if (path === '/contact') return <ContactPage />
    if (path === '/features') return <Suspense fallback={null}><FeaturesPage /></Suspense>
    if (path === '/pricing') return <Suspense fallback={null}><PricingPage /></Suspense>
    if (comingSoon[path]) return <ComingSoon title={comingSoon[path]} />

    // About (and any unknown path) is the landing page itself
    if (path !== '/') window.history.replaceState(null, '', '/')
    return <Landing />
}

export default function App() {
    if (isCrmPath(window.location.pathname)) {
        return (
            <Suspense fallback={null}>
                <CrmApp />
            </Suspense>
        )
    }

    return (
        <MotionConfig reducedMotion="user">
            <ReactLenis
                root
                options={{ lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.9, anchors: { offset: -80 } }}
            />
            <Page />
        </MotionConfig>
    )
}
