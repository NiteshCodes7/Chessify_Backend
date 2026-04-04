import { forwardRef, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { PresenceGateway } from './presence.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { FriendsModule } from 'src/friends/friends.module';

@Module({
  imports: [AuthModule, forwardRef(() => FriendsModule)],
  providers: [PresenceService, PresenceGateway],
  exports: [PresenceGateway, PresenceService],
})
export class PresenceModule {}
