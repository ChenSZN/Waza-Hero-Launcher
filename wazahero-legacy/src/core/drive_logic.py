import os
import json
import io
import socket
from googleapiclient.discovery import build
from google.oauth2 import service_account
from googleapiclient.http import MediaIoBaseDownload

import hashlib
from src.utils.resource_utils import resource_path

# --- CREDENCIALES (SEGURIDAD REFORZADA PARA GITHUB) ---
# Cargamos desde un archivo externo que está en el .gitignore
def load_credentials():
    path = resource_path("credentials.json")
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return {}

CREDENTIALS_DATA = load_credentials()

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
CONFIG_FILE = os.path.join(os.getcwd(), 'config', 'launcher_config.json')
MASTER_DATA = os.path.join(os.getcwd(), 'data', 'master_songs.json')
ID_CARPETA_MAESTRA = '1K4RFF9QN5n0QLDj7RH73xdA5I4IOlrmj'
socket.setdefaulttimeout(300)

class DriveManager:
    def guardar_config(self, clave, valor):
        config = {}
        # Ensure directory exists
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f: config = json.load(f)
        config[clave] = valor
        with open(CONFIG_FILE, 'w') as f: json.dump(config, f, indent=4)

    def obtener_config(self, clave):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f: return json.load(f).get(clave)
            except: return None
        return None

    def obtener_servicio(self):
        # Usamos from_service_account_info en lugar de _file
        creds = service_account.Credentials.from_service_account_info(CREDENTIALS_DATA, scopes=SCOPES)
        return build('drive', 'v3', credentials=creds)

    def descargar_archivo(self, service, file_id, ruta_destino):
        os.makedirs(os.path.dirname(ruta_destino), exist_ok=True)
        request = service.files().get_media(fileId=file_id)
        fh = io.FileIO(ruta_destino, 'wb')
        downloader = MediaIoBaseDownload(fh, request, chunksize=5*1024*1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()

    def load_cache(self):
        if os.path.exists('data/local_cache.json'):
            try:
                with open('data/local_cache.json', 'r') as f:
                    return json.load(f)
            except: return {}
        return {}

    def save_cache(self, cache):
        try:
            os.makedirs('data', exist_ok=True)
            with open('data/local_cache.json', 'w') as f:
                json.dump(cache, f)
        except: pass

    def get_file_hash(self, ruta_archivo, cache=None):
        """Calcula MD5 usando cache si el archivo no ha sido modificado."""
        try:
            stat = os.stat(ruta_archivo)
            mtime = stat.st_mtime
            size = stat.st_size
        except FileNotFoundError:
            return None

        # 1. Check Cache
        if cache is not None and ruta_archivo in cache:
            entry = cache[ruta_archivo]
            # Si la fecha de modificación y el tamaño son idénticos, el hash es el mismo
            if entry.get('mtime') == mtime and entry.get('size') == size:
                return entry.get('md5')

        # 2. Calculate MD5 (Slow)
        hash_md5 = hashlib.md5()
        try:
            with open(ruta_archivo, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hash_md5.update(chunk)
            md5_val = hash_md5.hexdigest()
            
            # 3. Update Cache
            if cache is not None:
                cache[ruta_archivo] = {
                    'mtime': mtime,
                    'size': size,
                    'md5': md5_val
                }
            return md5_val
        except FileNotFoundError:
            return None

    # Deprecated compatibility wrapper
    def calcular_md5(self, ruta_archivo):
        return self.get_file_hash(ruta_archivo)

    def actualizar_master(self, service):
        """Busca y descarga la última versión de master_songs.json."""
        try:
            query = f"'{ID_CARPETA_MAESTRA}' in parents and name = 'master_songs.json' and trashed = false"
            results = service.files().list(q=query, fields="files(id, name)").execute()
            items = results.get('files', [])
            
            if items:
                file_id = items[0]['id']
                print("Descargando master_songs.json actualizado...")
                self.descargar_archivo(service, file_id, "data/master_songs.json")
                return True
            else:
                print("[WAR] No se encontró master_songs.json en el servidor.")
        except Exception as e:
            print(f"Error actualizando master: {e}")
        return False

    def obtener_version_remota(self, service):
        """Busca 'version.json' en Drive y devuelve su contenido."""
        try:
            query = f"'{ID_CARPETA_MAESTRA}' in parents and name = 'version.json' and trashed = false"
            results = service.files().list(q=query, fields="files(id, name)").execute()
            items = results.get('files', [])
            if items:
                file_id = items[0]['id']
                # Descargar en memoria
                request = service.files().get_media(fileId=file_id)
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
                
                fh.seek(0)
                return json.loads(fh.read().decode('utf-8'))
        except Exception as e:
            print(f"Error obteniendo version remota: {e}")
        return None

    def adivinar_rutas_iniciales(self):
        """Intenta detectar Songs y el EXE si no hay config."""
        rutas_detectadas = {}
        # Buscar Songs
        rs_std = os.path.expandvars(r'%USERPROFILE%\Documents\Clone Hero\Songs')
        if os.path.exists(rs_std):
            rutas_detectadas['ruta_songs'] = rs_std
            
        # Buscar EXE en lugares comunes
        posibles_exes = [
            os.getcwd(),
            os.path.expandvars(r'%USERPROFILE%\Documents\Clone Hero'),
            os.path.expandvars(r'%PROGRAMFILES%\Clone Hero')
        ]
        if 'ruta_songs' in rutas_detectadas:
            posibles_exes.insert(0, os.path.dirname(rutas_detectadas['ruta_songs']))

        for r in posibles_exes:
            exe = os.path.join(r, "Clone Hero.exe")
            if os.path.exists(exe):
                rutas_detectadas['ruta_exe'] = exe
                break
        return rutas_detectadas

    def verificar_actualizaciones(self, service, log_callback=None):
        """
        Escanea master_songs.json y compara con la biblioteca local.
        Retorna un diccionario de canciones pendientes de descarga.
        """
        if log_callback: log_callback("Iniciando escaneo de biblioteca...")
        rs = self.obtener_config('ruta_songs')
        if not rs or not os.path.exists(rs):
            if log_callback: log_callback("[ERR] Ruta de canciones no válida.")
            return {}

        # 1. Cargar master_songs.json
        master_path = "data/master_songs.json"
        if not os.path.exists(master_path):
            if log_callback: log_callback("Actualizando datos del maestro...")
            self.actualizar_master(service)
        
        if not os.path.exists(master_path):
            if log_callback: log_callback("[ERR] No se pudo obtener el maestro.")
            return {}

        try:
            with open(master_path, 'r', encoding='utf-8') as f:
                servidor = json.load(f)
        except: 
            if log_callback: log_callback("[ERR] Error al leer el maestro.")
            return {}

        if log_callback: log_callback("Comparando con colección local...")
        # 2. Cargar Cache Local
        local_cache = self.load_cache()
        
        descargas_pendientes = {}
        
        # 3. Comparar
        archivos_servidor = servidor.get('archivos', servidor)
        if not isinstance(archivos_servidor, list):
             print("[ERR] master_songs.json is not a valid list of files.")
             return {}

        total = len(archivos_servidor)
        for i, item in enumerate(archivos_servidor):
            if not isinstance(item, dict): continue
            
            if i % 50 == 0 and log_callback:
                log_callback(f"Verificando {i}/{total} archivos...")

            ruta_relativa = item.get('ruta_relativa', '').replace('\\', '/')
            ruta_final = os.path.join(rs, ruta_relativa, item['nombre'])
            
            descargar = False
            
            if not os.path.exists(ruta_final):
                descargar = True
            else:
                try:
                    size_local = os.path.getsize(ruta_final)
                    size_remoto = int(item.get('tamano', 0))
                    
                    if size_local != size_remoto:
                        descargar = True
                    else:
                        md5_local = self.get_file_hash(ruta_final, cache=local_cache)
                        md5_remoto = item.get('hash')
                        if md5_remoto and md5_local != md5_remoto:
                            descargar = True
                except:
                    descargar = True
            
            if descargar:
                item['ruta_final'] = ruta_final 
                if 'id_drive' not in item:
                    item['id_drive'] = item.get('id')
                
                group_key = item['ruta_relativa']
                if group_key not in descargas_pendientes:
                    descargas_pendientes[group_key] = []
                descargas_pendientes[group_key].append(item)

        self.save_cache(local_cache)
        return descargas_pendientes