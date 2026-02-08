import os
import json
import time
import socket
from googleapiclient.discovery import build
from google.oauth2 import service_account
from googleapiclient.errors import HttpError

# --- CONFIGURACIÓN ---
# Asegúrate de que el archivo JSON esté en la misma carpeta
SERVICE_ACCOUNT_FILE = 'credentials.json'
ID_CARPETA_MAESTRA = '1K4RFF9QN5n0QLDj7RH73xdA5I4IOlrmj'
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

# Aumentar el tiempo de espera para evitar cortes en carpetas muy grandes
socket.setdefaulttimeout(300) 

def obtener_estructura_drive(service, folder_id, ruta_actual=""):
    """Recorre carpetas de forma recursiva y extrae metadatos de archivos."""
    manifiesto = []
    page_token = None
    
    # Imprimir progreso para saber dónde está el script
    print(f" -> Escaneando: {ruta_actual if ruta_actual else 'Directorio Raíz'}")

    while True:
        try:
            # Consultar archivos y subcarpetas
            query = f"'{folder_id}' in parents and trashed = false"
            results = service.files().list(
                q=query, 
                fields="nextPageToken, files(id, name, mimeType, md5Checksum, size)",
                pageToken=page_token
            ).execute()
            
            items = results.get('files', [])

            for item in items:
                if item['mimeType'] == 'application/vnd.google-apps.folder':
                    # Si es carpeta, entramos recursivamente
                    nueva_ruta = os.path.join(ruta_actual, item['name'])
                    manifiesto.extend(obtener_estructura_drive(service, item['id'], nueva_ruta))
                else:
                    # Si es archivo, guardamos sus datos
                    manifiesto.append({
                        "nombre": item['name'],
                        "ruta_relativa": ruta_actual,
                        "id_drive": item['id'],
                        "hash": item.get('md5Checksum'),
                        "tamano": item.get('size')
                    })
            
            # Verificar si hay más páginas de archivos en esta misma carpeta
            page_token = results.get('nextPageToken')
            if not page_token:
                break
                
        except HttpError as error:
            print(f" [!] Error de API: {error}. Reintentando en 5 segundos...")
            time.sleep(5)
            continue
            
    return manifiesto

def ejecutar():
    print("--- INICIANDO GENERADOR DE MANIFIESTO ---")
    
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        print(f"ERROR: No se encontró el archivo de credenciales: {SERVICE_ACCOUNT_FILE}")
        return

    try:
        # Autenticación con la cuenta de servicio
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, 
            scopes=SCOPES
        )
        
        # Construcción del servicio con credenciales explícitas
        service = build('drive', 'v3', credentials=creds)
        
        print(f"Conectado exitosamente como: {creds.service_account_email}")
        print("Iniciando escaneo profundo... esto puede tardar unos minutos.")
        
        inicio_tiempo = time.time()
        mapa_completo = obtener_estructura_drive(service, ID_CARPETA_MAESTRA)
        fin_tiempo = time.time()
        
        # Estructura final del JSON
        data_final = {
            "info": {
                "nombre_proyecto": "Clone Hero Sync",
                "ultima_actualizacion": time.strftime("%Y-%m-%d %H:%M:%S"),
                "total_archivos": len(mapa_completo),
                "tiempo_escaneo_seg": round(fin_tiempo - inicio_tiempo, 2)
            },
            "archivos": mapa_completo
        }
        
        # Guardar en disco
        with open("master_songs.json", "w", encoding="utf-8") as f:
            json.dump(data_final, f, indent=4, ensure_ascii=False)
        
        print("\n" + "="*50)
        print("¡MAPEO FINALIZADO CON ÉXITO!")
        print(f"Archivos encontrados: {len(mapa_completo)}")
        print(f"Tiempo total: {round(fin_tiempo - inicio_tiempo, 2)} segundos")
        print("Archivo generado: master_songs.json")
        print("="*50)
        
    except Exception as e:
        print(f"\n[ERROR CRÍTICO]: {e}")
        print("Verifica que hayas compartido la carpeta de Drive con el correo de la Service Account.")

if __name__ == '__main__':
    ejecutar()