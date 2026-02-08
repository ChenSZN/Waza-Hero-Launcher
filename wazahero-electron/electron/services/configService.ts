import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')

export const configService = {
    get(key: string): any {
        if (!fs.existsSync(CONFIG_FILE)) return null
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
            return data[key]
        } catch {
            return null
        }
    },

    set(key: string, value: any): void {
        let data: any = {}
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
            } catch { }
        }
        data[key] = value
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2))
    }
}
