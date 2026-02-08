import { useState, useEffect, useRef, useMemo } from 'react'
import {
    Home, Layout, Activity, Settings, Music, Play, Pause,
    Minus, X, Disc, User, CheckCircle2, Disc2, RefreshCw, Layers, Download,
    ShieldCheck, Globe, HardDrive
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// --- Electron API Bridge ---
const electron = (window as any).ipcRenderer

interface Song {
    name: string;
    path: string;
    rel_path: string;
    cover: string | null;
    audio: string | null;
    audioStems?: string[];
    mtime: number;
    is_master?: boolean;
    status?: string;
    artist?: string;
    charter?: string;
}

function App() {
    const [activeTab, setActiveTab] = useState('home')
    const [activePage, setActivePage] = useState('home')
    const [subPage, setSubPage] = useState('INICIO')
    const [zoom, setZoom] = useState(() => {
        const saved = localStorage.getItem('waza_zoom')
        return saved ? parseFloat(saved) : 1.0
    })

    const [status, setStatus] = useState({ title: 'ONLINE', sub: 'Waza Core cargado.', color: '#0ac8b9' })
    const [backgrounds, setBackgrounds] = useState<string[]>([])
    const [currentBgIndex, setCurrentBgIndex] = useState(0)
    const [localLibrary, setLocalLibrary] = useState<Song[]>([])
    const [masterLibrary, setMasterLibrary] = useState<Song[]>([])
    const [libraryFilter, setLibraryFilter] = useState('LOCALES')
    const [stats, setStats] = useState<any>({ total_songs: 0, last_sync: '-', master_songs: 1100, detailed: null })
    const [patchNotes, setPatchNotes] = useState({ version: '', body: '', date: '' })
    const [paths, setPaths] = useState({ game: 'No seleccionado', songs: 'No seleccionado' })
    const [playingAudio, setPlayingAudio] = useState<string | null>(null)
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
    const [currentSong, setCurrentSong] = useState<Song | null>(null)
    const [logs, setLogs] = useState<string[]>([])
    const [isScanning, setIsScanning] = useState(false)
    const [songsToSync, setSongsToSync] = useState<any[]>([])
    const [selectedSongs, setSelectedSongs] = useState<Record<number, boolean>>({})
    const [hasUpdates, setHasUpdates] = useState(false)
    const [progress, setProgress] = useState(0)
    const [librarySearch, setLibrarySearch] = useState('')
    const [syncSearch, setSyncSearch] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloadStats, setDownloadStats] = useState<{ progress: number, eta: string, speed?: string }>({ progress: 0, eta: '--:--' })
    const [downloadWithVideo, setDownloadWithVideo] = useState(false)
    const downloadStartTimeRef = useRef<number>(0)
    const [visibleCount, setVisibleCount] = useState(60)
    const [currentDashboardSlide, setCurrentDashboardSlide] = useState(0)

    // --- Scaling (Ctrl + / -) ---
    useEffect(() => {
        const updateScaling = (newZoom: number) => {
            const roundedZoom = Math.round(newZoom * 100) / 100
            setZoom(roundedZoom)
            localStorage.setItem('waza_zoom', roundedZoom.toString())
            if (electron) electron.send('resize-window', { width: 1280 * roundedZoom, height: 720 * roundedZoom })
        }

        const handleResize = () => {
            const widthScale = window.innerWidth / 1280
            const heightScale = window.innerHeight / 720
            const newScale = Math.min(widthScale, heightScale)
            setZoom(newScale)
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey) {
                if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    const next = Math.min(zoom + 0.05, 1.5)
                    updateScaling(next)
                }
                else if (e.key === '-') {
                    e.preventDefault();
                    const next = Math.max(zoom - 0.05, 0.5)
                    updateScaling(next)
                }
                else if (e.key === '0') { e.preventDefault(); handleResize() }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', handleResize)
        handleResize() // Initial call

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', handleResize)
        }
    }, [zoom])

    // --- Data Initialization ---
    const fetchStats = async () => {
        if (!electron) return
        const gameStats = await electron.invoke('get-game-stats')
        setStats(gameStats)
    }

    // --- Data Initialization ---
    useEffect(() => {
        if (!electron) return
        const init = async () => {
            // Backgrounds
            const bgs = await electron.invoke('get-backgrounds')
            if (bgs && bgs.length > 0) {
                setBackgrounds(bgs)
                setCurrentBgIndex(Math.floor(Math.random() * bgs.length))
            }

            // Paths
            const exePath = await electron.invoke('get-config', 'ruta_exe')
            const songsPath = await electron.invoke('get-config', 'ruta_songs')

            setPaths({
                game: exePath || 'No seleccionado',
                songs: songsPath || 'No seleccionado'
            })

            // Library
            const lib = await electron.invoke('scan-library')
            setLocalLibrary(lib || [])

            const master = await electron.invoke('get-master-library')
            setMasterLibrary(master || [])

            // Check for updates
            await checkForUpdates()

            fetchStats()
        }
        init()
    }, [])

    // Check for missing/new songs
    const checkForUpdates = async () => {
        if (!electron) return
        console.log('[SYNC] Checking for updates...')
        const toSync = await electron.invoke('get-songs-to-sync')
        console.log('[SYNC] Songs to sync:', toSync?.length || 0, toSync)
        setSongsToSync(toSync || [])
        const hasChanges = (toSync || []).length > 0
        console.log('[SYNC] Has updates:', hasChanges)
        setHasUpdates(hasChanges)
    }

    // Refresh stats when entering the tab
    useEffect(() => {
        if (activeTab === 'stats') fetchStats()
    }, [activeTab])

    // --- Dashboard Carousel ---
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentDashboardSlide(prev => (prev + 1) % 4)
        }, 5000)
        return () => clearInterval(interval)
    }, [])

    // --- Background Carousel ---
    const backgroundsLengthRef = useRef(backgrounds.length)

    useEffect(() => {
        backgroundsLengthRef.current = backgrounds.length
    }, [backgrounds.length])

    useEffect(() => {
        if (backgrounds.length <= 1) return

        const interval = setInterval(() => {
            setCurrentBgIndex(prev => (prev + 1) % backgroundsLengthRef.current)
        }, 7000) // Change background every 7 seconds

        return () => clearInterval(interval)
    }, []) // Empty dependency array - only runs once on mount


    const lastDownloadUpdateRef = useRef<number>(0)

    // Listen for download progress
    useEffect(() => {
        if (!electron) return

        const handleDownloadProgress = (_event: any, data: { progress: number, speed: string } | number) => {
            const now = Date.now()
            // Support both old (number) and new (object) formats during transition
            const progress = typeof data === 'number' ? data : data.progress
            const speed = typeof data === 'object' ? data.speed : null

            // Throttle UI updates to once every 100ms for performance
            if (now - lastDownloadUpdateRef.current < 100 && progress < 1) return
            lastDownloadUpdateRef.current = now

            // progress is 0 to 1
            const elapsed = (now - downloadStartTimeRef.current) / 1000 // seconds

            let eta = '--:--'
            if (progress > 0.01 && elapsed > 1) {
                const totalTime = elapsed / progress
                const remaining = totalTime - elapsed
                if (remaining < 60) eta = `${Math.ceil(remaining)}s`
                else eta = `${Math.ceil(remaining / 60)}m ${Math.ceil(remaining % 60)}s`
            }

            setDownloadStats({ progress, eta, speed: speed || undefined })
        }

        electron.on('download-progress', handleDownloadProgress)

        return () => {
            electron.off('download-progress', handleDownloadProgress)
        }
    }, [electron])

    // Background Carousel
    useEffect(() => {
        if (backgrounds.length > 1) {
            const interval = setInterval(() => {
                setCurrentBgIndex((prev) => (prev + 1) % backgrounds.length)
            }, 12000)
            return () => clearInterval(interval)
        }
    }, [backgrounds])

    const fetchPatchNotes = async () => {
        if (!electron) return
        const notes = await electron.invoke('get-patch-notes')
        setPatchNotes(notes)
    }

    const handlePlay = () => electron?.invoke('launch-game')

    const [audioElements, setAudioElements] = useState<HTMLAudioElement[]>([])

    const playNextByArtist = (current: Song) => {
        if (!current.artist || current.artist === 'Unknown Artist') {
            setPlayingAudio(null)
            setCurrentSong(null)
            setAudioElements([])
            return
        }

        // Filter songs by same artist and sort alphabetically by name (or path)
        const artistSongs = localLibrary
            .filter(s => s.artist === current.artist)
            .sort((a, b) => a.name.localeCompare(b.name))

        if (artistSongs.length <= 1) {
            setPlayingAudio(null)
            setCurrentSong(null)
            setAudioElements([])
            return
        }

        const currentIndex = artistSongs.findIndex(s => s.path === current.path)
        const nextIndex = (currentIndex + 1) % artistSongs.length
        const nextSong = artistSongs[nextIndex]

        console.log(`[AutoPlay] Playing next: ${nextSong.name} by ${nextSong.artist}`)
        toggleAudio(nextSong)
    }

    const toggleAudio = (song: Song) => {
        // Stop current playback
        if (playingAudio === song.audio) {
            audioElements.forEach(audio => {
                audio.pause()
                audio.currentTime = 0
            })
            setAudioElements([])
            setPlayingAudio(null)
            setCurrentSong(null)
            return
        }

        // Stop any previous playback
        audioElements.forEach(audio => {
            audio.pause()
            audio.currentTime = 0
        })
        setAudioElements([])

        // Check for multi-track stems
        const sources = song.audioStems && song.audioStems.length > 0
            ? song.audioStems
            : (song.audio ? [song.audio] : [])

        if (sources.length === 0) return

        // Create and play new audio elements
        const newAudioElements = sources.map((src: string) => {
            const audio = new Audio(src)
            audio.volume = 0.5 // Default volume balance
            return audio
        })

        newAudioElements.forEach(audio => audio.play())

        setAudioElements(newAudioElements)
        setPlayingAudio(song.audio) // Keep tracking main ID
        setCurrentSong(song)

        // When the first track ends, trigger auto-play
        if (newAudioElements.length > 0) {
            newAudioElements[0].onended = () => {
                playNextByArtist(song)
            }
        }
    }

    const handlePathSelect = async (type: 'game' | 'songs') => {
        const method = type === 'game' ? 'select-file' : 'select-folder'
        const result = await electron.invoke(method)
        if (result) {
            setPaths(prev => ({ ...prev, [type]: result }))
            const key = type === 'game' ? 'ruta_exe' : 'ruta_songs'
            await electron.invoke('save-config', { key, value: result })
            if (type === 'songs') {
                const lib = await electron.invoke('scan-library')
                setLocalLibrary(lib || [])
            }
        }
    }

    const handleLibraryScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
        if (scrollHeight - scrollTop <= clientHeight + 500) {
            setVisibleCount(prev => prev + 40)
        }
    }

    const displaySongs = useMemo(() => {
        let list = []
        if (libraryFilter === 'TODOS') {
            const localPaths = new Set(localLibrary.map(s => s.rel_path))
            list = [
                ...localLibrary,
                ...masterLibrary.filter(m => !localPaths.has(m.path))
            ]
        } else if (libraryFilter === 'LOCALES') {
            list = localLibrary
        } else {
            list = masterLibrary
        }

        if (librarySearch) {
            const q = librarySearch.toLowerCase()
            list = list.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.rel_path?.toLowerCase().includes(q)
            )
        }

        return [...list].sort((a, b) => a.name.localeCompare(b.name))
    }, [localLibrary, masterLibrary, libraryFilter, librarySearch])

    useEffect(() => {
        setVisibleCount(60)
    }, [libraryFilter, librarySearch])

    const handlePathClear = async (type: 'game' | 'songs') => {
        if (!confirm('¿Seguro que quieres borrar esta ruta?')) return

        setPaths(prev => ({ ...prev, [type]: 'No configurado' }))
        const key = type === 'game' ? 'ruta_exe' : 'ruta_songs'
        await electron.invoke('save-config', { key, value: '' })

        if (type === 'songs') {
            setLocalLibrary([])
        }
    }

    const handleSyncClick = async () => {
        if (isScanning) return

        if (!paths.songs || paths.songs === 'No configurado') {
            alert('Configura la ruta de canciones primero.')
            setActiveTab('settings')
            return
        }

        setIsScanning(true)
        // Widget now handles the scanning text dynamically, so we can set a base state here or just rely on isScanning flag
        setStatus({ title: 'VERIFICANDO', sub: 'Calculando diferencias...', color: '#c8aa6e' })

        try {
            const results = await electron.invoke('get-songs-to-sync')

            // If local library is empty (e.g. after cache clear), ensure we scan it too
            if (localLibrary.length === 0) {
                const lib = await electron.invoke('scan-library')
                setLocalLibrary(lib || [])
            }

            setIsScanning(false)
            if (results && results.length > 0) {
                setSongsToSync(results)
                setHasUpdates(true)
                setStatus({ title: 'ACTUALIZACIÓN', sub: `${results.length} nuevas canciones`, color: '#c8aa6e' })
            } else {
                setHasUpdates(false)
                setStatus({ title: 'ONLINE', sub: 'Todo sincronizado', color: '#30d158' })
            }
        } catch (error: any) {
            setIsScanning(false)
            console.error('Error scanning:', error)
            alert(`Error al escanear: ${error.message || 'Error desconocido'}`)
            setStatus({ title: 'ERROR', sub: 'Fallo al verificar', color: '#ff4d4d' })
        }
    }

    const handleDashboardSyncAction = async () => {
        if (!electron) return

        // If path not configured, navigate to settings
        if (!paths.songs || paths.songs === 'No configurado') {
            setActiveTab('settings')
            return
        }

        // If already scanning, do nothing
        if (isScanning) return

        // If has updates, navigate to updates tab
        if (hasUpdates) {
            setActiveTab('updates')
            return
        }

        // Force scan
        setIsScanning(true)
        try {
            const lib = await electron.invoke('scan-library', true) // force = true
            setLocalLibrary(lib || [])
            await fetchStats()
            await checkForUpdates() // Check if there are missing songs
        } catch (error: any) {
            console.error('[ERROR] Force scan failed:', error)
        }
        setIsScanning(false)
    }

    const startDownload = async () => {
        const selected = songsToSync.filter((_, idx) => selectedSongs[idx])
        if (selected.length === 0) return

        setIsDownloading(true)
        downloadStartTimeRef.current = Date.now()
        setDownloadStats({ progress: 0, eta: 'CALCULANDO...' })
        // setActivePage('downloading') // REMOVED: Stay on selection or home context

        try {
            // Mocking progress for now since IPC event handles the real update, 
            // but we need to listen to it.
            // The IPC listener 'download-progress' needs to be set up in useEffect, 
            // but for now we'll rely on the existing IPC handler if it exists or add it.

            const result = await electron.invoke('confirm-download', selected, downloadWithVideo)

            if (result.success) {
                // Download completed successfully
                setIsDownloading(false)
                setActiveTab('home')
                setActivePage('home')
                setHasUpdates(false)
                setSongsToSync([])
                setStatus({ title: 'ACTUALIZADO', sub: 'Descarga completada.', color: '#2f80ed' })

                // Refresh library
                const lib = await electron.invoke('get-master-library')
                setMasterLibrary(lib)
            } else {
                // Download failed
                setIsDownloading(false)
                setActiveTab('updates')
                alert(`Error en la descarga: ${result.error}`)
            }
        } catch (error: any) {
            setIsDownloading(false)
            setActiveTab('updates')
            alert(`Error: ${error.message}`)
        }
    }

    const toggleSyncSong = (idx: number) => {
        setSelectedSongs(prev => ({ ...prev, [idx]: !prev[idx] }))
    }

    const navItems = [
        { id: 'home', icon: Home, label: 'Inicio' },
        { id: 'songs', icon: Layers, label: 'Biblioteca' },
        { id: 'updates', icon: Download, label: 'Actualizaciones' },
        { id: 'stats', icon: Activity, label: 'Estadísticas' },
        { id: 'settings', icon: Settings, label: 'Ajustes' },
    ]

    return (
        <div
            className="flex h-[720px] w-[1280px] overflow-hidden bg-[#010a13] text-[#f0e6d2] font-sans border border-[#c8aa6e]/20 relative select-none cursor-default origin-top-left"
            style={{
                transform: `scale(${zoom})`,
                width: '1280px',
                height: '720px'
            }}
        >
            {/* Global Drag Region (Top Bar) - Starts after sidebar */}
            <div className="absolute top-0 left-[90px] right-0 h-8 z-[9000] drag" />

            {/* Dynamic Island Audio Player - REMOVED (Merged into Central Hub) */}

            {/* Sidebar (No Drag Logic Here) */}
            <aside className="w-[90px] bg-[#010101]/80 h-full flex flex-col items-center py-8 z-50 border-r border-[#c8aa6e]/10 backdrop-blur-xl relative">

                <div className="w-12 h-12 mb-10 flex items-center justify-center text-[#c8aa6e] drop-shadow-[0_0_15px_#c8aa6e] relative z-10 no-drag">
                    <Disc2 size={32} />
                </div>
                <nav className="flex flex-col gap-6 relative z-10 no-drag">
                    {[
                        { id: 'home', icon: Home, label: 'Inicio' },
                        { id: 'songs', icon: Layers, label: 'Biblioteca' },
                        { id: 'updates', icon: RefreshCw, label: 'Actualizaciones' },
                        { id: 'stats', icon: Activity, label: 'Estadísticas' },
                        { id: 'settings', icon: Settings, label: 'Ajustes' },
                    ].map((item) => (
                        <div
                            key={item.id}
                            className={`w-12 h-12 flex items-center justify-center cursor-pointer rounded-full border-2 border-transparent transition-all group relative pointer-events-auto no-drag
                                ${activeTab === item.id ? 'text-[#c8aa6e] border-[#c8aa6e]/30 bg-[#c8aa6e]/10 shadow-[0_0_30px_rgba(200,170,110,0.2)]' : 'text-[#a09b8c] hover:text-white hover:border-white/10'}
                            `}
                            onClick={() => {
                                setActiveTab(item.id);
                                setActivePage('home');
                                if (item.id === 'home') setSubPage('INICIO');
                            }}
                        >
                            <item.icon size={22} className={activeTab === item.id ? 'drop-shadow-[0_0_10px_#c8aa6e]' : ''} />
                            {activeTab === item.id && (
                                <motion.div layoutId="nav-glow" className="absolute -left-3 w-1.5 h-6 bg-[#c8aa6e] rounded-r shadow-[0_0_20px_#c8aa6e]" />
                            )}
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Area */}
            <main className="flex-1 relative flex flex-col overflow-hidden">
                {/* Visual Background layers */}
                <AnimatePresence mode="wait">
                    {backgrounds.length > 0 && (
                        <motion.div
                            key={currentBgIndex}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 2 }}
                            className="absolute inset-0 bg-cover bg-center z-0 filter brightness-40 contrast-125 scale-110"
                            style={{ backgroundImage: `url("${backgrounds[currentBgIndex]}")` }}
                        />
                    )}
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#010a13]/50 to-[#010a13] z-[1]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(200,170,110,0.05)_0%,transparent_100%)] z-[1]" />

                {/* Riot Overlay Shaders */}
                <div className="absolute inset-0 pointer-events-none z-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />

                {/* Unified Dynamic Island - Central Hub */}
                <div className="fixed top-6 left-[70%] -translate-x-1/2 z-[9600] flex items-center justify-center pointer-events-none">
                    <AnimatePresence mode="popLayout">
                        {(!paths.songs || paths.songs === 'No configurado') ? (
                            <motion.div
                                layoutId="unified-island"
                                key="island-config"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                className="h-12 bg-[#0c0c0c] backdrop-blur-xl border border-red-500/20 rounded-full flex items-center px-6 gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto cursor-pointer group hover:border-red-500/50"
                                onClick={() => setActiveTab('settings')}
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                <motion.span layout="position" className="text-white text-[11px] font-black tracking-[2px] uppercase group-hover:text-red-400 transition-colors whitespace-nowrap">Sin Configurar</motion.span>
                            </motion.div>
                        ) : isScanning ? (
                            <motion.div
                                layoutId="unified-island"
                                key="island-scanning"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                className="h-12 bg-[#0c0c0c] backdrop-blur-xl border border-[#c8aa6e]/20 rounded-full flex items-center px-6 gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto overflow-hidden"
                            >
                                <motion.div layout="position" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                                    <RefreshCw size={16} className="text-[#c8aa6e]" />
                                </motion.div>
                                <motion.div layout="position" className="flex flex-col leading-none justify-center -space-y-0.5 min-w-[100px]">
                                    <span className="text-[#c8aa6e] text-[11px] font-black tracking-[2px] uppercase whitespace-nowrap">Verificando</span>
                                </motion.div>
                            </motion.div>
                        ) : isDownloading ? (
                            <motion.div
                                layoutId="unified-island"
                                key="island-downloading"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                className="h-12 bg-[#0c0c0c] backdrop-blur-xl border border-[#3b82f6]/20 rounded-full flex items-center px-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto overflow-hidden w-[320px]"
                            >
                                <motion.div layout="position" className="w-8 h-8 rounded-full bg-[#3b82f6]/10 flex items-center justify-center mr-3 shrink-0">
                                    <Download size={14} className="text-[#3b82f6] animate-bounce" />
                                </motion.div>
                                <motion.div layout="position" className="flex-1 min-w-0 pr-4 py-1">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[#3b82f6] text-[9px] font-black tracking-[2px] uppercase whitespace-nowrap">Descargando</span>
                                        <span className="text-white text-[9px] font-mono font-bold">{Math.floor(downloadStats.progress * 100)}%</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div className="h-full bg-[#3b82f6] shadow-[0_0_10px_#3b82f6]" initial={{ width: 0 }} animate={{ width: `${downloadStats.progress * 100}%` }} />
                                    </div>
                                    <div className="flex justify-between mt-1 text-[8px] text-[#a09b8c] font-mono font-bold uppercase tracking-wider">
                                        <span>{downloadStats.speed}</span>
                                        <span>ETA: {downloadStats.eta}</span>
                                    </div>
                                </motion.div>
                            </motion.div>
                        ) : hasUpdates ? (
                            <motion.div
                                layoutId="unified-island"
                                key="island-updates"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                className="h-12 bg-[#0c0c0c] backdrop-blur-xl border border-[#30d158]/20 rounded-full flex items-center px-6 gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto cursor-pointer group hover:border-[#30d158]/50"
                                onClick={handleDashboardSyncAction}
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#30d158]/50 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#30d158]"></span>
                                </span>
                                <motion.span layout="position" className="text-white text-[11px] font-black tracking-[2px] uppercase group-hover:text-[#30d158] transition-colors whitespace-nowrap">Actualización Disponible</motion.span>
                            </motion.div>
                        ) : playingAudio ? (
                            <motion.div
                                layoutId="unified-island"
                                key="island-player"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                className="h-12 bg-[#0c0c0c]/90 border border-[#c8aa6e]/40 rounded-full backdrop-blur-2xl flex items-center pl-2 pr-2 gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)] pointer-events-auto cursor-pointer hover:border-[#c8aa6e]"
                                onClick={() => setActiveTab('songs')}
                            >
                                <motion.div layout="position" className="w-8 h-8 rounded-full overflow-hidden border border-[#c8aa6e]/30 shrink-0">
                                    {currentSong?.cover ? <img src={currentSong.cover} className="w-full h-full object-cover" /> : <Music size={14} className="m-auto mt-2" />}
                                </motion.div>
                                <motion.div layout="position" className="flex flex-col w-[140px] overflow-hidden">
                                    <div className="marquee-container text-[10px] font-black italic text-white leading-tight uppercase tracking-widest">
                                        <span className="marquee">{currentSong?.name || 'Reproduciendo...'} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {currentSong?.name || 'Reproduciendo...'}</span>
                                    </div>
                                    <div className="text-[8px] font-bold text-[#c8aa6e] tracking-widest uppercase opacity-70 truncate mask-linear-fade">{currentSong?.artist || 'Desconocido'}</div>
                                </motion.div>
                                <motion.button
                                    layout="position"
                                    className="w-8 h-8 rounded-full bg-[#c8aa6e]/10 flex items-center justify-center text-[#c8aa6e] hover:bg-[#c8aa6e] hover:text-[#010a13] transition-all ml-4"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAudio(currentSong!);
                                    }}
                                >
                                    <Pause size={14} fill="currentColor" />
                                </motion.button>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>

                {/* Window Controls - Fixed at top */}
                <div className="fixed top-4 right-4 flex gap-2 z-[10000]" style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as any}>
                    <button
                        onClick={() => (window as any).ipcRenderer?.send('window-controls', 'minimize')}
                        className="w-8 h-8 rounded flex items-center justify-center hover:bg-white/10 transition-colors bg-black/5 backdrop-blur-sm border border-white/5"
                    >
                        <Minus size={16} className="text-[#a09b8c]" />
                    </button>
                    <button
                        onClick={() => (window as any).ipcRenderer?.send('window-controls', 'close')}
                        className="w-8 h-8 rounded flex items-center justify-center hover:bg-red-500/30 transition-colors group bg-black/5 backdrop-blur-sm border border-white/5"
                    >
                        <X size={16} className="text-[#a09b8c] group-hover:text-red-500" />
                    </button>
                </div>

                {/* Content Container */}
                <div className="relative z-[9100] flex-1 flex flex-col min-h-0 overflow-hidden">

                    {/* Global Header - Visible only on Home tab */}
                    {activeTab === 'home' && (
                        <header className="absolute top-0 left-0 right-0 h-24 flex items-center justify-between px-12 z-[9500] bg-gradient-to-b from-black/40 to-transparent">
                            <div className="flex gap-10 h-full items-center pt-4 no-drag pointer-events-auto">
                                {['INICIO', 'NOTAS DEL PARCHE', 'SOCIAL'].map(tab => {
                                    const isNotas = tab === 'NOTAS DEL PARCHE';
                                    const isSelected = isNotas ? (subPage === 'NOTAS' || subPage === tab) : (subPage === tab);

                                    return (
                                        <div
                                            key={tab}
                                            className={`text-[11px] font-black tracking-[4px] cursor-pointer transition-all relative flex items-center h-full no-drag
                                                ${isSelected ? 'text-[#c8aa6e]' : 'text-[#a09b8c] hover:text-white'}
                                            `}
                                            onClick={() => {
                                                if (isNotas) {
                                                    setSubPage('NOTAS');
                                                    setActivePage('notas');
                                                    fetchPatchNotes();
                                                } else {
                                                    setSubPage(tab);
                                                    setActivePage('home');
                                                }
                                            }}
                                        >
                                            {tab}
                                            {isSelected && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c8aa6e] shadow-[0_0_10px_#c8aa6e]" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </header>
                    )}

                    {/* Viewport content */}
                    <AnimatePresence mode="wait">
                        {activeTab === 'home' && activePage === 'home' && subPage === 'INICIO' && (
                            <motion.div
                                key="home-dashboard"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="flex-1 px-16 pb-16 pt-32 flex flex-col"
                            >
                                <div className="mb-8">
                                    <div className="text-xs font-black text-[#c8aa6e] tracking-[6px] uppercase mb-3 opacity-80">Sincronización de Élite</div>
                                    <h1 className="text-[90px] font-black italic tracking-tighter text-white leading-[0.85] scale-y-95 drop-shadow-[0_20px_60px_rgba(0,0,0,0.9)]">WAZA<br />HERO</h1>
                                    <p className="text-[#a09b8c] text-sm tracking-[4px] uppercase mt-4 max-w-sm font-bold opacity-60">Launcher definitivo para Clone Hero Evolution.</p>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(240,230,210,0.4)' }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handlePlay}
                                    className="w-fit px-16 py-4 bg-[#f0e6d2] text-[#01141e] font-black text-lg tracking-[4px] rounded-full shadow-2xl flex items-center gap-4 group"
                                >
                                    <Play size={20} fill="currentColor" className="group-hover:scale-110 transition-transform" /> JUGAR
                                </motion.button>

                                <div className="flex gap-8 mt-16">
                                    {/* Card 1: Quick Stats (Animated Carousel) */}
                                    <div className="bg-[#010101]/60 border border-white/5 rounded-xl backdrop-blur-md flex-1 h-48 flex flex-col group hover:border-[#c8aa6e]/30 transition-all relative overflow-hidden">
                                        <div className="p-6 h-full flex flex-col">
                                            <div className="text-[10px] font-black text-[#a09b8c] tracking-[2px] mb-4 uppercase italic flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#c8aa6e]" />
                                                Estadísticas Rápidas
                                            </div>

                                            <div className="flex-1 flex flex-col justify-center relative">
                                                <AnimatePresence mode="wait">
                                                    {currentDashboardSlide === 0 && (
                                                        <motion.div
                                                            key="slide-total"
                                                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <div className="text-5xl font-black text-white leading-none">{stats.total_songs}</div>
                                                                <div className="text-[10px] font-bold text-[#c8aa6e] mt-2 tracking-[3px] uppercase">CANCIONES INSTALADAS</div>
                                                            </div>
                                                            <Music size={64} className="text-white/10 absolute right-0" />
                                                        </motion.div>
                                                    )}
                                                    {currentDashboardSlide === 1 && (
                                                        <motion.div
                                                            key="slide-integrity"
                                                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <div className="text-5xl font-black text-[#30d158] leading-none">{Math.floor(stats.detailed?.integrity || 100)}%</div>
                                                                <div className="text-[10px] font-bold text-[#a09b8c] mt-2 tracking-[3px] uppercase">INTEGRIDAD DEL NÚCLEO</div>
                                                            </div>
                                                            <ShieldCheck size={64} className="text-white/10 absolute right-0" />
                                                        </motion.div>
                                                    )}
                                                    {currentDashboardSlide === 2 && (
                                                        <motion.div
                                                            key="slide-storage"
                                                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <div className="text-5xl font-black text-white leading-none">{Math.floor((stats.detailed?.totalSize || 0) / (1024 * 1024 * 1024))} <span className="text-xl">GB</span></div>
                                                                <div className="text-[10px] font-bold text-[#a09b8c] mt-2 tracking-[3px] uppercase">ESPACIO EN DISCO</div>
                                                            </div>
                                                            <HardDrive size={64} className="text-white/10 absolute right-0" />
                                                        </motion.div>
                                                    )}
                                                    {currentDashboardSlide === 3 && (
                                                        <motion.div
                                                            key="slide-top"
                                                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div className="max-w-[80%]">
                                                                <div className="text-2xl font-black text-white truncate uppercase italic leading-tight">{stats.detailed?.topArtists?.[0]?.name || '---'}</div>
                                                                <div className="text-[10px] font-bold text-[#c8aa6e] mt-2 tracking-[3px] uppercase">ARTISTA MÁS POPULAR</div>
                                                            </div>
                                                            <User size={64} className="text-white/10 absolute right-0" />
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <div className="flex gap-1.5 mt-auto pt-4 border-t border-white/5">
                                                {[0, 1, 2, 3].map(idx => (
                                                    <div
                                                        key={idx}
                                                        className={`h-1 rounded-full transition-all duration-500 ${currentDashboardSlide === idx ? 'w-6 bg-[#c8aa6e]' : 'w-1.5 bg-white/10'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card 2: Online Status */}
                                    <div className="bg-[#010101]/60 border border-white/5 rounded-xl backdrop-blur-md flex-1 h-48 flex flex-col group hover:border-[#c8aa6e]/30 transition-all relative overflow-hidden">
                                        {/* Status Glow */}
                                        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full blur-[60px] opacity-20 transition-all duration-1000"
                                            style={{ backgroundColor: isScanning ? '#c8aa6e' : (isDownloading ? '#3b82f6' : (hasUpdates ? '#30d158' : '#c8aa6e')) }}
                                        />

                                        <div className="p-6 h-full flex flex-col">
                                            <div className="text-[10px] font-black text-[#a09b8c] tracking-[2px] mb-4 uppercase italic flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isScanning ? '#c8aa6e' : (isDownloading ? '#3b82f6' : (hasUpdates ? '#30d158' : '#c8aa6e')) }} />
                                                Estado del Sistema
                                            </div>

                                            <div className="flex-1 flex flex-col justify-center relative">
                                                <AnimatePresence mode="wait">
                                                    {(!paths.songs || paths.songs === 'No configurado') ? (
                                                        <motion.div
                                                            key="config"
                                                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <div className="text-3xl font-black uppercase text-[#a09b8c]">SIN CONFIGURAR</div>
                                                                <div className="text-[10px] font-bold text-[#c8aa6e] mt-2 tracking-[3px] uppercase">SE REQUIERE ACCIÓN</div>
                                                            </div>
                                                            <Settings size={64} className="text-white/10 absolute right-0" />
                                                        </motion.div>
                                                    ) : isScanning ? (
                                                        <motion.div
                                                            key="scanning"
                                                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                                                            className="flex items-center gap-6 w-full"
                                                        >
                                                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
                                                                <RefreshCw size={48} className="text-[#c8aa6e] opacity-30" />
                                                            </motion.div>
                                                            <div>
                                                                <div className="text-4xl font-black text-[#c8aa6e] leading-none mb-2">VERIFICANDO</div>
                                                                <div className="text-[10px] font-bold text-[#a09b8c] tracking-[3px] uppercase">ESCANEANDO ARCHIVOS...</div>
                                                            </div>
                                                        </motion.div>
                                                    ) : isDownloading ? (
                                                        <motion.div
                                                            key="status-downloading"
                                                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <div className="text-4xl font-black uppercase text-[#3b82f6] leading-none">{Math.floor(downloadStats.progress * 100)}%</div>
                                                                <div className="text-[10px] font-bold text-[#3b82f6] mt-2 tracking-[3px] uppercase font-black flex items-center gap-2">
                                                                    DESCARGANDO • {downloadStats.speed || ''} • {downloadStats.eta}
                                                                </div>
                                                            </div>
                                                            <Download size={64} className="text-[#3b82f6]/20 absolute right-0" />
                                                        </motion.div>
                                                    ) : (
                                                        <motion.div
                                                            key="status"
                                                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                                            className="flex items-center justify-between"
                                                        >
                                                            <div>
                                                                <div className="text-4xl font-black uppercase leading-none" style={{ color: hasUpdates ? '#30d158' : '#c8aa6e' }}>
                                                                    {hasUpdates ? 'ACTUALIZAR' : 'COMPLETO'}
                                                                </div>
                                                                <div className="text-[10px] font-bold text-[#a09b8c] mt-2 tracking-[3px] uppercase">
                                                                    {hasUpdates ? 'VERSION DISPONIBLE' : 'LA BIBLIOTECA ESTÁ AL DÍA'}
                                                                </div>
                                                            </div>
                                                            <Globe size={64} className="text-white/10 absolute right-0" />
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <div className="pt-4 border-t border-white/5 flex justify-between items-center mt-auto">
                                                <div className="text-[10px] font-black text-[#c8aa6e] tracking-[2px] cursor-pointer hover:text-white transition-all uppercase flex items-center gap-2 group/btn" onClick={handleDashboardSyncAction}>
                                                    <span className="w-4 h-[1px] bg-[#c8aa6e] group-hover/btn:w-8 transition-all" />
                                                    {(!paths.songs || paths.songs === 'No configurado') ? 'CONFIGURAR RUTA' : (isScanning ? 'ESTADO: OCUPADO' : (hasUpdates ? 'ACTUALIZAR AHORA' : 'FORZAR ESCANEO'))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'home' && activePage === 'home' && subPage === 'SOCIAL' && (
                            <motion.div
                                key="social-hub"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="flex-1 px-16 pb-16 pt-32 flex flex-col overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                                    <div>
                                        <h1 className="text-4xl font-black italic text-white tracking-widest uppercase">CENTRO SOCIAL</h1>
                                        <p className="text-[#c8aa6e] font-black tracking-[4px] text-xs mt-2 opacity-80 uppercase">Conecta con la comunidad de Waza Hero</p>
                                    </div>
                                </div>

                                <div className="flex-1 rounded-2xl border border-white/5 bg-[#010101]/40 relative overflow-hidden flex items-center justify-center">
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#c8aa6e]/5 to-transparent backdrop-blur-[2px]" />
                                    <div className="relative text-center p-12 backdrop-blur-md bg-black/40 rounded-3xl border border-white/10 shadow-2xl">
                                        <div className="text-6xl mb-6 opacity-20">📡</div>
                                        <h2 className="text-3xl font-black italic tracking-[10px] text-white uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">PRÓXIMAMENTE</h2>
                                        <div className="w-16 h-1 bg-[#c8aa6e] mx-auto mt-6 mb-4 shadow-[0_0_15px_#c8aa6e]" />
                                        <p className="text-[#a09b8c] font-black tracking-[3px] text-[10px] uppercase opacity-60">Estamos construyendo la mayor red de charts del mundo</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'songs' && (
                            <motion.div
                                key="songs-library"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="flex-1 px-16 pb-16 pt-12 flex flex-col overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                                    <div>
                                        <h1 className="text-4xl font-black italic text-white tracking-widest uppercase">BIBLIOTECA DE CHARTS</h1>
                                        <p className="text-[#c8aa6e] font-black tracking-[4px] text-xs mt-2 opacity-80 uppercase">
                                            {libraryFilter === 'LOCALES' ? 'Gestiona tu colección local' :
                                                libraryFilter === 'NUBE' ? 'Contenido disponible en el servidor' :
                                                    'Explora toda la colección disponible'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-8 bg-[#010101]/20 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex gap-6">
                                        {['LOCALES', 'NUBE', 'TODOS'].map(f => (
                                            <div key={f} className={`text-[11px] font-black tracking-[3px] cursor-pointer transition-all ${libraryFilter === f ? 'text-[#c8aa6e]' : 'text-[#a09b8c] hover:text-white'}`} onClick={() => setLibraryFilter(f)}>
                                                {f}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            placeholder="BUSCAR CHART..."
                                            value={librarySearch}
                                            onChange={(e) => setLibrarySearch(e.target.value)}
                                            className="bg-black/40 border border-white/5 rounded px-4 py-2 text-[10px] font-black tracking-[2px] w-64 focus:outline-none focus:border-[#c8aa6e]/50 transition-all text-white placeholder:text-[#a09b8c]/40 select-text no-drag cursor-text"
                                        />
                                    </div>
                                </div>

                                <div
                                    className="flex-1 min-h-0 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] auto-rows-min gap-8 overflow-y-auto pr-4 custom-scroll pb-20 will-change-scroll"
                                    style={{ contain: 'content' }}
                                    onScroll={handleLibraryScroll}
                                >
                                    {displaySongs.length > 0 ? (
                                        displaySongs.slice(0, visibleCount).map((song: Song, i: number) => (
                                            <motion.div
                                                key={`${song.rel_path}-${i}`}
                                                whileHover={!song.is_master ? { y: -5 } : {}}
                                                className={`bg-[#010101]/60 border border-white/5 rounded-xl overflow-hidden group transition-all relative shadow-xl flex flex-col ${song.is_master ? 'opacity-60 grayscale' : 'hover:border-[#c8aa6e]/30'}`}
                                            >
                                                <div className="h-44 bg-[#0c1218] flex items-center justify-center overflow-hidden relative">
                                                    {song.cover ? (
                                                        <img
                                                            src={song.cover}
                                                            loading="lazy"
                                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80 group-hover:opacity-100"
                                                        />
                                                    ) : (
                                                        <Music size={40} className="text-[#c8aa6e]/20" />
                                                    )}
                                                    {!song.is_master && (
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                                            {song.audio && (
                                                                <div
                                                                    className="w-14 h-14 rounded-full bg-[#c8aa6e] flex items-center justify-center text-[#01141e] cursor-pointer hover:scale-110 transition-all shadow-[0_0_30px_#c8aa6e]"
                                                                    onClick={() => toggleAudio(song)}
                                                                >
                                                                    {playingAudio === song.audio ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {song.is_master && (
                                                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-[#c8aa6e]/20 text-[#c8aa6e] text-[8px] font-black rounded uppercase">Nube</div>
                                                    )}
                                                </div>
                                                <div className="p-5 bg-gradient-to-t from-black/80 to-transparent">
                                                    <div className="font-black text-[14px] text-white truncate uppercase tracking-tight">{song.name}</div>
                                                    <div className="text-[10px] font-bold text-[#a09b8c] truncate mt-1 opacity-60 tracking-wider font-mono">
                                                        {song.is_master ? 'DISPONIBLE EN LA NUBE' : `LOCAL / ${song.rel_path}`}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))
                                    ) : (
                                        <div className="col-span-full text-center py-40 opacity-30 flex flex-col items-center gap-4">
                                            <Disc size={64} strokeWidth={1} />
                                            <p className="font-black tracking-[4px]">BIBLIOTECA VACÍA</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'home' && activePage === 'notas' && (
                            <motion.div
                                key="notas"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="flex-1 px-16 pb-16 pt-32 overflow-y-auto custom-scroll"
                            >
                                <div>
                                    <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                                        <div>
                                            <h1 className="text-4xl font-black italic text-white tracking-widest uppercase">NOTAS DEL PARCHE {patchNotes.version}</h1>
                                            <p className="text-[#c8aa6e] font-black tracking-[4px] text-xs mt-2 opacity-80 uppercase">{patchNotes.date}</p>
                                        </div>
                                    </div>
                                    <div className="bg-[#010101]/60 border border-white/5 p-10 rounded-2xl backdrop-blur-md prose prose-invert max-w-none prose-headings:italic prose-headings:font-black prose-headings:tracking-widest prose-p:text-[#a09b8c] prose-p:font-bold prose-p:tracking-wider">
                                        <div dangerouslySetInnerHTML={{ __html: patchNotes.body }} />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'stats' && (
                            <motion.div
                                key="stats-page"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="flex-1 px-16 pb-16 pt-12 flex flex-col overflow-y-auto custom-scroll"
                            >
                                <div className="max-w-6xl mx-auto w-full">
                                    <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                                        <div>
                                            <h1 className="text-4xl font-black italic text-white tracking-widest uppercase">ESTADÍSTICAS DEL NÚCLEO</h1>
                                            <p className="text-[#c8aa6e] font-black tracking-[4px] text-xs mt-2 opacity-80 uppercase">Análisis avanzado de tu biblioteca de charts</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-end mb-8">
                                        <div className="text-right bg-[#010101]/40 border border-white/5 px-6 py-2 rounded-lg backdrop-blur-sm">
                                            <span className="text-[10px] font-bold text-[#a09b8c] tracking-[2px] uppercase opacity-50 mr-4">Sincronizado el</span>
                                            <span className="text-xs font-black text-white italic tracking-wider uppercase">{stats.last_sync}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-8 mb-16">
                                        {/* Main Cards */}
                                        <div className="bg-[#010101]/60 border border-white/5 p-10 rounded-2xl backdrop-blur-md relative overflow-hidden group hover:border-[#c8aa6e]/30 transition-all">
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-all">
                                                <Layers size={80} />
                                            </div>
                                            <div className="text-[10px] font-black text-[#c8aa6e] tracking-[4px] mb-6 uppercase italic">Canciones</div>
                                            <div className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">{stats.total_songs}</div>
                                            <div className="w-full h-1 bg-white/5 rounded-full mt-10 flex overflow-hidden">
                                                <div className="h-full bg-[#c8aa6e] shadow-[0_0_10px_#c8aa6e]" style={{ width: `${Math.min((stats.total_songs / 1500) * 100, 100)}%` }} />
                                            </div>
                                            <div className="text-[9px] font-bold text-[#a09b8c] mt-3 tracking-widest uppercase opacity-60">Objetivo: 1500 Charts</div>
                                        </div>

                                        <div className="bg-[#010101]/60 border border-white/5 p-10 rounded-2xl backdrop-blur-md relative overflow-hidden group hover:border-[#c8aa6e]/30 transition-all">
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-all">
                                                <Activity size={80} />
                                            </div>
                                            <div className="text-[10px] font-black text-[#c8aa6e] tracking-[4px] mb-6 uppercase italic">Integridad</div>
                                            <div className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">{Math.round(stats.detailed?.integrity || 0)}<span className="text-3xl">%</span></div>
                                            <div className="w-full h-1 bg-white/5 rounded-full mt-10 flex overflow-hidden">
                                                <div className="h-full bg-[#30d158] shadow-[0_0_10px_#30d158]" style={{ width: `${stats.detailed?.integrity || 0}%` }} />
                                            </div>
                                            <div className="text-[9px] font-bold text-[#a09b8c] mt-3 tracking-widest uppercase opacity-60">ESTADO: <span className={stats.detailed?.integrity > 95 ? 'text-[#30d158]' : 'text-[#c8aa6e]'}>{stats.detailed?.integrity > 95 ? 'NUCLEO ESTABLE' : 'ARCHIVOS PERDIDOS'}</span></div>
                                        </div>

                                        <div className="bg-[#010101]/60 border border-white/5 p-10 rounded-2xl backdrop-blur-md relative overflow-hidden group hover:border-[#c8aa6e]/30 transition-all">
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-all">
                                                <Disc2 size={80} />
                                            </div>
                                            <div className="text-[10px] font-black text-[#c8aa6e] tracking-[4px] mb-6 uppercase italic">Almacenamiento</div>
                                            <div className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                                                {stats.detailed?.totalSize > 1024 * 1024 * 1024
                                                    ? (stats.detailed.totalSize / (1024 * 1024 * 1024)).toFixed(1)
                                                    : (stats.detailed?.totalSize / (1024 * 1024)).toFixed(0)}
                                                <span className="text-3xl">{stats.detailed?.totalSize > 1024 * 1024 * 1024 ? 'GB' : 'MB'}</span>
                                            </div>
                                            <div className="w-full h-1 bg-white/5 rounded-full mt-10 flex overflow-hidden">
                                                <div className="h-full bg-[#c8aa6e] shadow-[0_0_10px_#c8aa6e]" style={{ width: '40%' }} />
                                            </div>
                                            <div className="text-[9px] font-bold text-[#a09b8c] mt-3 tracking-widest uppercase opacity-60">Uso estimado del volumen</div>
                                        </div>
                                    </div>

                                    {/* Distribution Sections */}
                                    <div className="grid grid-cols-2 gap-12">
                                        <div className="bg-[#010101]/40 border border-white/5 p-8 rounded-2xl backdrop-blur-sm space-y-8 group hover:border-[#c8aa6e]/20 transition-all">
                                            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                                                <User size={18} className="text-[#c8aa6e]" />
                                                <h3 className="text-sm font-black tracking-[4px] uppercase italic text-white">TOP ARTISTAS</h3>
                                            </div>
                                            <div className="space-y-6">
                                                {stats.detailed?.topArtists?.map((artist: any, i: number) => (
                                                    <div key={i} className="group/item">
                                                        <div className="flex justify-between items-end mb-2">
                                                            <div className="text-[11px] font-black text-white tracking-widest uppercase truncate max-w-[200px] group-hover/item:text-[#c8aa6e] transition-colors">{artist.name}</div>
                                                            <div className="text-[10px] font-bold text-[#c8aa6e] font-mono">{artist.count} charts</div>
                                                        </div>
                                                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                className="h-full bg-gradient-to-r from-[#c8aa6e] to-[#f0e6d2] shadow-[0_0_5px_#c8aa6e]"
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${(artist.count / stats.detailed.topArtists[0].count) * 100}%` }}
                                                                transition={{ delay: i * 0.1, duration: 1 }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!stats.detailed?.topArtists || stats.detailed.topArtists.length === 0) && (
                                                    <div className="text-center py-10 opacity-20 italic text-xs tracking-widest uppercase">No hay metadatos disponibles</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-[#010101]/40 border border-white/5 p-8 rounded-2xl backdrop-blur-sm space-y-8 group hover:border-[#c8aa6e]/20 transition-all">
                                            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                                                <Layout size={18} className="text-[#c8aa6e]" />
                                                <h3 className="text-sm font-black tracking-[4px] uppercase italic text-white">TOP CHARTERS</h3>
                                            </div>
                                            <div className="space-y-6">
                                                {stats.detailed?.topCharters?.map((charter: any, i: number) => (
                                                    <div key={i} className="group/item">
                                                        <div className="flex justify-between items-end mb-2">
                                                            <div className="text-[11px] font-black text-white tracking-widest uppercase truncate max-w-[200px] group-hover/item:text-[#c8aa6e] transition-colors">{charter.name}</div>
                                                            <div className="text-[10px] font-bold text-[#c8aa6e] font-mono">{charter.count} charts</div>
                                                        </div>
                                                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                className="h-full bg-gradient-to-r from-[#c8aa6e] to-[#f0e6d2] shadow-[0_0_5px_#c8aa6e]"
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${(charter.count / stats.detailed.topCharters[0].count) * 100}%` }}
                                                                transition={{ delay: i * 0.1, duration: 1 }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!stats.detailed?.topCharters || stats.detailed.topCharters.length === 0) && (
                                                    <div className="text-center py-10 opacity-20 italic text-xs tracking-widest uppercase">No hay metadatos disponibles</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'settings' && (
                            <motion.div
                                key="settings-page"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 px-16 pb-16 pt-12 flex flex-col w-full"
                            >
                                <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                                    <div>
                                        <h1 className="text-4xl font-black italic text-white tracking-widest uppercase">AJUSTES DEL SISTEMA</h1>
                                        <p className="text-[#c8aa6e] font-black tracking-[4px] text-xs mt-2 opacity-80 uppercase">Configuración de directorios y mantenimiento del núcleo</p>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="bg-[#010101]/60 border border-white/5 p-8 rounded-2xl flex items-center justify-between group hover:border-[#c8aa6e]/20 transition-all">
                                        <div>
                                            <div className="text-white font-black tracking-widest text-sm mb-2 uppercase italic">Directorio del Juego</div>
                                            <div className="text-xs text-[#a09b8c] font-bold opacity-70">{paths.game}</div>
                                        </div>
                                        <button onClick={() => handlePathSelect('game')} className="px-8 py-3 bg-[#c8aa6e]/10 text-[#c8aa6e] text-[11px] font-black tracking-[3px] rounded-lg border border-[#c8aa6e]/20 hover:bg-[#c8aa6e] hover:text-[#010101] transition-all">CAMBIAR</button>
                                    </div>
                                    <div className="bg-[#010101]/60 border border-white/5 p-8 rounded-2xl flex items-center justify-between group hover:border-[#c8aa6e]/20 transition-all">
                                        <div>
                                            <div className="text-white font-black tracking-widest text-sm mb-2 uppercase italic">Ruta de Canciones</div>
                                            <div className="text-xs text-[#a09b8c] font-bold opacity-70">{paths.songs}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={async () => { if (confirm('¿Limpiar caché de biblioteca?')) { setIsScanning(true); const lib = await electron.invoke('scan-library', true); setLocalLibrary(lib || []); setIsScanning(false); alert('Caché regenerada y biblioteca actualizada.'); } }} className="px-6 py-3 bg-blue-500/10 text-blue-500 text-[11px] font-black tracking-[3px] rounded-lg border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all">LIMPIAR CACHÉ</button>
                                            <button onClick={() => handlePathSelect('songs')} className="px-8 py-3 bg-[#c8aa6e]/10 text-[#c8aa6e] text-[11px] font-black tracking-[3px] rounded-lg border border-[#c8aa6e]/20 hover:bg-[#c8aa6e] hover:text-[#010101] transition-all">CAMBIAR</button>
                                        </div>
                                    </div>

                                    <div className="bg-[#010101]/60 border border-white/5 p-8 rounded-2xl flex items-center justify-between group hover:border-[#c8aa6e]/20 transition-all">
                                        <div>
                                            <div className="text-white font-black tracking-widest text-sm mb-2 uppercase italic">Escalado de Interfaz</div>
                                            <div className="text-xs text-[#a09b8c] font-bold opacity-70">Ajusta el tamaño con Ctrl + y Ctrl -.</div>
                                        </div>
                                        <button onClick={() => (window as any).ipcRenderer.resetZoom()} className="px-8 py-3 bg-[#c8aa6e]/10 text-[#c8aa6e] text-[11px] font-black tracking-[3px] rounded-lg border border-[#c8aa6e]/20 hover:bg-[#c8aa6e] hover:text-[#010101] transition-all">RESTABLECER ZOOM (100%)</button>
                                    </div>

                                    <div className="mt-12 pt-12 border-t border-white/5">
                                        <button
                                            onClick={() => { localStorage.clear(); window.location.reload(); }}
                                            className="w-full py-5 bg-[#ff4655]/5 hover:bg-[#ff4655]/10 text-[#ff4655] font-black text-[12px] tracking-[5px] rounded-xl border border-[#ff4655]/20 transition-all uppercase"
                                        >
                                            Restablecer Cliente
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Selection Page (Available Updates) */}
                        {activeTab === 'updates' && (
                            <motion.div
                                key="updates"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="flex-1 px-16 pb-16 pt-12 flex flex-col overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                                    <div>
                                        <h1 className="text-4xl font-black italic text-white tracking-widest uppercase">ACTUALIZACIONES</h1>
                                        <p className="text-[#c8aa6e] font-black tracking-[4px] text-xs mt-2 opacity-80 uppercase">
                                            Selecciona el contenido para importar al núcleo
                                        </p>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mb-8 bg-[#010101]/20 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex bg-[#010101]/40 border border-white/5 rounded-lg p-1">
                                        <button
                                            onClick={() => setDownloadWithVideo(true)}
                                            className={`px-4 py-2 text-[10px] font-black tracking-[2px] rounded-md transition-all flex items-center gap-2 ${downloadWithVideo ? 'bg-[#c8aa6e] text-[#01141e] shadow-lg shadow-[#c8aa6e]/20' : 'text-[#a09b8c] hover:text-white'}`}
                                        >
                                            {downloadWithVideo && <div className="w-1.5 h-1.5 rounded-full bg-[#01141e]" />}
                                            CON VIDEO
                                        </button>
                                        <button
                                            onClick={() => setDownloadWithVideo(false)}
                                            className={`px-4 py-2 text-[10px] font-black tracking-[2px] rounded-md transition-all flex items-center gap-2 ${!downloadWithVideo ? 'bg-[#c8aa6e] text-[#01141e] shadow-lg shadow-[#c8aa6e]/20' : 'text-[#a09b8c] hover:text-white'}`}
                                        >
                                            {!downloadWithVideo && <div className="w-1.5 h-1.5 rounded-full bg-[#01141e]" />}
                                            SIN VIDEO
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            placeholder="FILTRAR..."
                                            value={syncSearch}
                                            onChange={(e) => setSyncSearch(e.target.value)}
                                            className="bg-black/40 border border-white/5 rounded px-4 py-2 text-[10px] font-black tracking-[2px] w-48 focus:outline-none focus:border-[#c8aa6e]/50 transition-all text-white placeholder:text-[#a09b8c]/40 select-text no-drag cursor-text"
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 bg-[#010a13]/60 border border-white/5 rounded-xl overflow-hidden flex flex-col backdrop-blur-sm">
                                    <div className="flex bg-white/5 p-4 text-[10px] font-black text-[#a09b8c] tracking-[2px] uppercase border-b border-white/5 items-center">
                                        <div className="w-16 flex justify-center">
                                            <div
                                                className={`w-5 h-5 border-2 border-[#a09b8c] rounded flex items-center justify-center cursor-pointer transition-all hover:border-white ${songsToSync.every((_, i) => selectedSongs[i]) ? 'bg-[#c8aa6e] border-[#c8aa6e]' : 'bg-transparent'}`}
                                                onClick={() => {
                                                    const allSelected = songsToSync.every((_, i) => selectedSongs[i])
                                                    const next: Record<number, boolean> = {}
                                                    songsToSync.forEach((_, i) => next[i] = !allSelected)
                                                    setSelectedSongs(next)
                                                }}
                                            >
                                                {songsToSync.every((_, i) => selectedSongs[i]) && <CheckCircle2 size={14} className="text-[#010a13]" />}
                                            </div>
                                        </div>
                                        <div className="flex-1 pl-4">Chart</div>
                                        <div className="w-32 text-center">Estado</div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 scroll-smooth">
                                        {songsToSync.map((song, idx) => {
                                            if (syncSearch && !song.name.toLowerCase().includes(syncSearch.toLowerCase())) return null
                                            const fileCount = song.files?.length || 0
                                            const isSelected = selectedSongs[idx]
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center py-4 px-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all group ${isSelected ? 'bg-[#c8aa6e]/5' : ''}`}
                                                    onClick={() => toggleSyncSong(idx)}
                                                >
                                                    <div className="w-16 flex justify-center">
                                                        <div className={`w-5 h-5 border-2 border-[#a09b8c] rounded flex items-center justify-center transition-all group-hover:border-white ${isSelected ? 'bg-[#c8aa6e] border-[#c8aa6e]' : 'bg-transparent'}`}>
                                                            {isSelected && <CheckCircle2 size={14} className="text-[#010a13]" />}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 pl-4">
                                                        <div className={`font-black text-[14px] uppercase tracking-tight transition-colors ${isSelected ? 'text-[#c8aa6e]' : 'text-white'}`}>{song.name}</div>
                                                        <div className="text-[10px] font-bold text-[#a09b8c] mt-1 opacity-60">
                                                            {fileCount} {fileCount === 1 ? 'archivo' : 'archivos'}
                                                        </div>
                                                    </div>
                                                    <div className="w-32 flex justify-center">
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded bg-black/40 border ${song.status === 'NUEVA' ? 'border-[#0ac8b9] text-[#0ac8b9]' : 'border-[#c8aa6e] text-[#c8aa6e]'}`}>
                                                            {song.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="mt-8 flex justify-end gap-6 items-center">
                                    <button className="px-8 py-4 rounded-lg bg-transparent hover:bg-white/5 text-[#a09b8c] hover:text-white font-black text-[11px] tracking-[2px] transition-all uppercase" onClick={() => { setActiveTab('home'); setActivePage('home'); }}>
                                        Cancelar
                                    </button>
                                    <button
                                        className="px-10 py-4 rounded-lg bg-[#c8aa6e] text-[#01141e] font-black text-[12px] tracking-[3px] hover:bg-[#f0e6d2] hover:scale-105 hover:shadow-[0_0_30px_#c8aa6e] transition-all uppercase flex items-center gap-3 disabled:opacity-50 disabled:hover:scale-100"
                                        onClick={startDownload}
                                        disabled={Object.values(selectedSongs).filter(Boolean).length === 0}
                                    >
                                        <Download size={18} /> Iniciar Descarga
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Download Progress Card (Overlay) - Moved outside search/viewport AnimatePresence */}
                    <AnimatePresence>
                        {isDownloading && activeTab === 'updates' && (
                            <motion.div
                                key="download-overlay"
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="fixed bottom-10 left-32 bg-[#010101]/90 border border-[#c8aa6e]/30 p-6 rounded-xl backdrop-blur-md shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 w-80"
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <div className="text-[10px] font-black text-[#c8aa6e] tracking-[2px] uppercase animate-pulse">DESCARGANDO ACTUALIZACIÓN</div>
                                    <div className="text-[10px] font-bold text-white font-mono">{Math.round(downloadStats.progress * 100)}%</div>
                                </div>
                                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-3">
                                    <motion.div
                                        className="h-full bg-[#c8aa6e] shadow-[0_0_10px_#c8aa6e]"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${downloadStats.progress * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[9px] font-bold text-[#a09b8c] tracking-wider uppercase">
                                    <span>ESTIMADO: {downloadStats.speed ? `${downloadStats.speed} • ` : ''}{downloadStats.eta}</span>
                                    <span>NO CIERRES EL LAUNCHER</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Particle Layer (Legacy Concept) */}
                <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-20">
                    {[...Array(15)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute bg-[#c8aa6e] rounded-full blur-[2px]"
                            style={{ width: 2, height: 2, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                            animate={{ y: [0, -200], opacity: [0, 0.5, 0] }}
                            transition={{ duration: Math.random() * 10 + 5, repeat: Infinity, ease: "linear", delay: Math.random() * 5 }}
                        />
                    ))}
                </div>
            </main >
        </div >
    )
}

export default App
