import { Module } from '@nestjs/common';
import { GameModule } from './game/game.module';
import { MatchmakingService } from './matchmaking/matchmaking.service';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { GamePersistenceService } from './game-persistence/game-persistence.service';
import { GamePersistenceModule } from './game-persistence/game-persistence.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    GameModule,
    MatchmakingModule,
    GamePersistenceModule,
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
  ],
  providers: [MatchmakingService, GamePersistenceService],
})
export class AppModule {}
