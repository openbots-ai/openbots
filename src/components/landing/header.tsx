import { useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Logo } from '@/components/landing/logo'
import { Button } from '@/components/ui/button'
import { sectionHref } from '@/lib/site'

const menuItems = [
    { name: 'Product', href: sectionHref('product') },
    { name: 'Features', href: '/features' },
    { name: 'Use cases', href: sectionHref('create-agent') },
    { name: 'Why OpenBots', href: sectionHref('why-openbots') },
    { name: 'Trust', href: sectionHref('trust') },
    { name: 'Pricing', href: '/pricing' },
]

export const Header = () => {
    const [open, setOpen] = useState(false)

    return (
        <header className="bg-background/80 sticky top-0 z-20 backdrop-blur">
            <nav className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6">
                <a
                    href="/"
                    aria-label="home">
                    <Logo />
                </a>

                <ul className="type-label text-muted-foreground hidden gap-8 md:flex">
                    {menuItems.map((item) => (
                        <li key={item.name}>
                            <a
                                href={item.href}
                                className="hover:text-foreground duration-150">
                                {item.name}
                            </a>
                        </li>
                    ))}
                </ul>

                <Button
                    size="sm"
                    className="ml-auto hidden md:inline-flex"
                    nativeButton={false}
                    render={
                        <a href={sectionHref('early-access')}>
                            Coming soon <ArrowRight data-icon="inline-end" />
                        </a>
                    }
                />

                <button
                    onClick={() => setOpen(!open)}
                    aria-label={open ? 'Close menu' : 'Open menu'}
                    className="ml-auto md:hidden">
                    {open ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
            </nav>

            {open && (
                <ul className="space-y-1 px-6 py-4 md:hidden">
                    {menuItems.map((item) => (
                        <li key={item.name}>
                            <a
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className="type-subheading block py-2">
                                {item.name}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </header>
    )
}
