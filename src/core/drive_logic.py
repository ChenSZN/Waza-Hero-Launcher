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
CONFIG_FILE = 'config/launcher_config.json'
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
        downloader = MediaIoBaseDownload(fh, request, chunksize=1024*1024)
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
        except Exception as e:
            print(f"Error actualizando master: {e}")
        return False

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