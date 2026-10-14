// Engine tokens: made in the owner's browser, shown once, pasted into the engine. Convex only stores the hash.
export const TOKEN_PREFIX = 'obr_'

// SHA-256 as hex. Web Crypto, so it runs the same in the browser, in Convex and in Node.
export async function hashToken(token: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 32 random bytes from the browser's (or Node's) secure generator, base64url
export function newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return TOKEN_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
