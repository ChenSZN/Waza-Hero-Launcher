import { google } from 'googleapis'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

export class DownloadService {
    private oauth2Client: any
    private drive: any

    async authenticate(credentialsPath: string, tokenPath: string): Promise<void> {
        // Load client secrets
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web

        this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

        // Check if we have previously stored a token
        if (fs.existsSync(tokenPath)) {
            const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
            this.oauth2Client.setCredentials(token)
        } else {
            // Get new token
            await this.getNewToken(tokenPath)
        }

        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
    }

    private async getNewToken(tokenPath: string): Promise<void> {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        })

        return new Promise((resolve, reject) => {
            // Create auth window
            const authWindow = new BrowserWindow({
                width: 500,
                height: 600,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            })

            authWindow.loadURL(authUrl)

            // Listen for redirect
            authWindow.webContents.on('will-redirect', async (event, url) => {
                if (url.startsWith('http://localhost')) {
                    event.preventDefault()

                    const urlParams = new URL(url).searchParams
                    const code = urlParams.get('code')

                    if (code) {
                        try {
                            const { tokens } = await this.oauth2Client.getToken(code)
                            this.oauth2Client.setCredentials(tokens)

                            // Store the token
                            fs.writeFileSync(tokenPath, JSON.stringify(tokens))

                            authWindow.close()
                            resolve()
                        } catch (error) {
                            authWindow.close()
                            reject(error)
                        }
                    }
                }
            })

            authWindow.on('closed', () => {
                reject(new Error('Auth window closed'))
            })
        })
    }

    async downloadFile(
        fileId: string,
        destPath: string,
        onProgress?: (bytes: number, total: number) => void
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                // Get file metadata for size
                const metadata = await this.drive.files.get({
                    fileId: fileId,
                    fields: 'size'
                })
                const totalSize = parseInt(metadata.data.size || '0')

                // Download file
                const dest = fs.createWriteStream(destPath)
                let downloadedBytes = 0

                const response = await this.drive.files.get(
                    { fileId: fileId, alt: 'media' },
                    { responseType: 'stream' }
                )

                response.data
                    .on('data', (chunk: Buffer) => {
                        downloadedBytes += chunk.length
                        if (onProgress) {
                            onProgress(downloadedBytes, totalSize)
                        }
                    })
                    .on('end', () => {
                        resolve()
                    })
                    .on('error', (err: Error) => {
                        reject(err)
                    })
                    .pipe(dest)
            } catch (error) {
                reject(error)
            }
        })
    }

    async downloadSong(
        song: any,
        songsPath: string,
        withVideo: boolean,
        onProgress?: (percent: number, bytesDownloaded: number, fileId: string) => void
    ): Promise<void> {
        const songPath = path.join(songsPath, song.full_path)

        // Create directory if it doesn't exist
        if (!fs.existsSync(songPath)) {
            fs.mkdirSync(songPath, { recursive: true })
        }

        const files = song.files || []
        const filesToDownload = withVideo
            ? files
            : files.filter((f: any) => !f.nombre.toLowerCase().includes('video'))

        let completed = 0
        let totalDownloadedInSong = 0
        const totalFiles = filesToDownload.length

        // Track individual file progress for overall song progress
        const fileProgresses = new Map<string, number>()

        // Parallel download with concurrency limit of 3
        const concurrencyLimit = 3
        for (let i = 0; i < filesToDownload.length; i += concurrencyLimit) {
            const chunk = filesToDownload.slice(i, i + concurrencyLimit)
            await Promise.all(chunk.map(async (file: any) => {
                const destPath = path.join(songPath, file.nombre)
                await this.downloadFile(file.id_drive, destPath, (bytes, fileTotal) => {
                    const fileProgress = bytes / (fileTotal || 1)
                    fileProgresses.set(file.id_drive, fileProgress)

                    // Calculate overall song progress based on individual file percentages
                    let songPercentSum = 0
                    fileProgresses.forEach(p => songPercentSum += p)
                    // Note: This is an approximation since we don't know total song size in bytes easily without metadata calls for ALL files first
                    const overallSongPercent = (completed + (songPercentSum / chunk.length)) / totalFiles

                    if (onProgress) {
                        onProgress(overallSongPercent, bytes, file.id_drive)
                    }
                })
                completed++
                fileProgresses.delete(file.id_drive) // Clean up
            }))
        }
    }
}

export const downloadService = new DownloadService()
