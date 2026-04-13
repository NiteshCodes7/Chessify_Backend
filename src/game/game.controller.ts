import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';
import { AccessGuard } from 'src/auth/guards/access.guard';

@Controller('game')
@UseGuards(AccessGuard)
export class GameController {
  constructor(private readonly gamePersistence: GamePersistenceService) {}

  @Get()
  getAllGames(@Req() req: { user: { userId: string } }) {
    return this.gamePersistence.getAllGames(req.user.userId);
  }

  @Get(':id')
  getGame(@Param('id') id: string) {
    return this.gamePersistence.getGame(id);
  }
}
