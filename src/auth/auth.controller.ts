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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response, Request } from 'express';
import { getGoogleProfile } from './google';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccessGuard } from './guards/access.guard';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite:
    process.env.NODE_ENV === 'production'
      ? ('none' as const)
      : ('lax' as const),
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60,
};

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  // ME
  @UseGuards(AccessGuard)
  @Get('me')
  async me(@Req() req) {
    const { userId } = req.user;
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatar: true,
        rating: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  // REGISTER
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() body) {
    return this.auth.register(
      body.email as string,
      body.password as string,
      body.name as string,
    );
  }

  // SET USERNAME
  @UseGuards(AccessGuard)
  @Post('set-username')
  setUsername(@Req() req, @Body('username') username: string) {
    return this.auth.setUsername(req.user.userId as string, username);
  }

  // Check if Username available
  @Get('check-username')
  async checkUsername(@Query('username') username: string) {
    return this.auth.checkUsername(username);
  }

  // VERIFY OTP
  @Post('verify-otp')
  async verifyOtp(@Body() body, @Res() res: Response) {
    const { accessToken, refreshToken, wsToken } = await this.auth.verifyOtp(
      body.email as string,
      body.otp as string,
    );

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    return res.send({ accessToken, wsToken });
  }

  // RESEND OTP
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() body) {
    await this.auth.sendOtp(body.email as string);
    return { message: 'OTP resent' };
  }

  // LOGIN
  @Post('login')
  async login(@Body() body, @Res() res: Response) {
    const user = await this.auth.validateUser(
      body.email as string,
      body.password as string,
    );
    const { accessToken, refreshToken, wsToken } = await this.auth.issueTokens(
      user.id,
    );

    const sessionToken = await this.auth.sessionToken(user.id);

    res.cookie('sessionToken', sessionToken, COOKIE_OPTIONS);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    return res.send({ accessToken, wsToken });
  }

  // FORGOT PASSWORD
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body) {
    await this.auth.sendPasswordResetOtp(body.email as string);
    return { message: 'OTP sent if account exists' };
  }

  // RESET PASSWORD
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body) {
    await this.auth.resetPassword(
      body.email as string,
      body.otp as string,
      body.newPassword as string,
    );
    return { message: 'Password reset successfully' };
  }

  // REFRESH
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new UnauthorizedException('Invalid request');
    }

    const token = req.cookies.refreshToken;
    if (!token) throw new UnauthorizedException('No refresh cookie');

    const { accessToken, refreshToken, wsToken } =
      await this.auth.refreshTokens(token as string);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    return res.send({ accessToken, wsToken });
  }

  // LOGOUT
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies.refreshToken;
    await this.auth.logout(token as string);
    res.clearCookie('refreshToken');
    return res.send({ ok: true });
  }

  // GOOGLE
  @Get('google')
  googleLogin() {
    const redirect = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_CALLBACK_URL}&response_type=code&scope=profile email`;
    return { redirect };
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Res() res: Response) {
    const profile = await getGoogleProfile(code);

    const { accessToken, refreshToken, wsToken } =
      await this.auth.googleLogin(profile);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.send(`
    <script>
      window.opener.postMessage(
        {
          accessToken: "${accessToken}",
          wsToken: "${wsToken}"
        },
        "${process.env.FRONTEND_URL || 'http://localhost:3000'}"
      );
      window.close();
    </script>
  `);
  }
}
