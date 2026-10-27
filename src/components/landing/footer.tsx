import { Logo } from '@/components/landing/logo'
import { GitHubMark } from '@/components/landing/github-mark'
import { CHANGELOG_URL, GITHUB_URL, sectionHref } from '@/lib/site'

const footerLinks = [
    {
        name: 'Product',
        links: [
            { label: 'Features', href: sectionHref('features') },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Changelog', href: CHANGELOG_URL },
            { label: 'Docs', href: `${GITHUB_URL}#readme` },
        ],
    },
    {
        name: 'Company',
        links: [
            { label: 'About', href: '/' },
            { label: 'GitHub', href: GITHUB_URL },
        ],
    },
    {
        name: 'Legal',
        links: [
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
        ],
    },
]

export default function Footer() {
    return (
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-8">
            <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
                <div className="col-span-2">
                    <Logo />
                    <p className="type-body-sm text-muted-foreground mt-3 max-w-xs">Your own personal AI assistant, made your way.</p>
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
                <span>© {new Date().getFullYear()} OpenBots. Open source under the <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="hover:text-foreground underline underline-offset-4">MIT license</a>.</span>
                <a
                    href={GITHUB_URL}
                    aria-label="OpenBots on GitHub"
                    className="hover:text-foreground flex items-center gap-2 duration-150">
                    <GitHubMark className="size-4" />
                    openbots-ai/openbots
                </a>
            </div>
        </footer>
    )
}
