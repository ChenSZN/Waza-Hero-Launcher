import fs from 'node:fs'
import path from 'node:path'

export const libraryService = {
    parseIni(content: string) {
        const lines = content.split('\n')
        const result: Record<string, string> = {}
        lines.forEach(line => {
            const match = line.match(/^\s*([^=;#\s]+)\s*=\s*(.*?)\s*$/)
            if (match) {
                result[match[1].toLowerCase()] = match[2]
            }
        })
        return result
    },

    getLibraryDetailedStats(songsPath: string) {
        if (!songsPath || !fs.existsSync(songsPath)) return null

        const stats = {
            totalSongs: 0,
            totalSize: 0, // bytes
            healthySongs: 0,
            artists: {} as Record<string, number>,
            charters: {} as Record<string, number>,
            genres: {} as Record<string, number>
        }

        const walk = (dir: string) => {
            let files: string[] = []
            try {
                files = fs.readdirSync(dir)
            } catch { return }

            if (path.basename(dir) === '.sync') return

            const isSongFolder = files.some(f => f.toLowerCase() === 'song.ini' || f.toLowerCase().endsWith('.chart') || f.toLowerCase().endsWith('.mid'))

            if (isSongFolder) {
                stats.totalSongs++

                // Integrity check: need chart + audio
                const hasChart = files.some(f => f.toLowerCase().endsWith('.chart') || f.toLowerCase().endsWith('.mid'))
                const hasAudio = files.some(f => ['.opus', '.ogg', '.mp3', '.wav'].includes(path.extname(f).toLowerCase()))
                if (hasChart && hasAudio) stats.healthySongs++

                // Size and Metadata
                files.forEach(f => {
                    const fullPath = path.join(dir, f)
                    try {
                        const s = fs.statSync(fullPath)
                        stats.totalSize += s.size

                        if (f.toLowerCase() === 'song.ini') {
                            const ini = this.parseIni(fs.readFileSync(fullPath, 'utf8'))
                            if (ini.artist) stats.artists[ini.artist] = (stats.artists[ini.artist] || 0) + 1
                            if (ini.charter) stats.charters[ini.charter] = (stats.charters[ini.charter] || 0) + 1
                            if (ini.genre) stats.genres[ini.genre] = (stats.genres[ini.genre] || 0) + 1
                        }
                    } catch { }
                })
            }

            files.forEach(f => {
                const fullPath = path.join(dir, f)
                try {
                    if (fs.statSync(fullPath).isDirectory() && f !== '.sync') {
                        walk(fullPath)
                    }
                } catch { }
            })
        }

        walk(songsPath)

        // Sort and get Top 5
        const getTop = (record: Record<string, number>) =>
            Object.entries(record)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }))

        return {
            ...stats,
            topArtists: getTop(stats.artists),
            topCharters: getTop(stats.charters),
            topGenres: getTop(stats.genres),
            integrity: stats.totalSongs > 0 ? (stats.healthySongs / stats.totalSongs) * 100 : 0
        }
    },

    scanLocalLibrary(songsPath: string, appPath: string, force: boolean = false) {
        if (!songsPath || !fs.existsSync(songsPath)) return []

        const cacheDir = path.join(appPath, 'data')
        const cachePath = path.join(cacheDir, 'local_library_cache.json')

        // 1. Check cache first
        if (!force && fs.existsSync(cachePath)) {
            try {
                const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
                if (cacheData.path === songsPath && Array.isArray(cacheData.songs)) {
                    console.log('[LIB] Returning cached library:', cacheData.songs.length, 'songs')
                    return cacheData.songs
                }
            } catch (e) {
                console.error('[LIB] Cache read error:', e)
            }
        }

        console.log('[LIB] Performing deep disk scan...')
        const songs: any[] = []
        const imgExts = ['.jpg', '.jpeg', '.png', '.webp']
        const audioExts = ['.opus', '.ogg', '.mp3', '.wav']

        const walk = (dir: string) => {
            let files: string[] = []
            try {
                files = fs.readdirSync(dir)
            } catch { return }

            // Skip .sync folder
            if (path.basename(dir) === '.sync') return

            const isSongFolder = files.some(f => f.toLowerCase() === 'song.ini' || f.toLowerCase().endsWith('.chart') || f.toLowerCase().endsWith('.mid'))

            if (isSongFolder) {
                const item = path.relative(songsPath, dir).replace(/\\/g, '/')

                // Album Art
                let cover: string | null = null
                for (const ext of imgExts) {
                    if (fs.existsSync(path.join(dir, `album${ext}`))) {
                        cover = `waza-song-asset://${item}/album${ext}`
                        break
                    }
                }
                if (!cover) {
                    const anyImg = files.find(f => imgExts.includes(path.extname(f).toLowerCase()))
                    if (anyImg) cover = `waza-song-asset://${item}/${anyImg}`
                }

                // Audio - prioritize files named 'song' with valid audio extensions
                const stemRegex = /^(song|guitar|bass|rhythm|drums|vocals|keys|crowd)(_?\d+)?$/i
                let audioFiles: string[] = []

                // Scan for stems
                files.forEach(f => {
                    const baseName = path.basename(f, path.extname(f))
                    const ext = path.extname(f).toLowerCase()
                    if (audioExts.includes(ext) && stemRegex.test(baseName)) {
                        audioFiles.push(`waza-song-audio://${item}/${f}`)
                    }
                })

                // If no stems found, fallback to any audio
                if (audioFiles.length === 0) {
                    const anyAudio = files.find(f => audioExts.includes(path.extname(f).toLowerCase()))
                    if (anyAudio) audioFiles.push(`waza-song-audio://${item}/${anyAudio}`)
                }

                // Prioritize 'song' for the main audio preview
                const mainAudio = audioFiles.find(a => a.toLowerCase().includes('song')) || (audioFiles.length > 0 ? audioFiles[0] : null)

                // Metadata from song.ini
                let artist = 'Unknown Artist'
                let charter = 'Unknown Charter'
                const iniPath = path.join(dir, 'song.ini')
                if (fs.existsSync(iniPath)) {
                    try {
                        const iniContent = fs.readFileSync(iniPath, 'utf8')
                        const ini = this.parseIni(iniContent)
                        if (ini.artist) artist = ini.artist
                        if (ini.charter) charter = ini.charter
                    } catch { }
                }

                songs.push({
                    name: path.basename(dir),
                    path: dir,
                    rel_path: item,
                    cover,
                    audio: mainAudio,
                    audioStems: audioFiles,
                    mtime: fs.statSync(dir).mtimeMs,
                    artist,
                    charter
                })
            }

            // Always continue scanning subdirectories to find nested songs or songs in packs
            files.forEach(f => {
                const fullPath = path.join(dir, f)
                try {
                    if (fs.statSync(fullPath).isDirectory() && f !== '.sync') {
                        walk(fullPath)
                    }
                } catch { }
            })
        }

        try {
            walk(songsPath)
            const sortedSongs = songs.sort((a, b) => b.mtime - a.mtime)

            // 2. Save result to cache
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
            fs.writeFileSync(cachePath, JSON.stringify({
                path: songsPath,
                songs: sortedSongs,
                timestamp: Date.now()
            }, null, 2))

            return sortedSongs
        } catch (e) {
            console.error('[ERR] Library scan failed:', e)
            return []
        }
    },

    getMasterLibrary(appPath: string) {
        const masterPath = path.join(appPath, 'data', 'master_songs.json')
        if (!fs.existsSync(masterPath)) return []
        try {
            const data = JSON.parse(fs.readFileSync(masterPath, 'utf8'))
            const archivos = data.archivos || data
            const songs: any = {}
            archivos.forEach((a: any) => {
                const rp = a.ruta_relativa
                if (!songs[rp]) {
                    songs[rp] = {
                        name: rp.split('/').pop() || rp,
                        path: rp,
                        is_master: true,
                        cover: null
                    }
                }
            })
            return Object.values(songs)
        } catch { return [] }
    },

    getSongsToSync(songsPath: string, appPath: string) {
        console.log('[LIB] getSongsToSync called with songsPath:', songsPath)
        console.log('[LIB] appPath:', appPath)
        const masterPath = path.join(appPath, 'data', 'master_songs.json')
        console.log('[LIB] Computed masterPath:', masterPath)
        if (!songsPath || !fs.existsSync(songsPath) || !fs.existsSync(masterPath)) {
            console.log('[LIB] Missing requirements - songsPath exists:', fs.existsSync(songsPath), 'masterPath exists:', fs.existsSync(masterPath))
            return []
        }

        const crypto = require('crypto')
        const cacheDir = path.join(appPath, 'data')
        const cachePath = path.join(cacheDir, 'file_hashes.json')

        // Load hash cache
        let hashCache: Record<string, { hash: string, mtime: number }> = {}
        try {
            if (fs.existsSync(cachePath)) {
                hashCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
            }
        } catch { }

        const getFileHash = (filePath: string): string | null => {
            try {
                const stats = fs.statSync(filePath)
                const mtime = stats.mtimeMs

                // Check cache
                if (hashCache[filePath] && hashCache[filePath].mtime === mtime) {
                    return hashCache[filePath].hash
                }

                // Compute MD5
                const fileBuffer = fs.readFileSync(filePath)
                const hashSum = crypto.createHash('md5')
                hashSum.update(fileBuffer)
                const hash = hashSum.digest('hex')

                // Update cache
                hashCache[filePath] = { hash, mtime }
                return hash
            } catch {
                return null
            }
        }

        try {
            const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf8'))
            const masterFiles = masterData.archivos || masterData
            console.log('[LIB] Master has', masterFiles.length, 'files')

            const toSync: any = {}
            let cacheModified = false

            masterFiles.forEach((fileInfo: any) => {
                const rp = fileInfo.ruta_relativa
                const fileName = fileInfo.nombre
                const filePath = path.join(songsPath, rp, fileName)

                let needsDownload = false

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    needsDownload = true
                } else {
                    try {
                        // Compare file size
                        const localSize = fs.statSync(filePath).size
                        const remoteSize = parseInt(fileInfo.tamano || '0')

                        if (localSize !== remoteSize) {
                            needsDownload = true
                        }
                        // MD5 verification disabled for performance
                        // TODO: Re-enable with async implementation
                        // else if (fileInfo.hash) {
                        //     const localHash = getFileHash(filePath)
                        //     if (localHash !== fileInfo.hash) {
                        //         needsDownload = true
                        //     }
                        //     cacheModified = true
                        // }
                    } catch {
                        needsDownload = true
                    }
                }

                if (needsDownload) {
                    if (!toSync[rp]) toSync[rp] = []
                    toSync[rp].push(fileInfo)
                }
            })

            // Save hash cache if modified
            if (cacheModified) {
                try {
                    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
                    fs.writeFileSync(cachePath, JSON.stringify(hashCache, null, 2))
                } catch { }
            }

            const result = Object.entries(toSync).map(([name, files]) => ({
                name: name.split('/').pop() || name,
                full_path: name,
                files,
                status: 'NUEVA'
            }))

            console.log('[LIB] Found', result.length, 'songs to sync')
            return result
        } catch (e) {
            console.error('[LIB] Error in getSongsToSync:', e)
            return []
        }
    }
}
