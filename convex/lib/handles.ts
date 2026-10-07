// An iMessage handle is either an email or a phone number with at least 7 digits
export function handleKind(raw: string): 'phone' | 'email' | null {
    const h = raw.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return 'email'
    if (/^\+?[\d\s().-]+$/.test(h) && h.replace(/\D/g, '').length >= 7) return 'phone'
    return null
}
