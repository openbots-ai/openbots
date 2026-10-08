// An iMessage handle is either an email or a phone number with at least 7 digits
export function handleKind(raw: string): 'phone' | 'email' | null {
    const h = raw.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return 'email'
    if (/^\+?[\d\s().-]+$/.test(h) && h.replace(/\D/g, '').length >= 7) return 'phone'
    return null
}

// One spelling per handle, so the same person or number is found however it was typed.
// Phones keep their digits (a leading US 1 is dropped); emails are lowercased.
export function handleKey(raw: string): string | null {
    const kind = handleKind(raw)
    if (kind === 'email') return raw.trim().toLowerCase()
    if (kind === 'phone') {
        const digits = raw.replace(/\D/g, '')
        return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    }
    return null
}
