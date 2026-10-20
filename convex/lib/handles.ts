// An iMessage handle is either an email or a phone number with at least 7 digits
export function handleKind(raw: string): 'phone' | 'email' | null {
    const h = raw.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return 'email'
    if (/^\+?[\d\s().-]+$/.test(h) && h.replace(/\D/g, '').length >= 7) return 'phone'
    return null
}

// One spelling per handle, so the same person or number is found however it was typed.
// Phones become their E.164 digits: a number written with + (or 00) keeps the country code it was given, a bare
// 10-digit number is taken as US (+1), and other bare numbers keep their digits. So +47 9xxxxxxx (Norway) and
// +1 479xxxxxxx stay apart. Emails are lowercased.
export function handleKey(raw: string): string | null {
    const kind = handleKind(raw)
    if (kind === 'email') return raw.trim().toLowerCase()
    if (kind === 'phone') {
        const h = raw.trim()
        const digits = h.replace(/\D/g, '')
        if (h.startsWith('+')) return digits
        if (digits.startsWith('00')) return digits.slice(2)
        return digits.length === 10 ? `1${digits}` : digits
    }
    return null
}
