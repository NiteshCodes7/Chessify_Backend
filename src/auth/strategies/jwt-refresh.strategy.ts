/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy, StrategyOptionsWithRequest } from 'passport-jwt';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: (req: Request) => req?.cookies?.refreshToken as string,
      secretOrKey: process.env.JWT_REFRESH_SECRET,
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  validate(req: Request, payload: { sub: string }) {
    const refreshToken = req.cookies?.refreshToken as string;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    return { userId: payload.sub, refreshToken };
  }
}
