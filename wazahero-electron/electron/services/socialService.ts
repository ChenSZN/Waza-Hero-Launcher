import { configService } from './configService';
import { wazaLinkService } from './wazaLinkService';

export interface Friend {
    id: string;
    name: string;
    avatar: string | null;
    status: string;
    song: string | null;
    icon: string;
}

export interface ActivityEvent {
    user: string;
    action: string;
    target: string;
    time: string;
    timestamp: number;
}

class SocialService {
    private readonly MAX_ACTIVITY_LOGS = 20;

    public getFriends(): Friend[] {
        return configService.get('social_friends') || [];
    }

    public addFriend(friend: Omit<Friend, 'status' | 'song'>): void {
        const friends = this.getFriends();
        const newFriend: Friend = {
            ...friend,
            status: 'Desconectado',
            song: null
        };

        if (!friends.find(f => f.id === friend.id)) {
            friends.push(newFriend);
            configService.set('social_friends', friends);
        }
    }

    public removeFriend(id: string): void {
        const friends = this.getFriends();
        const filtered = friends.filter(f => f.id !== id);
        configService.set('social_friends', filtered);
    }

    public getActivityLog(): ActivityEvent[] {
        return configService.get('local_activity') || [];
    }

    public logActivity(action: string, target: string, user: string = 'Tú'): void {
        const logs = this.getActivityLog();
        const newEvent: ActivityEvent = {
            user,
            action,
            target,
            time: 'ahora',
            timestamp: Date.now()
        };

        logs.unshift(newEvent);

        // Keep only the last N logs
        if (logs.length > this.MAX_ACTIVITY_LOGS) {
            logs.length = this.MAX_ACTIVITY_LOGS;
        }

        configService.set('local_activity', logs);

        // Broadcast to Global Waza Link
        if (user === 'Tú') {
            wazaLinkService.broadcastActivity(action, target);
        }
    }

    // Process timestamps to human readable relative time (simplified)
    public getFormattedActivity(): ActivityEvent[] {
        const logs = this.getActivityLog();
        const now = Date.now();

        return logs.map(log => {
            const diffMin = Math.floor((now - log.timestamp) / 60000);
            let timeStr = 'hace un momento';

            if (diffMin >= 60) {
                const diffHours = Math.floor(diffMin / 60);
                timeStr = `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
            } else if (diffMin > 0) {
                timeStr = `hace ${diffMin} ${diffMin === 1 ? 'min' : 'min'}`;
            }

            return { ...log, time: timeStr };
        });
    }
}

export const socialService = new SocialService();
