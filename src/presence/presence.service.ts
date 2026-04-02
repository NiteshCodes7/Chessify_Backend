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
      await this.redis.hSet(`presence:${userId}`, {
        status,
        lastSeen: Date.now().toString(),
      });
    } catch (err) {
      console.error('Redis error:', err);
    }
  }

  async getStatus(userId: string) {
    return this.redis.hGetAll(`presence:${userId}`);
  }

  async isUserOnline(userId: string) {
    const data = await this.redis.hGet(`presence:${userId}`, 'status');
    return data === 'online' || data === 'playing';
  }
}
