import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccessGuard } from 'src/auth/guards/access.guard';
import { Request } from 'express';
import { GameEndReason } from '@prisma/client';
import { AuthService } from 'src/auth/auth.service';
import * as multer from 'multer';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

export interface RequestWithUser extends Request {
  user: {
    userId: string;
  };
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(AccessGuard)
  @Get('me/games')
  async getMyGames(@Req() req: RequestWithUser) {
    const userId = req.user.userId;

    const games = await this.prisma.game.findMany({
      where: {
        OR: [{ whiteId: userId }, { blackId: userId }],
      },
      include: {
        white: { select: { username: true, rating: true } },
        black: { select: { username: true, rating: true } },
        moves: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return games.map((g) => {
      const isWhite = g.whiteId === userId;
      const opponent = isWhite ? g.black : g.white;

      let result: 'win' | 'loss' | 'draw' = 'draw';

      if (g.result === 'DRAW') result = 'draw';
      else if (
        (g.result === 'WHITE_WIN' && isWhite) ||
        (g.result === 'BLACK_WIN' && !isWhite)
      ) {
        result = 'win';
      } else if (g.result !== 'ONGOING') {
        result = 'loss';
      }

      return {
        id: g.id,
        result,
        opponentUsername: opponent?.username ?? 'Unknown',
        opponentRating: opponent?.rating ?? 1200,
        myColor: isWhite ? 'white' : 'black',
        ratingChange: 0, // (add logic later)
        duration: g.endedAt
          ? Math.floor(
              (new Date(g.endedAt).getTime() -
                new Date(g.createdAt).getTime()) /
                1000,
            )
          : 0,
        moves: g.moves.length,
        endReason: g.endReason as GameEndReason,
        playedAt: g.createdAt,
      };
    });
  }

  @UseGuards(AccessGuard)
  @Patch('me')
  async updateProfile(
    @Req() req: RequestWithUser,
    @Body() body: { name?: string; username?: string; avatar?: string },
  ) {
    const userId = req.user.userId;

    let username: string | undefined;

    if (body.username !== undefined) {
      username = this.authService.validateUsername(body.username);

      const check = await this.authService.ensureUsernameAvailable(
        userId,
        username,
      );

      if (!check.available) {
        return {
          error: 'Username taken',
          suggestions: check.suggestions,
        };
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(username !== undefined && { username }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
      },
    });

    return updated;
  }

  @UseGuards(AccessGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async uploadAvatar(
    @Req() req: RequestWithUser,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const userId = req.user.userId;
    const url = await this.cloudinaryService.uploadAvatar(file, userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: url },
    });

    return { url };
  }

  @UseGuards(AccessGuard)
  @Delete('me/avatar')
  async deleteAvatar(@Req() req: RequestWithUser) {
    const userId = req.user.userId;

    await this.cloudinaryService.deleteAvatar(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
    });

    return { success: true };
  }
}
