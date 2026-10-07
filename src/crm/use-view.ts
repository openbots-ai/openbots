import { useCallback, useEffect, useState } from 'react'
import { parseView, viewHref, type View } from './lib/view'

export function useView() {
    const [state, setState] = useState(() => parseView(window.location.search))

    useEffect(() => {
        const onPop = () => setState(parseView(window.location.search))
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    const go = useCallback((view: View, id?: string) => {
        window.history.pushState(null, '', viewHref(view, id))
        setState({ view, id })
    }, [])

    return { ...state, go }
}
