import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { GamePersistenceModule } from '../game-persistence/game-persistence.module';
import { PresenceModule } from 'src/presence/presence.module';

@Module({
  imports: [GamePersistenceModule, PresenceModule],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
