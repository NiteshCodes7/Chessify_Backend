import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { GamePersistenceModule } from '../game-persistence/game-persistence.module';
import { GameController } from './game.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule, JwtModule, MatchmakingModule, GamePersistenceModule],
  providers: [GameGateway],
  controllers: [GameController],
})
export class GameModule {}
