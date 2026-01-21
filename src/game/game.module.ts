import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { GamePersistenceModule } from '../game-persistence/game-persistence.module';
import { GameController } from './game.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from 'src/auth/auth.module';
import { RatingModule } from 'src/rating/rating.module';
import { RatingService } from 'src/rating/rating.service';

@Module({
  imports: [
    AuthModule,
    JwtModule,
    MatchmakingModule,
    GamePersistenceModule,
    RatingModule,
  ],
  providers: [GameGateway, RatingService],
  controllers: [GameController],
})
export class GameModule {}
