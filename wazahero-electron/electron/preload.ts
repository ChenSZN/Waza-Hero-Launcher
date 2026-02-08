import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args
        return ipcRenderer.off(channel, ...omit)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        return ipcRenderer.invoke(channel, ...omit)
    },

    // Custom Window Controls
    minimize: () => ipcRenderer.send('window-controls', 'minimize'),
    close: () => ipcRenderer.send('window-controls', 'close'),
    restoreDefaults: () => ipcRenderer.send('window-controls', 'restore-defaults'),
    resize: (w: number, h: number) => ipcRenderer.send('resize-window', { width: w, height: h }),
    resetZoom: () => ipcRenderer.send('reset-zoom'),
})
