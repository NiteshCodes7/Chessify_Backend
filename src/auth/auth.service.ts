/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // REGISTER
  async register(email: string, password: string, name: string) {
    const emailExists = await this.prisma.user.findUnique({ where: { email } });
    if (emailExists) throw new BadRequestException('Email already in use');

    const hash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: { email, password: hash, name },
    });

    return this.issueTokens(user.id);
  }

  // set usernaame
  async setUsername(userId: string, username: string) {
    // validate format
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new BadRequestException('Invalid username format');
    }

    const exists = await this.prisma.user.findUnique({
      where: { username },
    });

    if (exists) {
      throw new BadRequestException('Username already taken');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { username },
    });
  }

  // LOGIN
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid login');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid login');

    return user;
  }

  // GOOGLE AUTH
  async googleLogin(profile: any) {
    const email = profile.emails[0].value;
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Derive a unique username from the Google display name
      const base = profile.displayName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 20);

      let username = base;
      let suffix = 1;
      while (await this.prisma.user.findUnique({ where: { username } })) {
        username = `${base}_${suffix++}`;
      }

      user = await this.prisma.user.create({
        data: {
          email,
          googleId: profile.id,
          name: profile.displayName,
          username,
          avatar: profile.photos[0].value,
        },
      });
    }

    return this.issueTokens(user.id);
  }

  // CREATE TOKENS
  async issueTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: '10m' },
    );

    const tokenId = randomUUID();
    const rawToken = randomUUID();
    const fullToken = `${tokenId}.${rawToken}`;

    const tokenHash = await bcrypt.hash(rawToken, 10);

    const wsToken = await this.createWsToken(userId);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: fullToken, wsToken };
  }

  // CREATE WS TOKEN
  async createWsToken(userId: string) {
    return await this.jwt.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_WS_SECRET!,
        expiresIn: '12h',
      },
    );
  }

  // REFRESH TOKENS
  async refreshTokens(refreshToken: string) {
    const [tokenId, rawToken] = refreshToken.split('.');

    if (!tokenId || !rawToken) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: tokenId } });
      throw new UnauthorizedException('Refresh token expired');
    }

    const isValid = await bcrypt.compare(rawToken, record.tokenHash);
    if (!isValid) {
      // Token reuse detected — revoke all sessions
      await this.prisma.refreshToken.deleteMany({
        where: { userId: record.userId },
      });
      throw new UnauthorizedException('Token reuse detected');
    }

    return this.issueTokens(record.userId);
  }

  // LOGOUT
  async logout(refreshToken: string) {
    const [tokenId] = refreshToken.split('.');
    if (!tokenId) return;

    await this.prisma.refreshToken
      .delete({ where: { id: tokenId } })
      .catch(() => {});
  }
}
