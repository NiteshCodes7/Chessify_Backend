import { Controller, Get } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('rating')
export class RatingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leaderboard')
  getTopPlayers() {
    return this.prisma.user.findMany({
      orderBy: { rating: 'desc' },
      take: 100,
      select: { id: true, name: true, rating: true },
    });
  }
}
