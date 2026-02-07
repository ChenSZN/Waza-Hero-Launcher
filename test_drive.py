import os
from googleapiclient.discovery import build
from google.oauth2 import service_account

# Configuración
SERVICE_ACCOUNT_FILE = 'kinetic-harbor-452218-s3-eca6819cec96.json' # El nombre del JSON que bajaste
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

def conectar_drive():
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    service = build('drive', 'v3', credentials=creds)
    
    # Listar los primeros 10 archivos para probar
    results = service.files().list(pageSize=10, fields="nextPageToken, files(id, name)").execute()
    items = results.get('files', [])

    if not items:
        print('No se encontraron archivos.')
    else:
        print('Archivos encontrados en Drive:')
        for item in items:
            print(f"{item['name']} ({item['id']})")

if __name__ == '__main__':
    conectar_drive()