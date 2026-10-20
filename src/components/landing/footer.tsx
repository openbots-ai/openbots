import { Logo } from '@/components/landing/logo'
import { CHANGELOG_URL, GITHUB_URL, LICENSE_URL, README_URL, SECURITY_URL } from '@/lib/site'

const footerLinks = [
    {
        name: 'Product',
        links: [
            { label: 'Features', href: '/features' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Changelog', href: CHANGELOG_URL },
            { label: 'Docs', href: README_URL },
        ],
    },
    {
        name: 'Project',
        links: [
            { label: 'GitHub', href: GITHUB_URL },
            { label: 'Contact', href: '/contact' },
            { label: 'Security', href: SECURITY_URL },
        ],
    },
    {
        name: 'Legal',
        links: [
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'MIT license', href: LICENSE_URL },
        ],
    },
]

export default function Footer() {
    return (
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-20">
            <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
                <div className="col-span-2">
                    <Logo />
                    <p className="type-body-sm text-muted-foreground mt-3 max-w-xs">your own personal AI assistant. free, open source, and run by you.</p>
                </div>
                {footerLinks.map((group) => (
                    <div
                        key={group.name}
                        className="type-body-sm space-y-3">
                        <p className="font-medium">{group.name}</p>
                        {group.links.map(({ label, href }) => (
                            <a
                                key={label}
                                href={href}
                                {...(href.startsWith('http') && { target: '_blank', rel: 'noreferrer' })}
                                className="text-muted-foreground hover:text-foreground block duration-150">
                                {label}
                            </a>
                        ))}
                    </div>
                ))}
            </div>

            <div className="type-caption text-muted-foreground mt-14 flex flex-col justify-between gap-3 pt-6 sm:flex-row">
                <span>© {new Date().getFullYear()} OpenBots contributors. Open source under the MIT license.</span>
                <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-violet-500" /> Self-hosted · in active development
                </span>
            </div>
        </footer>
    )
}
