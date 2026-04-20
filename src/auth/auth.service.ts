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
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
  ) {}

  // REGISTER
  async register(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.isVerified) {
        throw new BadRequestException('Email already in use');
      }

      // Not verified → delete old user + related data
      await this.prisma.$transaction([
        this.prisma.otp.deleteMany({ where: { userId: existing.id } }),
        this.prisma.refreshToken.deleteMany({ where: { userId: existing.id } }),
        this.prisma.user.delete({ where: { id: existing.id } }),
      ]);
    }

    const hash = await bcrypt.hash(password, 10);

    await this.prisma.user.create({
      data: {
        email,
        password: hash,
        name,
        isVerified: false,
      },
    });

    await this.sendOtp(email);

    return { message: 'OTP sent to email' };
  }

  // SET USERNAME
  async setUsername(userId: string, username: string) {
    if (!username) {
      throw new BadRequestException('Username is required');
    }

    username = username.toLowerCase();

    const isValid = /^[a-z0-9_]{3,20}$/.test(username);
    if (!isValid) {
      throw new BadRequestException(
        'Username must be 3-20 characters, lowercase, letters, numbers, underscores only',
      );
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new BadRequestException('User not found');
    }

    if (currentUser.username) {
      throw new BadRequestException('Username already set');
    }

    const exists = await this.prisma.user.findUnique({
      where: { username },
    });

    if (exists) {
      const suggestions: string[] = [];
      let suffix = 1;

      while (suggestions.length < 5) {
        const newUsername = `${username}_${suffix}`;

        const exists = await this.prisma.user.findUnique({
          where: { username: newUsername },
        });

        if (!exists) {
          suggestions.push(newUsername);
        }

        suffix++;
      }

      return {
        message: 'Username taken',
        suggestions,
      };
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { username },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
      },
    });

    return {
      message: 'Username set successfully',
      user: updatedUser,
    };
  }

  // Check username while typing (Debouncing)
  async checkUsername(username: string) {
    if (!username) return { available: false };

    username = username.toLowerCase();

    const exists = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!exists) {
      return { available: true };
    }

    const suggestions: string[] = [];
    let suffix = 1;

    while (suggestions.length < 5 && suffix < 100) {
      const candidate = `${username}_${suffix}`;

      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
      });

      if (!taken) suggestions.push(candidate);

      suffix++;
    }

    return {
      available: false,
      suggestions,
    };
  }

  // SEND OTP
  async sendOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('No account found for this email');

    await this.prisma.otp.deleteMany({ where: { userId: user.id } });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);

    await this.prisma.otp.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.mail.sendOtp(email, code);
  }

  // VERIFY OTP
  async verifyOtp(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('No account found');

    const otpRecord = await this.prisma.otp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) throw new BadRequestException('No OTP found');

    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.otp.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP expired');
    }

    const isValid = await bcrypt.compare(code, otpRecord.codeHash);
    if (!isValid) throw new BadRequestException('Incorrect OTP');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    await this.prisma.otp.delete({ where: { id: otpRecord.id } });

    return this.issueTokens(user.id);
  }

  // SEND PASSWORD RESET OTP
  async sendPasswordResetOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.otp.deleteMany({ where: { userId: user.id } });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);

    await this.prisma.otp.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.mail.sendOtp(email, code);
  }

  // RESET PASSWORD
  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('No account found');

    const otpRecord = await this.prisma.otp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) throw new BadRequestException('No OTP found');

    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.otp.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP expired');
    }

    const isValid = await bcrypt.compare(code, otpRecord.codeHash);
    if (!isValid) throw new BadRequestException('Incorrect OTP');

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    await this.prisma.otp.delete({ where: { id: otpRecord.id } });

    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  }

  // LOGIN
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid login');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid login');

    if (!user.isVerified) {
      await this.sendOtp(email);
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    return user;
  }

  // ISSUE TOKENS
  async issueTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: '10m' },
    );

    const sessionToken = await this.sessionToken(userId);

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

    return { accessToken, refreshToken: fullToken, sessionToken, wsToken };
  }

  // Session Token
  async sessionToken(userId: string) {
    const sessionToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: '7d' },
    );

    return sessionToken;
  }

  // WS TOKEN
  async createWsToken(userId: string) {
    return this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_WS_SECRET!, expiresIn: '1h' },
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

    if (!record) throw new UnauthorizedException('Invalid refresh token');

    if (record.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: tokenId } });
      throw new UnauthorizedException('Refresh token expired');
    }

    const isValid = await bcrypt.compare(rawToken, record.tokenHash);

    if (!isValid) {
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

  // Username validation for updation
  validateUsername(username: string) {
    const normalized = username.toLowerCase().trim();

    const isValid = /^[a-z0-9_]{3,20}$/.test(normalized);

    if (!isValid) {
      throw new BadRequestException(
        'Username must be 3-20 characters, lowercase, letters, numbers, underscores only',
      );
    }

    return normalized;
  }

  // Username available for updation
  async ensureUsernameAvailable(userId: string, username: string) {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!existing || existing.id === userId) {
      return { available: true };
    }

    const suggestions: string[] = [];
    let suffix = 1;

    while (suggestions.length < 5) {
      const candidate = `${username}_${suffix}`;

      const exists = await this.prisma.user.findUnique({
        where: { username: candidate },
      });

      if (!exists) suggestions.push(candidate);

      suffix++;
    }

    return {
      available: false,
      suggestions,
    };
  }

  // GOOGLE AUTH
  async googleLogin(profile: any) {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new BadRequestException('Google account email not found');
    }

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    // New user from Google
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          googleId: profile.id,
          name: profile.displayName || '',
          avatar: profile.photos?.[0]?.value || null,
          isVerified: true,
          username: null,
        },
      });
    }

    // Existing user signed up earlier with email/password
    else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.id,
          avatar: user.avatar || profile.photos?.[0]?.value || null,
          isVerified: true,
        },
      });
    }

    const tokens = await this.issueTokens(user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatar: user.avatar,
      },
      needsUsername: !user.username,
    };
  }
}
