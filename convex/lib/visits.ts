import type { UserIdentity } from 'convex/server'

// The public pages whose visits are counted. Anything else (the dashboard, unknown paths) is never recorded, so
// the table can't fill up with made-up paths.
export const PUBLIC_PATHS = ['/', '/pricing', '/privacy', '/terms', '/changelog', '/docs', '/careers', '/security'] as const
export type PublicPath = (typeof PUBLIC_PATHS)[number]

export const isPublicPath = (path: unknown): path is PublicPath => typeof path === 'string' && (PUBLIC_PATHS as readonly string[]).includes(path)

// SITE_OWNER lists who may see the site's visitor counts: Clerk user IDs (user_…) or verified sign-in emails, comma
// separated. Unset means nobody sees them.
export function isSiteOwner(identity: UserIdentity | null, siteOwner: string | undefined) {
    if (!identity || !siteOwner) return false
    const owners = siteOwner
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    if (owners.includes(identity.subject.toLowerCase())) return true
    const email = identity.email?.toLowerCase()
    return !!email && identity.emailVerified !== false && owners.includes(email)
}
