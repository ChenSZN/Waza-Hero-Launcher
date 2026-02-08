import { app, BrowserWindow, ipcMain, screen, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { configService } from './services/configService'
import { libraryService } from './services/libraryService'
import { gameService } from './services/gameService'
import { downloadService } from './services/downloadService'

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ └── dist-electron
// │   └── main.js
// │   └── preload.js
//
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// Register custom protocols
function registerProtocols() {
    protocol.registerFileProtocol('waza-song-asset', (request, callback) => {
        const songsPath = configService.get('ruta_songs') as string
        const url = request.url.replace('waza-song-asset://', '')
        try {
            callback({ path: path.join(songsPath, decodeURIComponent(url)) })
        } catch {
            callback({ error: -6 }) // FILE_NOT_FOUND
        }
    })

    protocol.registerFileProtocol('waza-song-audio', (request, callback) => {
        const songsPath = configService.get('ruta_songs') as string
        const url = request.url.replace('waza-song-audio://', '')
        try {
            callback({ path: path.join(songsPath, decodeURIComponent(url)) })
        } catch {
            callback({ error: -6 })
        }
    })

    protocol.registerFileProtocol('waza-launcher-asset', (request, callback) => {
        const url = request.url.replace('waza-launcher-asset://', '')
        const assetPath = path.join(__dirname, '../assets', decodeURIComponent(url))
        try {
            if (fs.existsSync(assetPath)) {
                callback({ path: assetPath })
            } else {
                callback({ error: -6 })
            }
        } catch (e) {
            callback({ error: -6 })
        }
    })
}

const BASE_WIDTH = 1280
const BASE_HEIGHT = 720

let win: BrowserWindow | null

const applyProportionalZoom = (factor: number) => {
    if (!win) return
    const safeFactor = Math.max(0.5, Math.min(2.0, factor))
    win.webContents.setZoomFactor(safeFactor)

    const newWidth = Math.round(BASE_WIDTH * safeFactor)
    const newHeight = Math.round(BASE_HEIGHT * safeFactor)

    // Temporarily enable resizable to allow setSize to work on all platforms
    win.setResizable(true)
    win.setSize(newWidth, newHeight)
    win.setResizable(false)

    win.center()
}

function createWindow() {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    win = new BrowserWindow({
        width: BASE_WIDTH,
        height: BASE_HEIGHT,
        x: Math.floor((screenWidth - BASE_WIDTH) / 2),
        y: Math.floor((screenHeight - BASE_HEIGHT) / 2),
        frame: false,
        resizable: false,
        transparent: false,
        backgroundColor: '#010a13',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    // Test actively push message to the Electron-Renderer
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date()).toLocaleString())
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST as string, 'index.html'))
    }

    // Handle Zoom Shortcuts (Ctrl +, Ctrl -, Ctrl 0)
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control || input.meta) {
            if (input.key === '=' || input.key === '+') {
                const currentZoom = win?.webContents.getZoomFactor() || 1
                applyProportionalZoom(currentZoom + 0.1)
                event.preventDefault()
            } else if (input.key === '-') {
                const currentZoom = win?.webContents.getZoomFactor() || 1
                applyProportionalZoom(currentZoom - 0.1)
                event.preventDefault()
            } else if (input.key === '0') {
                applyProportionalZoom(1.0)
                event.preventDefault()
            }
        }
    })
}

// --- IPC Handlers ---

ipcMain.on('window-controls', (_event, action) => {
    if (!win) return
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    switch (action) {
        case 'minimize': win.minimize(); break
        case 'close': win.close(); break
        case 'restore-defaults':
            win.setSize(1280, 720)
            win.setPosition(Math.floor((sw - 1280) / 2), Math.floor((sh - 720) / 2))
            break
    }
})

ipcMain.on('resize-window', (_event, { width, height }) => {
    if (win) win.setSize(Math.round(width), Math.round(height))
})

ipcMain.on('reset-zoom', () => {
    applyProportionalZoom(1.0)
})

// Data Bridge
ipcMain.handle('get-config', (_e, key: string) => configService.get(key))
ipcMain.handle('save-config', (_e, { key, value }: { key: string, value: any }) => configService.set(key, value))

ipcMain.handle('scan-library', async (_e, force: boolean = false) => {
    const songsPath = configService.get('ruta_songs') as string
    return libraryService.scanLocalLibrary(songsPath, app.getAppPath(), force)
})

ipcMain.handle('get-master-library', async () => {
    return libraryService.getMasterLibrary(app.getAppPath())
})

ipcMain.handle('get-songs-to-sync', async () => {
    const songsPath = configService.get('ruta_songs') as string
    return libraryService.getSongsToSync(songsPath, app.getAppPath())
})

ipcMain.handle('confirm-download', async (event, selected: any[], withVideo: boolean = false) => {
    console.log('[MAIN] Confirmed download for:', selected.length, 'songs')

    try {
        const songsPath = configService.get('ruta_songs') as string
        const credPath = path.join(app.getAppPath(), 'data', 'credentials.json')
        const tokenPath = path.join(app.getAppPath(), 'data', 'token.json')

        // Authenticate with Google Drive
        await downloadService.authenticate(credPath, tokenPath)

        // Download each selected song
        let completed = 0
        const total = selected.length
        const fileBytesMap = new Map<string, number>()
        let totalDownloadedOverall = 0
        let lastUpdateTime = Date.now()
        let lastReportedBytes = 0

        for (const song of selected) {
            await downloadService.downloadSong(song, songsPath, withVideo, (songProgress, fileBytes, fileId) => {
                fileBytesMap.set(fileId, fileBytes)

                const now = Date.now()
                const deltaTime = (now - lastUpdateTime) / 1000

                // Only update speed and send message if enough time has passed (e.g. 500ms)
                if (deltaTime >= 0.5) {
                    let currentTotalBytes = 0
                    fileBytesMap.forEach(b => currentTotalBytes += b)

                    const bytesSinceLast = currentTotalBytes - lastReportedBytes
                    const speedBps = bytesSinceLast / deltaTime // bytes per second
                    const speedMBps = speedBps / (1024 * 1024)

                    const overallProgress = (completed + songProgress) / total

                    if (win) {
                        win.webContents.send('download-progress', {
                            progress: overallProgress,
                            speed: speedMBps.toFixed(2) + ' MB/s'
                        })
                    }

                    lastUpdateTime = now
                    lastReportedBytes = currentTotalBytes
                }
            })
            completed++
            // Optimization: clear map for completed song to avoid leaks, 
            // but we need to keep track of total bytes if we want absolute global bytes.
            // For now, simple per-song speed/progress is okay as long as it's continuous.
        }

        return { success: true }
    } catch (error: any) {
        console.error('[MAIN] Download error:', error)
        return { success: false, error: error.message }
    }
})

ipcMain.handle('launch-game', async () => {
    const exePath = configService.get('ruta_exe') as string
    try {
        return gameService.launch(exePath)
    } catch (e: any) {
        return { error: e.message }
    }
})

ipcMain.handle('get-backgrounds', async () => {
    try {
        const bgFolder = path.join(__dirname, '../assets')
        console.log('[MAIN] Scanning backgrounds in:', bgFolder)
        if (fs.existsSync(bgFolder)) {
            const files = fs.readdirSync(bgFolder)
                .filter(f => f.toLowerCase().startsWith('background') && ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()))
                .map(f => `waza-launcher-asset://${f}`)
            console.log('[MAIN] Found backgrounds:', files.length)
            return files
        } else {
            console.error('[MAIN] Assets folder not found at:', bgFolder)
        }
    } catch (e: any) {
        console.error('[MAIN] Error scanning backgrounds:', e.message)
    }
    return []
})

ipcMain.handle('get-patch-notes', async () => {
    try {
        const response = await fetch('https://api.github.com/repos/ChenSZN/Waza-Hero-Launcher/releases/latest')
        const data = await response.json()
        return {
            version: data.tag_name,
            body: data.body,
            date: data.published_at
        }
    } catch {
        return { version: 'v3.3.0', body: 'Error cargando notas desde GitHub.', date: '' }
    }
})

ipcMain.handle('get-game-stats', async () => {
    const songsPath = configService.get('ruta_songs') as string
    if (!songsPath || !fs.existsSync(songsPath)) return { total_songs: 0, last_sync: '-' }

    try {
        const stats = await libraryService.getLibraryDetailedStats(songsPath)
        const fsStats = fs.statSync(songsPath)

        return {
            total_songs: stats?.totalSongs || 0,
            last_sync: fsStats.mtime.toLocaleString(),
            master_songs: 1100,
            detailed: stats
        }
    } catch {
        return { total_songs: 0, last_sync: '-' }
    }
})

ipcMain.handle('select-folder', async () => {
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('select-file', async () => {
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Ejecutables', extensions: ['exe'] }]
    })
    return result.canceled ? null : result.filePaths[0]
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(() => {
    registerProtocols()
    createWindow()
})
