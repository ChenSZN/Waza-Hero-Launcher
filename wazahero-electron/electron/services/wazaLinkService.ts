import { io, Socket } from 'socket.io-client';
import { discordService } from './discordService';
import { socialService } from './socialService';

export interface GlobalActivity {
    user: string;
    discordId?: string;
    action: string;
    target: string;
    time: string;
    timestamp: number;
    avatar?: string;
}

class WazaLinkService {
    private socket: Socket | null = null;
    private readonly SERVER_URL = 'http://localhost:3000'; // Placeholder, user will deploy
    private isConnected = false;
    private onActivityCallback: ((activity: GlobalActivity) => void) | null = null;

    constructor() {
        console.log('[WAZA-LINK] Service initialized.');
    }

    public connect() {
        if (this.socket?.connected) return;

        console.log(`[WAZA-LINK] Connecting to ${this.SERVER_URL}...`);
        this.socket = io(this.SERVER_URL, {
            reconnectionAttempts: 5,
            timeout: 10000,
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log('[WAZA-LINK] Connected to Global Gateway');

            // Identify with Discord info
            const userData = (discordService as any).userData;
            if (userData) {
                this.socket?.emit('identify', {
                    username: userData.global_name || userData.username,
                    discordId: userData.id,
                    avatar: userData.avatar
                });
            }
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('[WAZA-LINK] Disconnected from Global Gateway');
        });

        this.socket.on('global_activity', (data: GlobalActivity) => {
            console.log('[WAZA-LINK] Global Activity Received:', data.user, data.action);
            if (this.onActivityCallback) {
                this.onActivityCallback(data);
            }
        });

        this.socket.on('connect_error', (err) => {
            console.error('[WAZA-LINK] Connection Error:', err.message);
        });
    }

    public onActivity(callback: (activity: GlobalActivity) => void) {
        this.onActivityCallback = callback;
    }

    public broadcastActivity(action: string, target: string) {
        if (!this.isConnected || !this.socket) return;

        const userData = (discordService as any).userData;
        const activity: GlobalActivity = {
            user: userData?.global_name || userData?.username || 'Usuario_Waza',
            discordId: userData?.id,
            avatar: userData?.avatar,
            action,
            target,
            time: 'ahora',
            timestamp: Date.now()
        };

        this.socket.emit('activity', activity);
    }

    public disconnect() {
        this.socket?.disconnect();
        this.isConnected = false;
    }
}

export const wazaLinkService = new WazaLinkService();
