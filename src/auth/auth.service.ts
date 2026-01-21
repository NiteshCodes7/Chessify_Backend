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
  async register(email: string, password: string, name?: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('Email in use');

    const hash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: { email, password: hash, name },
    });

    return this.issueTokens(user.id);
  }

  //LOGIN
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
      user = await this.prisma.user.create({
        data: {
          email,
          googleId: profile.id,
          name: profile.displayName,
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

    const refreshToken = randomUUID();
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const wsToken = await this.createWsToken(userId);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, wsToken };
  }

  // Create WS Token
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
    const tokens = await this.prisma.refreshToken.findMany();
    const match = tokens.find((rt) =>
      bcrypt.compareSync(refreshToken, rt.tokenHash),
    );
    if (!match) throw new UnauthorizedException('Invalid refresh token');

    return this.issueTokens(match.userId);
  }

  // LOGOUT
  async logout(refreshToken: string) {
    const tokens = await this.prisma.refreshToken.findMany();
    const match = tokens.find((rt) =>
      bcrypt.compareSync(refreshToken, rt.tokenHash),
    );
    if (!match) return;

    await this.prisma.refreshToken.delete({ where: { id: match.id } });
  }
}
