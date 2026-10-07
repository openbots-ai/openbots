import { useEffect, useState, type ReactNode } from 'react'
import { ToastContext } from './toast-context'

export function ToastProvider({ children }: { children: ReactNode }) {
    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        if (!message) return
        const t = setTimeout(() => setMessage(null), 4000)
        return () => clearTimeout(t)
    }, [message])

    return (
        <ToastContext value={setMessage}>
            {children}
            {message && (
                <div role="status" className="fixed right-4 bottom-4 z-60 max-w-sm rounded-lg bg-neutral-900 px-4 py-3 text-[13px] text-white shadow-lg">
                    {message}
                </div>
            )}
        </ToastContext>
    )
}
