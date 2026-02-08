import eel
import os
import sys
import threading
import time
import json
import ctypes
import ctypes.wintypes
from src.core.drive_logic import DriveManager

# Initialize wx App for dialogs (must be in main thread usually, but for simple dialogs inside thread might need care)
# Actually, for Eel, tkinter can be safer/simpler for just a dialog if wx is overkill, 
# but let's try tkinter first as it's standard, to avoid deps issues if wx not installed.
import tkinter as tk
from tkinter import filedialog

# Initialize Logic
logic = DriveManager()

# Add a route to serve song assets (covers)
@eel.btl.route('/song_assets/<path:path>')
def serve_song_assets(path):
    rs = logic.obtener_config('ruta_songs')
    return eel.btl.static_file(path, root=rs)

@eel.btl.route('/song_audio/<path:path>')
def serve_audio(path):
    rs = logic.obtener_config('ruta_songs')
    return eel.btl.static_file(path, root=rs, mimetype='audio/ogg')

@eel.btl.route('/launcher_assets/<path:path>')
def serve_launcher_assets(path):
    # Root assets folder
    if getattr(sys, 'frozen', False):
        root = os.path.join(sys._MEIPASS, 'assets')
    else:
        root = os.path.join(os.getcwd(), 'assets')
    return eel.btl.static_file(path, root=root)

# --- EEL EXPOSED FUNCTIONS ---

@eel.expose
def get_version():
    return "3.2.3 (LoL Premium)"

@eel.expose
def save_config(key, value):
    print(f"[PY] Saving config {key} = {value}")
    logic.guardar_config(key, value)
    return True

@eel.expose
def get_config(key):
    return logic.obtener_config(key)

@eel.expose
def close_app():
    print("[PY] Closing application...")
    sys.exit(0)

@eel.expose
def minimize_app():
    print("[PY] Minimizing application...")
    try:
        # Title must match App.jsx / index.html <title>
        hwnd = ctypes.windll.user32.FindWindowW(None, "Waza Hero Launcher")
        if not hwnd: hwnd = ctypes.windll.user32.FindWindowW(None, "Launching Waza Hero: LoL Rebirth Edition...")
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 6) # SW_MINIMIZE = 6
    except Exception as e:
        print(f"[ERR] Minimize failed: {e}")

@eel.expose
def resize_window(w, h):
    """Resizes the application window safely."""
    print(f"[PY] Resizing window to {w}x{h}")
    try:
        hwnd = ctypes.windll.user32.FindWindowW(None, "Waza Hero Launcher")
        if not hwnd: hwnd = ctypes.windll.user32.FindWindowW(None, "Launching Waza Hero: LoL Rebirth Edition...")
        if hwnd:
            # Get screen resolution for centering if possible, or just resize
            # SWP_NOZORDER = 0x0004
            # SWP_NOMOVE = 0x0002
            # We want to keep it centered or at least consistent.
            # Let's just resize it for now.
            ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, int(w), int(h), 0x0002 | 0x0004 | 0x0020)
            return True
    except Exception as e:
        print(f"[ERR] Resize failed: {e}")
    return False

@eel.expose
def get_backgrounds():
    valid_ext = ('.jpg', '.jpeg', '.png', '.webp')
    
    # Root assets folder
    if getattr(sys, 'frozen', False):
        root_assets = os.path.join(sys._MEIPASS, 'assets')
    else:
        root_assets = os.path.join(os.getcwd(), 'assets')
    
    # Web assets (built dist)
    if getattr(sys, 'frozen', False):
        web_assets_dir = os.path.join(sys._MEIPASS, 'wazahero-web-v3', 'dist', 'assets')
    else:
        web_assets_dir = os.path.join(os.getcwd(), 'wazahero-web-v3', 'dist', 'assets')

    all_backgrounds = []
    
    # 1. Look in root assets (Backgrounds from previous version)
    if os.path.exists(root_assets):
        print(f"[PY] Scanning for backgrounds in root: {root_assets}")
        files = [f"/launcher_assets/{f}" for f in os.listdir(root_assets) if f.lower().startswith('background') and f.lower().endswith(valid_ext)]
        all_backgrounds.extend(files)

    # 2. Look in web assets
    if os.path.exists(web_assets_dir):
        print(f"[PY] Scanning for backgrounds in web: {web_assets_dir}")
        # These are served relative to dist root by Eel
        files = [f"/assets/{f}" for f in os.listdir(web_assets_dir) if f.lower().endswith(valid_ext)]
        all_backgrounds.extend(files)
        
    return list(set(all_backgrounds)) # Unique list

@eel.expose
def launch_game():
    print("[PY] Launching game...")
    exe = logic.obtener_config('ruta_exe')
    if exe and os.path.exists(exe):
        try:
            os.startfile(exe)
            eel.update_status("JUEGO INICIADO", "¡Buen juego!", "#30d158")
            return True
        except: pass
    
    eel.update_status("ERROR AL LANZAR", "Verifica la ruta del ejecutable.", "#ff4655")
    return False

@eel.expose
def get_patch_notes():
    """Fetches the latest release info from GitHub."""
    import urllib.request
    try:
        url = "https://api.github.com/repos/ChenSZN/Waza-Hero-Launcher/releases/latest"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return {
                'version': data.get('tag_name', 'v3.2.3'),
                'body': data.get('body', 'No notes available.'),
                'date': data.get('published_at', '')
            }
    except Exception as e:
        print(f"[ERR] Patch notes fetch failed: {e}")
        return {'version': 'v3.2.3', 'body': 'Conexión con GitHub fallida.', 'date': ''}

@eel.expose
def get_game_stats():
    """Calculates some interesting stats from the local library."""
    try:
        rs = logic.obtener_config('ruta_songs')
        master_count = 1100 # Fallback
        
        # Try to get real master count
        master_path = os.path.join(os.getcwd(), 'data', 'master_songs.json')
        if os.path.exists(master_path):
            try:
                with open(master_path, 'r') as f:
                    master_data = json.load(f)
                    # Count unique relative paths (songs)
                    archivos = master_data.get('archivos', [])
                    master_count = len(set(a['ruta_relativa'] for a in archivos))
            except: pass

        if not rs or not os.path.exists(rs):
            return {'total_songs': 0, 'master_songs': master_count, 'last_sync': '-'}
        
        all_items = os.listdir(rs)
        song_folders = [i for i in all_items if os.path.isdir(os.path.join(rs, i))]
        
        return {
            'total_songs': len(song_folders),
            'master_songs': master_count,
            'last_sync': time.strftime('%d/%m/%Y %H:%M', time.localtime(os.path.getmtime(rs))) if rs and os.path.exists(rs) else '-'
        }
    except Exception as e:
        print(f"[ERR] Stats failed: {e}")
        return {'total_songs': 0, 'master_songs': 1100, 'last_sync': '-'}

@eel.expose
def get_master_library():
    """Returns the full master list from master_songs.json."""
    master_path = os.path.join(os.getcwd(), 'data', 'master_songs.json')
    if not os.path.exists(master_path):
        return []
    try:
        with open(master_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            archivos = data.get('archivos', [])
            # Group by relative path to get unique songs
            songs = {}
            for a in archivos:
                rp = a['ruta_relativa']
                if rp not in songs:
                    songs[rp] = {
                        'name': rp.split('/')[-1] if '/' in rp else rp,
                        'path': rp,
                        'is_master': True
                    }
            return list(songs.values())
    except:
        return []

@eel.expose
def get_songs_to_sync():
    """Returns the list of songs detected by the scan."""
    print("[PY] Scanning for updates...")
    try:
        service = logic.obtener_servicio()
        # Explicitly checking if method exists to debug
        if hasattr(logic, 'verificar_actualizaciones'):
            results = logic.verificar_actualizaciones(service, log_callback=eel.add_log)
        else:
            eel.add_log("[ERR] El núcleo no responde.")
            return []
        
        ui_data = []
        if results:
            rs = logic.obtener_config('ruta_songs')
            for folder_path, files in results.items():
                display_name = folder_path.replace('\\', '/').split('/')[-1]
                if not display_name: display_name = folder_path
                
                local_song_path = os.path.join(rs, folder_path)
                status = "UPDATE" if os.path.exists(local_song_path) else "NUEVA"
                
                ui_data.append({
                    'name': display_name,
                    'full_path': folder_path,
                    'files': files,
                    'status': status
                })
        return ui_data
        return ui_data
    except Exception as e:
        print(f"[ERR] Scan error: {e}")
        return []

@eel.expose
def get_local_library():
    """Returns all locally installed songs (Recursive search)."""
    print("[PY] Fetching local library (Recursive)...")
    try:
        rs = logic.obtener_config('ruta_songs')
        if not rs or not os.path.exists(rs):
             return []
            
        songs = []
        img_exts = ['png', 'jpg', 'jpeg', 'webp']
        audio_exts = ['opus', 'ogg', 'mp3', 'wav']

        for root, dirs, files in os.walk(rs):
            # Check if this folder is a song folder
            # A song folder usually has song.ini, or at least a chart/mid and audio
            if 'song.ini' in files or any(f.endswith('.chart') or f.endswith('.mid') for f in files):
                item = os.path.relpath(root, rs).replace('\\', '/')
                
                # Album Art Logic
                cover_path = None
                for ext in img_exts:
                    if os.path.exists(os.path.join(root, f"album.{ext}")):
                        cover_path = f"/song_assets/{item}/album.{ext}"
                        break
                
                if not cover_path:
                    for f in files:
                        if f.lower().endswith(tuple(img_exts)):
                            cover_path = f"/song_assets/{item}/{f}"
                            break

                # Audio Preview Logic (Universal)
                audio_path = None
                # Priority: song.opus -> song.ogg -> any audio
                priority_files = [f"song.{ext}" for ext in audio_exts]
                
                # First check for 'song.*'
                for pf in priority_files:
                    if pf in files:
                        audio_path = f"/song_audio/{item}/{pf}"
                        break
                
                # Fallback: check for ANY audio file
                if not audio_path:
                    for f in files:
                        if f.lower().endswith(tuple(audio_exts)):
                            audio_path = f"/song_audio/{item}/{f}"
                            break
                
                mtime = os.path.getmtime(root)
                songs.append({
                    'name': os.path.basename(root),
                    'rel_path': item,
                    'path': root,
                    'cover': cover_path,
                    'audio': audio_path,
                    'mtime': mtime
                })
        
        songs.sort(key=lambda x: x['mtime'], reverse=True)
        print(f"[PY] Found {len(songs)} songs (Recursive).")
        return songs
    except Exception as e:
        print(f"[ERR] Library fetch error: {e}")
        return []

@eel.expose
def select_folder():
    """Opens a folder selection dialog and returns the path."""
    print("[PY] Opening folder dialog...")
    try:
        # Create a hidden root window
        root = tk.Tk()
        root.withdraw() # Hide the main window
        root.wm_attributes('-topmost', 1) # Ensure dialog is on top
        
        folder_path = filedialog.askdirectory()
        
        root.destroy()
        return folder_path
    except Exception as e:
        print(f"[ERR] Dialog error: {e}")
        return ""

@eel.expose
def confirm_download(selected_songs):
    print(f"[PY] Confirming download for {len(selected_songs)} songs...")
    threading.Thread(target=download_worker, args=(selected_songs,), daemon=True).start()

def download_worker(songs):
    try:
        total_files = sum(len(s['files']) for s in songs)
        completed = 0
        
        eel.add_log(f"Iniciando descarga de {len(songs)} canciones ({total_files} archivos)...")
        eel.update_status("DESCARGANDO", f"Preparando {total_files} archivos...", "#c8aa6e")
        
        all_files = []
        for song in songs:
            for f in song['files']:
                all_files.append(f)

        service = logic.obtener_servicio()
        for i, archivo in enumerate(all_files):
            try:
                logic.descargar_archivo(service, archivo['id_drive'], archivo['ruta_final'])
                completed += 1
                progress = completed / total_files
                eel.update_progress(progress)
                eel.add_log(f"Descargado: {archivo['nombre']}")
                eel.update_status("DESCARGANDO", f"[{completed}/{total_files}] - {archivo['nombre']}", "#c8aa6e")
            except Exception as e:
                eel.add_log(f"[ERR] Error en {archivo['nombre']}: {e}")
                print(f"[ERR] File error: {e}")

        eel.add_log(f"Sincronización completa: {completed} archivos recibidos.")
        eel.update_status("COMPLETO", f"Sincronizados {completed} archivos.", "#30d158")
        eel.update_progress(1.0)
    except Exception as e:
        print(f"[ERR] Worker error: {e}")
        eel.update_status("ERROR", str(e), "#ff4655")

# --- APP START ---

def start_app():
    # Determine if running as a frozen executable (PyInstaller)
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.getcwd()

    directory = os.path.join(base_path, 'wazahero-web-v3', 'dist')
    
    # Fix for potentially doubled separators or mix-ups
    directory = os.path.normpath(directory)

    if not os.path.exists(directory):
        print(f"Error: {directory} not found. Run 'npm run build' first.")
        return
        
    eel.init(directory)
    
    chrome_flags = [
        '--app-id=wazahero-web',
        '--window-size=1280,720',
        '--disable-http-cache',
        '--disable-features=Translate',
        '--no-first-run',
        '--disable-infobars',
        '--force-dark-mode'
    ]
    
    def apply_styles():
        # Retry loop to find window as it might take time to spawn
        hwnd = 0
        possible_titles = ["Waza Hero Launcher", "Waza Hero", "index.html", "Chrome", "Waza Hero Launcher v3.2.7", "Launching Waza Hero: LoL Rebirth Edition..."]
        
        # Eel default title usually includes the file name if not set
        # But we want to find the SPECIFIC window.
        
        for i in range(50): # Try for ~10 seconds
            time.sleep(0.2)
            # Try finding by title
            for title in possible_titles:
                hwnd = ctypes.windll.user32.FindWindowW(None, title)
                if hwnd: break
            
            # Fallback: Find any window that belongs to current process
            if not hwnd:
                def callback(h, extra):
                    if ctypes.windll.user32.IsWindowVisible(h):
                        pid = ctypes.wintypes.DWORD()
                        ctypes.windll.user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
                        if pid.value == os.getpid():
                            extra.append(h)
                    return True
                
                hwnds = []
                ctypes.windll.user32.EnumWindows(ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.POINTER(ctypes.c_int))(callback), ctypes.byref(ctypes.py_object(hwnds)))
                # This complex ctypes call might fail, let's stick to title + retry or simpler enum
            
            if hwnd: break
            
        if hwnd:
            print(f"[PY] Applying styles to window {hwnd}...")
            # GWL_STYLE = -16
            # WS_POPUP = 0x80000000
            # WS_VISIBLE = 0x10000000
            # WS_CLIPCHILDREN = 0x02000000
            style = 0x80000000 | 0x10000000 | 0x02000000
            ctypes.windll.user32.SetWindowLongW(hwnd, -16, style)
            
            # Set size and position (1280x720 Base)
            # SWP_FRAMECHANGED = 0x0020
            # SWP_NOZORDER = 0x0004
            # SWP_SHOWWINDOW = 0x0040
            ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 1280, 720, 0x0020 | 0x0040 | 0x0004)
            
            # Apply Icon
            icon_path = os.path.join(base_path, 'assets', 'WAZAHEROICON.ico')
            if os.path.exists(icon_path):
                ICON_SMALL = 0
                ICON_BIG = 1
                WM_SETICON = 0x0080
                h_icon = ctypes.windll.user32.LoadImageW(None, icon_path, 1, 0, 0, 0x00000010)
                if h_icon:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_icon)
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_icon)
        else:
            print("[ERR] Could not find Waza Hero Launcher window to apply styles.")

    threading.Thread(target=apply_styles, daemon=True).start()
    
    print("Launching Waza Hero: LoL Rebirth Edition...")
    eel.start('index.html', size=(1280, 720), mode='chrome', cmdline_args=chrome_flags)

if __name__ == "__main__":
    start_app()
