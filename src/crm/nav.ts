import { createContext, useContext } from 'react'
import type { View } from './lib/view'

export const NavContext = createContext<(view: View, id?: string) => void>(() => {})
export const useNav = () => useContext(NavContext)
