import { Logo } from '@/components/landing/logo'
import { sectionHref } from '@/lib/site'

const footerLinks = [
    {
        name: 'Product',
        links: [
            { label: 'Features', href: sectionHref('features') },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Changelog', href: '/changelog' },
            { label: 'Docs', href: '/docs' },
        ],
    },
    {
        name: 'Company',
        links: [
            { label: 'About', href: '/' },
            { label: 'Careers', href: '/careers' },
            { label: 'Contact', href: '/contact' },
        ],
    },
    {
        name: 'Legal',
        links: [
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'Security', href: '/security' },
        ],
    },
]

export default function Footer() {
    return (
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-20">
            <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
                <div className="col-span-2">
                    <Logo />
                    <p className="type-body-sm text-muted-foreground mt-3 max-w-xs">a whole team of ai agents, one text away.</p>
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
                                className="text-muted-foreground hover:text-foreground block duration-150">
                                {label}
                            </a>
                        ))}
                    </div>
                ))}
            </div>

            <div className="type-caption text-muted-foreground mt-14 flex flex-col justify-between gap-3 pt-6 sm:flex-row">
                <span>© {new Date().getFullYear()} OpenBots. All rights reserved.</span>
                <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" /> All systems normal
                </span>
            </div>
        </footer>
    )
}
