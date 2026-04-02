import { Module } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';

@Module({
  exports: [FriendsService],
  providers: [FriendsService],
  controllers: [FriendsController],
})
export class FriendsModule {}
