import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RatingService {
  constructor(private readonly prisma: PrismaService) {}

  K = 32;

  private expectedScore(rA: number, rB: number): number {
    return 1 / (1 + Math.pow(10, (rB - rA) / 400));
  }

  async updateRatings(gameId: string, winner: 'white' | 'black' | 'draw') {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { white: true, black: true },
    });

    if (!game || !game.white || !game.black) return;

    const Ra = game.white.rating;
    const Rb = game.black.rating;

    const Ea = this.expectedScore(Ra, Rb);
    const Eb = this.expectedScore(Rb, Ra);

    let Sa, Sb;

    if (winner === 'white') {
      Sa = 1;
      Sb = 0;
    } else if (winner === 'black') {
      Sa = 0;
      Sb = 1;
    } else {
      Sa = 0.5;
      Sb = 0.5;
    }

    const newRa = Math.round(Ra + this.K * (Sa - Ea));
    const newRb = Math.round(Rb + this.K * (Sb - Eb));

    await this.prisma.user.update({
      where: { id: game.whiteId! },
      data: { rating: newRa },
    });

    await this.prisma.user.update({
      where: { id: game.blackId! },
      data: { rating: newRb },
    });

    return { newRa, newRb };
  }
}
