import os
import json
import io
from googleapiclient.discovery import build
from google.oauth2 import service_account
from googleapiclient.http import MediaIoBaseDownload

# --- CONFIGURACIÓN TÉCNICA ---
SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
CONFIG_FILE = 'launcher_config.json'

def cargar_configuracion():
    """Carga la ruta de Songs desde el archivo config o pide una nueva."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            return config.get('ruta_songs')
    
    # Si no existe, usamos la tuya por defecto ahora
    # En el futuro, aquí es donde entraría la "Opción A" para autodetectar
    ruta_por_defecto = r'E:\Clone Hero\Songs' # <--- CAMBIA ESTO
    
    print(f"No se encontró configuración previa. Usando ruta por defecto: {ruta_por_defecto}")
    
    # Guardar para la próxima vez
    with open(CONFIG_FILE, 'w') as f:
        json.dump({'ruta_songs': ruta_por_defecto}, f, indent=4)
    
    return ruta_por_defecto

def descargar_con_progreso(service, file_id, ruta_destino, nombre_archivo):
    request = service.files().get_media(fileId=file_id)
    # Usamos FileIO para escribir directamente en disco y ahorrar RAM con archivos de 24GB
    fh = io.FileIO(ruta_destino, 'wb')
    downloader = MediaIoBaseDownload(fh, request, chunksize=1024*1024)
    done = False
    
    print(f"    [DESCARGANDO] {nombre_archivo}")
    while done is False:
        status, done = downloader.next_chunk()
        if status:
            print(f"      > {int(status.progress() * 100)}%", end="\r")
    print(f"      > 100% - OK")

def sincronizar():
    ruta_songs = cargar_configuracion()
    print(f"=== CLONE HERO LAUNCHER SYNC ===")
    print(f"Trabajando en: {ruta_songs}\n")

    if not os.path.exists("master_songs.json"):
        print("Error: No se encontró master_songs.json.")
        return

    # 1. Cargar datos del servidor
    with open("master_songs.json", "r", encoding="utf-8") as f:
        datos = json.load(f)
        archivos_servidor = datos["archivos"]

    # 2. Conexión
    creds = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    service = build('drive', 'v3', credentials=creds)

    # 3. Comparación y Descarga
    for item in archivos_servidor:
        # Limpiar rutas para Windows
        ruta_relativa = item['ruta_relativa'].replace('\\', '/')
        directorio_destino = os.path.join(ruta_songs, ruta_relativa)
        ruta_final = os.path.join(directorio_destino, item['nombre'])

        # Asegurar que la carpeta del artista/álbum exista
        os.makedirs(directorio_destino, exist_ok=True)

        if not os.path.exists(ruta_final):
            descargar_con_progreso(service, item['id_drive'], ruta_final, item['nombre'])

    print("\n¡Sincronización finalizada!")

if __name__ == '__main__':
    sincronizar()