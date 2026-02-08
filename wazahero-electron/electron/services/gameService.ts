import { spawn } from 'node:child_process'
import fs from 'node:fs'

export const gameService = {
    launch(exePath: string) {
        if (!exePath || !fs.existsSync(exePath)) {
            throw new Error('Ejecutable no encontrado')
        }

        try {
            const child = spawn(exePath, [], {
                detached: true,
                stdio: 'ignore'
            })
            child.unref()
            return true
        } catch (e) {
            console.error('[ERR] Game launch failed:', e)
            throw e
        }
    }
}
