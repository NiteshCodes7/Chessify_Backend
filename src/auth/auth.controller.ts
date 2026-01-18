/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  Req,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response, Request } from 'express';
import { getGoogleProfile } from './google';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccessGuard } from './guards/access.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(AccessGuard)
  @Get('me')
  async me(@Req() req) {
    const { userId } = req.user;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        rating: true,
        createdAt: true,
      },
    });

    return user;
  }

  @Post('register')
  async register(@Body() body, @Res() res: Response) {
    const { accessToken, refreshToken, wsToken } = await this.auth.register(
      body.email,
      body.password,
      body.name,
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.send({ accessToken, wsToken });
  }

  @Post('login')
  async login(@Body() body, @Res() res: Response) {
    const user = await this.auth.validateUser(body.email, body.password);
    const { accessToken, refreshToken, wsToken } = await this.auth.issueTokens(
      user.id,
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax', // for Production if having same domain can set lax or strict
      secure: false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.send({ accessToken, wsToken });
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies.refreshToken;
    if (!token) throw new UnauthorizedException('No refresh cookie');

    const { accessToken, refreshToken, wsToken } =
      await this.auth.refreshTokens(token);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.send({ accessToken, wsToken });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies.refreshToken;
    await this.auth.logout(token);
    res.clearCookie('refreshToken');
    return res.send({ ok: true });
  }

  // ------- GOOGLE OAUTH FLOW -------

  @Get('google')
  googleLogin() {
    const redirect = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_CALLBACK_URL}&response_type=code&scope=profile email`;
    return { redirect };
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Res() res: Response) {
    const profile = await getGoogleProfile(code);

    const { accessToken, refreshToken } = await this.auth.googleLogin(profile);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.send(
      `<script>window.opener.postMessage({accessToken: "${accessToken}"}, "*"); window.close();</script>`,
    );
  }
}
