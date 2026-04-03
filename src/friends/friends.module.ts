import { forwardRef, Module } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { PresenceModule } from 'src/presence/presence.module';

@Module({
  imports: [forwardRef(() => PresenceModule)],
  exports: [FriendsService],
  providers: [FriendsService],
  controllers: [FriendsController],
})
export class FriendsModule {}
