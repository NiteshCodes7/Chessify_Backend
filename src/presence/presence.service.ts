import { Injectable } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class PresenceService {
  private redis = createClient();

  constructor() {
    this.redis.connect().catch(console.error);
  }

  async setStatus(userId: string, status: 'online' | 'playing' | 'offline') {
    try {
      const data: { status: string; lastSeen?: string } = { status };
      if (status === 'offline') {
        data.lastSeen = Date.now().toString();
      }
      await this.redis.hSet(`presence:${userId}`, data);
    } catch (err) {
      console.error('Redis error:', err);
    }
  }

  async getStatus(userId: string) {
    const data = await this.redis.hGetAll(`presence:${userId}`);
    return {
      status: (data.status as 'online' | 'playing' | 'offline') || 'offline',
      lastSeen: data.lastSeen || null,
    };
  }

  async isUserOnline(userId: string) {
    const data = await this.redis.hGet(`presence:${userId}`, 'status');
    return data === 'online' || data === 'playing';
  }
}
