import { contextBridge, ipcRenderer } from 'electron'

// The only things the window can ask the app to do
contextBridge.exposeInMainWorld('openbots', {
    view: () => ipcRenderer.invoke('view'),
    onView: (fn: (view: unknown) => void) => ipcRenderer.on('view', (_e, view) => fn(view)),
    set: (patch: { keepAwake?: boolean; openAtLogin?: boolean }) => ipcRenderer.invoke('set', patch),
    open: (what: 'dashboard' | 'pair' | 'screen' | 'accessibility' | 'autoLogin') => ipcRenderer.invoke('open', what),
    restart: () => ipcRenderer.invoke('restart'),
    log: () => ipcRenderer.invoke('log') as Promise<string>,
})
