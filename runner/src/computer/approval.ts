import { parseCombo } from './driver'

// Typing and pressing Enter can send or submit something, so the engine (not the model) asks the owner first. A web
// page, email or message on the screen can talk the model into typing; this check is what stops that from going out.
// Pure navigation (mouse moves, clicks, scrolling, screenshots) isn't asked about.

// The longest list of actions an approval text may show. Longer text is declined unasked rather than shown cut, so the
// owner never approves text they couldn't read.
export const APPROVAL_SHOW_LIMIT = 600
export const APPROVAL_SUFFIX = 'Reply YES to allow it, YES ALL to stop asking me, or NO.'

// Characters the owner couldn't see in a text (control, format, bidi and zero-width characters, odd spaces) are spelled
// out, as are backslashes, so the text shown is exactly the text typed
export const visible = (text: string) =>
    text.replace(/\\|[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]|[^\S ]/gu, (c) =>
        c === '\\' ? '\\\\' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : `\\u{${c.codePointAt(0)!.toString(16).toUpperCase()}}`,
    )

// What a key combination does that needs the owner's yes, or null for one that doesn't (arrows, Tab, Escape, shortcuts)
function keyNeed(combo: string): 'enter' | 'text' | 'paste' | null {
    let parsed: ReturnType<typeof parseCombo>
    try {
        parsed = parseCombo(combo)
    } catch {
        // Not a key the driver can press: it fails without doing anything
        return null
    }
    const { mods, key } = parsed
    // Enter, Return and Cmd/Ctrl/Shift/Alt+Enter all send in some app
    if (key === 'enter') return 'enter'
    const ctrl = mods.includes('ctrl')
    const shortcut = mods.includes('super') || (ctrl && !mods.includes('alt'))
    if ((shortcut && key === 'v') || (mods.includes('shift') && key === 'insert')) return 'paste'
    // A character (or space) with no shortcut modifier types it; Ctrl+Alt is AltGr, which types too
    if ((key === 'space' || [...key].length === 1) && !shortcut) return 'text'
    return null
}

// The computer action as the owner will read it, when it needs their yes; null when it doesn't
export function gated(name: string, input: Record<string, unknown>): string | null {
    if (name === 'type') {
        const text = String(input.text ?? '')
        return text ? `type “${visible(text)}”` : null
    }
    if (name === 'key') {
        const combo = String(input.text ?? '')
        const need = keyNeed(combo)
        if (!need) return null
        const n = Number(input.repeat ?? 1)
        const times = Number.isFinite(n) && n > 1 ? ` ×${Math.min(100, Math.round(n))}` : ''
        return `press ${visible(combo)}${times}${need === 'paste' ? ' (pastes whatever is on the clipboard)' : ''}`
    }
    return null
}

// Actions that don't touch the screen, so a batch of typing can carry on across them
export const PASSIVE = new Set(['screenshot', 'wait', 'cursor_position'])

export type Verdict = 'yes' | 'all' | 'no'

// The owner's reply to an approval text. Anything that isn't a plain yes is a no (the model gets their words).
export function verdict(answer: string): Verdict {
    if (/^\s*yes\W+(to\s+)?all\b/i.test(answer)) return 'all'
    if (/^\s*(yes|y|yep|yeah|ok|okay|sure|approve|approved|go ahead)\s*[.!]*\s*$/i.test(answer)) return 'yes'
    return 'no'
}

// The approval text: where it happens, each action exactly, and how to answer
export function approvalText(actions: string[], window: string | null): string {
    const where = window ? ` In ${window}:` : ''
    return `Allow this on your computer?${where}\n${actions.map((a) => `• ${a}`).join('\n')}\n${APPROVAL_SUFFIX}`
}
