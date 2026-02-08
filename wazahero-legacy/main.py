import sys
import os
import time
import threading
import json
import ctypes
import concurrent.futures
from PyQt6.QtWidgets import (QApplication, QFileDialog) 
from PyQt6.QtGui import QIcon
from src.ui.main_window import LauncherWindow, QColor, VERSION
from src.core.drive_logic import DriveManager

COLOR_ACENTO = "#0AC8B9" 
COLOR_EXITO = "#30D158"

CACHED_LIBRARY_FILE = 'data/library_cache.json'

class Controller:
    def __init__(self):
        # Fix taskbar icon on Windows
        try:
            myappid = u'chenszen.wazahero.launcher.1.3.14' # arbitrary string
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
        except:
            pass

        #Iniciar App PyQt
        self.app = QApplication(sys.argv)
        
        # Set App Icon
        from src.utils.resource_utils import resource_path
        icon_path = resource_path("assets/WAZAHEROICON.ico")
        if os.path.exists(icon_path):
            self.app.setWindowIcon(QIcon(icon_path))

        self.logic = DriveManager()
        
        #Instanciar Ventana
        self.gui = LauncherWindow()
        
        #(Eventos)
        self.gui.sig_sync.connect(self.handle_sync)
        self.gui.sig_play.connect(self.handle_play)
        self.gui.sig_config.connect(self.handle_config)
        
        #New Selection Signals
        self.gui.sig_confirm_download.connect(self.start_download)
        self.gui.sig_stop_download.connect(self.handle_stop_download)
        self.gui.sig_cancel_selection.connect(self.cancel_selection)
        self.gui.sig_open_library.connect(self.open_local_library)
        self.gui.sig_go_home.connect(self.handle_go_home)
        
        self.pending_results = False # track if  pending songs to sync
        self.stop_requested = False 
        
        # Mostrar ventana
        self.gui.show()
        
        self.setup_initial_state()
        
        #Loop
        sys.exit(self.app.exec())

    def setup_initial_state(self):
        self.gui.log("Sistema iniciando...")
        
        # Check credentials
        from src.core.drive_logic import CREDENTIALS_DATA
        if not CREDENTIALS_DATA:
            self.gui.log("CRÍTICO: No se encontraron credenciales (credentials.json).")
            self.gui.set_status("ERROR DE ACCESO", "Falta credentials.json", COLOR_ACENTO)
        
        rs = self.logic.obtener_config('ruta_songs')
        re = self.logic.obtener_config('ruta_exe')
        
        if not rs or not re:
            det = self.logic.adivinar_rutas_iniciales()
            if not rs and 'ruta_songs' in det: 
                self.logic.guardar_config('ruta_songs', det['ruta_songs'])
                rs = det['ruta_songs']
            if not re and 'ruta_exe' in det: 
                self.logic.guardar_config('ruta_exe', det['ruta_exe'])
                re = det['ruta_exe']
        
        if rs: self.gui.log(f"Ruta Songs: {rs}")
        if re: 
            self.gui.log(f"Juego hallado: {re}")
            self.gui.set_status("LISTO PARA JUGAR", "Todo configurado correctamente.", COLOR_EXITO)
        else: 
            self.gui.set_status("CONFIGURACIÓN PENDIENTE", "Falta seleccionar la carpeta Songs o el Juego.", COLOR_ACENTO)

        # Check for updates in background
        threading.Thread(target=self.check_for_updates, daemon=True).start()

    def check_for_updates(self):
        try:
            service = self.logic.obtener_servicio()
            remote_data = self.logic.obtener_version_remota(service)
            if remote_data and 'version' in remote_data:
                remote_version = remote_data['version']
                if remote_version != VERSION: # Simplistic: any difference triggers alert
                    self.gui.sig_update_available.emit(remote_version, remote_data.get('url', ''))
        except: pass # Don't crash if check fails

    def handle_sync(self):
        if self.gui._sync_card_mode == "DOWNLOADING":
            self.gui.log("! Sincronización ignorada: Descarga en curso.")
            return
        rs = self.logic.obtener_config('ruta_songs')
        if not rs:
            self.gui.log("! Primero configura la carpeta Songs.")
            return
        self.gui.set_sync_enabled(False)
        self.gui.set_status("ESCANEANDO...", "Analizando diferencias...", COLOR_ACENTO)
        threading.Thread(target=self.scan_worker, args=(rs,), daemon=True).start()

    def scan_worker(self, rs):
        try:
            service = self.logic.obtener_servicio()
            
            # --- PASO 1: Actualizar lista maestra ---
            self.gui.log("Buscando actualizaciones de la lista...")
            try:
                if self.logic.actualizar_master(service):
                    self.gui.log("✓ Lista de canciones actualizada.")
                else:
                    self.gui.log("! No se encontró master_songs.json en Drive.")
            except Exception as e:
                self.gui.log(f"Error actualizando lista: {e}")
                self.gui.log("! Usando lista local (si existe).")

            # --- PASO 2: Cargar lista ---
            if not os.path.exists("data/master_songs.json"):
                self.gui.log("ERR: No hay lista de canciones.")
                self.gui.set_status("ERROR DE LISTA", "No se encontró master_songs.json", COLOR_ACENTO)
                self.gui.set_sync_enabled(True)
                return

            with open("data/master_songs.json", "r", encoding="utf-8") as f:
                servidor = json.load(f)["archivos"]
            
            # --- PASO 3: Identificar archivos a descargar (Turbo Mode) ---
            descargas_pendientes = {}
            self.gui.log(f"Verificando {len(servidor)} archivos...")
            self.gui.set_status("VERIFICANDO", f"Analizando {len(servidor)} archivos...")
            
            local_cache = self.logic.load_cache()
            cache_updated = False
            total_archivos = len(servidor)
            start_time = time.time()
            
            for idx, item in enumerate(servidor):
                # Update status
                if idx % 50 == 0:
                   porcentaje = int((idx / total_archivos) * 100)
                   self.gui.set_status("VERIFICANDO", f"{porcentaje}% completado...")
                   self.gui.set_progress((idx + 1) / total_archivos)

                ruta_relativa = item['ruta_relativa'].replace('\\', '/')
                ruta_final = os.path.join(rs, ruta_relativa, item['nombre'])
                
                descargar = False
                
                # Check Local Existence
                item['local_exists'] = os.path.exists(ruta_final) # Flag for UI
                
                if not item['local_exists']:
                    descargar = True
                else:
                    size_local = os.path.getsize(ruta_final)
                    size_remoto = int(item.get('tamano', 0))
                    
                    if size_local != size_remoto:
                         self.gui.log(f"CAMBIO TAMAÑO: {item['nombre']}")
                         descargar = True
                    else:
                        md5_local = self.logic.get_file_hash(ruta_final, cache=local_cache)
                        cache_updated = True
                        md5_remoto = item.get('hash')
                        if md5_remoto and md5_local != md5_remoto:
                            descargar = True
                
                if descargar:
                    # Enriched item for download
                    item['ruta_final'] = ruta_final 
                    # Ensure id_drive is present
                    if 'id_drive' not in item:
                         item['id_drive'] = item.get('id')
                    
                    # GROUPING LOGIC
                    # Usamos ruta_relativa como identificador de la canción
                    group_key = item['ruta_relativa']
                    if group_key not in descargas_pendientes:
                        descargas_pendientes[group_key] = []
                    descargas_pendientes[group_key].append(item)
            
            if cache_updated:
                self.logic.save_cache(local_cache)

            # --- PASO 4: Decisión ---
            self.gui.set_progress(1)
            
            if not descargas_pendientes:
                self.gui.log("✓ Todo al día.")
                self.gui.set_status("SISTEMA SINCRONIZADO", "Tu colección está al día. ¡A jugar!", COLOR_EXITO)
                self.gui.set_sync_enabled(True)
            else:
                count_songs = len(descargas_pendientes)
                # Count total files for log
                count_files = sum(len(v) for v in descargas_pendientes.values())
                
                self.gui.log(f"Se encontraron {count_songs} canciones ({count_files} archivos) para actualizar.")
                
                # Convert dict to list for UI
                # Format: [{'name': 'Song Name', 'files': [item1, item2], 'status': 'UPDATE'}]
                ui_data = []
                for folder_path, files in descargas_pendientes.items():
                    # Folder path usually is "Artist\Album\Song" or just "Song"
                    # Let's take the last part as name for display
                    display_name = folder_path.replace('\\', '/').split('/')[-1]
                    if not display_name: display_name = folder_path # Fallback

                    # Determine status (if any file is new vs all update)
                    # Simple rule: if folder exists locally, it's UPDATE, else NEW
                    local_song_path = os.path.join(rs, folder_path)
                    status = "UPDATE" if os.path.exists(local_song_path) else "NUEVA"
                    
                    ui_data.append({
                        'name': display_name,
                        'full_path': folder_path,
                        'files': files,
                        'status': status
                    })
                
                # TRIGGER SELECTION UI (Main Thread)
                self.gui.set_status("NUEVOS CHART DETECTADOS", f"Se encontraron {count_songs} canciones.", COLOR_ACENTO)
                self.pending_results = True # Mark as results pending
                self.gui.show_selection(ui_data)
                # Note: We DON'T enable sync button yet, user is in selection mode

        except Exception as e: 
            self.gui.log(f"ERROR GLOBAL: {e}")
            self.gui.set_status("ERROR CRÍTICO", str(e), COLOR_ACENTO)
            self.gui.set_sync_enabled(True)
            import traceback
            traceback.print_exc()

    def start_download(self, selected_songs):
        self.stop_requested = False
        self.gui.log(f"Iniciando descarga de {len(selected_songs)} elementos...")
        self.gui.set_status("INICIANDO DESCARGA", "Preparando...", COLOR_ACENTO)
        
        # 1. Update UI Feedback
        self.gui.set_selection_downloading_state(True)
        self.gui.set_sync_card_mode("DOWNLOADING")
        self.gui.show_songs_alert(False) # Hide alert if we are downloading
        self.pending_results = False 
        
        threading.Thread(target=self.download_worker, args=(selected_songs,), daemon=True).start()

    def handle_stop_download(self):
        self.gui.log("! Solicitud de parada enviada. Esperando a terminar archivo actual...")
        self.stop_requested = True
        self.gui.set_status("DETENIENDO...", "Finalizando tareas...", COLOR_ACENTO)

    def cancel_selection(self):
        self.gui.show_home()
        self.gui.set_status("CANCELADO", "Sincronización cancelada por usuario.", COLOR_ACENTO)
        self.gui.set_sync_enabled(True)
        if self.pending_results:
            self.gui.show_songs_alert(True) # Show the ⚠️ icon

    def download_worker(self, descargas_pendientes):
        try:
            # Get a fresh service and total count
            total_dl = len(descargas_pendientes)
            completed = 0
            
            self.gui.set_status("DESCARGANDO", f"Preparando {total_dl} archivos...")
            self.gui.set_progress(0) 
            
            start_dl = time.time()

            def download_task(archivo):
                # FRESH SERVICE PER THREAD for thread-safety
                try:
                    self.gui.set_selection_file_log(archivo['nombre'])
                    thread_service = self.logic.obtener_servicio()
                    self.logic.descargar_archivo(thread_service, archivo['id_drive'], archivo['ruta_final'])
                    return (True, archivo['nombre'])
                except Exception as e:
                    return (False, f"{archivo['nombre']}: {e}")

            # Using ThreadPoolExecutor with optimal workers (4)
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = {executor.submit(download_task, arch): arch for arch in descargas_pendientes}
                
                for future in concurrent.futures.as_completed(futures):
                    if self.stop_requested:
                        self.gui.log("! Descarga detenida por el usuario.")
                        # Shutdown executor without waiting for all futures if necessary
                        # but as_completed will continue until all scheduled are done.
                        # To truly stop now, we would need to check inside download_task too.
                        break

                    completed += 1
                    success, message = future.result()
                    
                    if success:
                        self.gui.log(f"OK: {message}")
                    else:
                        self.gui.log(f"ERR: {message}")
                    
                    # ETA Calc
                    elapsed = time.time() - start_dl
                    vel = completed / elapsed # files per second
                    restantes = total_dl - completed
                    eta = int(restantes / vel) if vel > 0 else 0
                    mins, segs = divmod(eta, 60)
                    eta_txt = f"{mins}m {segs}s"
                    
                    self.gui.set_status("DESCARGANDO", f"[{completed}/{total_dl}] - Falta: {eta_txt}")
                    self.gui.set_progress(completed / total_dl)

            if self.stop_requested:
                self.gui.set_status("DESCARGA DETENIDA", "Se detuvo el proceso.", COLOR_ACENTO)
                self.gui.set_selection_downloading_state(False)
            else:
                self.gui.set_status("PROCESO TERMINADO", f"Se descargaron {len(descargas_pendientes)} archivos.", COLOR_EXITO)
                self.gui.set_selection_downloading_state(False)
            
            # Al finalizar, volver al Home
            time.sleep(1)
            self.gui.show_home()

        except Exception as e:
            self.gui.log(f"Error Descarga: {e}")
        finally:
            self.gui.set_sync_enabled(True)

    def handle_play(self):
        exe = self.logic.obtener_config('ruta_exe')
        if not exe or not os.path.exists(exe):
            self.gui.log("Excutable no configurado. Buscando...")
            exe = QFileDialog.getOpenFileName(self.gui, "Buscar Clone Hero.exe", filter="Ejecutables (*.exe)")[0]
            if exe:
                self.logic.guardar_config('ruta_exe', exe)
        
        if exe and os.path.exists(exe):
            self.gui.set_status("LANZANDO...", "Buen juego!")
            os.startfile(exe)
            
            # Auto-close after 3 seconds
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(3000, self.app.quit) # app.quit is safer for controller closure
        else:
            self.gui.log("Error: No se encuentra el juego.")

    def handle_config(self):
        # Usamos dialogo nativo de Qt
        new_path = QFileDialog.getExistingDirectory(self.gui, "Seleccionar Carpeta Songs")
        if new_path:
            self.logic.guardar_config('ruta_songs', new_path)
            self.gui.log(f"Ruta cambiada: {new_path}")
            self.setup_initial_state()

    def parse_song_ini(self, folder_path):
        import configparser
        ini_path = os.path.join(folder_path, "song.ini")
        # Default if no ini or error
        folder_name = os.path.basename(folder_path)
        metadata = {"artist": "", "name": folder_name, "folder": folder_name}
        
        if os.path.exists(ini_path):
            try:
                config = configparser.ConfigParser(interpolation=None, strict=False)
                # Some .ini files don't have [song] header or use other names, try to be flexible
                with open(ini_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if "[song" not in content.lower():
                        content = "[song]\n" + content
                
                config.read_string(content)
                section = 'song' if config.has_section('song') else config.sections()[0] if config.sections() else None
                if section:
                    metadata["artist"] = config.get(section, 'artist', fallback="")
                    metadata["name"] = config.get(section, 'name', fallback=folder_name)
            except: pass
            
        return metadata

    def open_local_library(self):
        songs_path = self.logic.obtener_config('ruta_songs')
        if not songs_path or not os.path.exists(songs_path):
            self.gui.log("No se ha configurado la ruta de canciones.")
            self.gui.show_library_page()
            return

        try:
            # 1. Load Cache if exists
            cached_data = {}
            if os.path.exists(CACHED_LIBRARY_FILE):
                with open(CACHED_LIBRARY_FILE, 'r') as f:
                    cached_data = json.load(f)

            # 2. Get current folders
            folders = [d for d in os.listdir(songs_path) if os.path.isdir(os.path.join(songs_path, d))]
            folders.sort()
            
            final_library = []
            new_cache = {}
            updated_cache = False

            # 3. Process each folder (with cache)
            for folder in folders:
                folder_path = os.path.join(songs_path, folder)
                # Use mtime to detect changes
                try: mtime = os.path.getmtime(folder_path)
                except: mtime = 0

                cache_key = folder
                if cache_key in cached_data and cached_data[cache_key].get('mtime') == mtime:
                    final_library.append(cached_data[cache_key])
                    new_cache[cache_key] = cached_data[cache_key]
                else:
                    # Parse real metadata
                    meta = self.parse_song_ini(folder_path)
                    meta['mtime'] = mtime
                    final_library.append(meta)
                    new_cache[cache_key] = meta
                    updated_cache = True

            # 4. Save cache if updated
            if updated_cache or len(new_cache) != len(cached_data):
                os.makedirs(os.path.dirname(CACHED_LIBRARY_FILE), exist_ok=True)
                with open(CACHED_LIBRARY_FILE, 'w') as f:
                    json.dump(new_cache, f, indent=4)

            # 5. Populate UI
            # We sort by Artist - Name for better UX
            final_library.sort(key=lambda x: (x['artist'].lower(), x['name'].lower()))
            
            self.gui.populate_library_table(final_library)
            self.gui.show_library_page()
            self.gui.log(f"Biblioteca cargada: {len(final_library)} canciones.")
            
        except Exception as e:
            self.gui.log(f"Error cargando biblioteca: {e}")
            self.gui.show_library_page()
            
    def handle_go_home(self):
        # Reset any active/pending states for UI feedback
        self.gui.set_progress(1) # Clear the 99% bar

        # If we are downloading, we DON'T reset the card or the main status
        if self.gui._sync_card_mode == "DOWNLOADING":
            self.gui.show_home()
            return

        # Restore card and status based on results
        if self.pending_results:
            self.gui.set_sync_card_mode("RESULTS")
            self.gui.set_status("NUEVOS CHART DETECTADOS", "Sincronización pendiente.", COLOR_ACENTO)
        else:
            self.gui.set_sync_card_mode("SYNC")
            # If we were already ready, we keep it
            re = self.logic.obtener_config('ruta_exe')
            if re:
                self.gui.set_status("LISTO PARA JUGAR", "Todo configurado correctamente.", COLOR_EXITO)
            else:
                self.gui.set_status("ONLINE", "Esperando...", COLOR_ACENTO)
            
        self.gui.show_home()

    def adivinar_rutas_iniciales(self):
        # Esta logica estaba en drive_logic, aquí solo manejamos UI si hace falta
        pass 

if __name__ == "__main__":
    Controller()