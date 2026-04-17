import { Module } from '@nestjs/common';
import { GameModule } from './game/game.module';
import { MatchmakingService } from './matchmaking/matchmaking.service';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { GamePersistenceService } from './game-persistence/game-persistence.service';
import { GamePersistenceModule } from './game-persistence/game-persistence.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { RatingService } from './rating/rating.service';
import { RatingController } from './rating/rating.controller';
import { RatingModule } from './rating/rating.module';
import { PresenceModule } from './presence/presence.module';
import { FriendsService } from './friends/friends.service';
import { FriendsModule } from './friends/friends.module';
import { ChatService } from './chat/chat.service';
import { ChatModule } from './chat/chat.module';
import { MailModule } from './mail/mail.module';
import { UsersController } from './users/users.controller';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import { CloudinaryModule } from './cloudinary/cloudinary.module';

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
    RatingModule,
    PresenceModule,
    FriendsModule,
    ChatModule,
    MailModule,
    UsersModule,
    LeaderboardModule,
    CloudinaryModule,
  ],
  providers: [
    MatchmakingService,
    GamePersistenceService,
    RatingService,
    FriendsService,
    ChatService,
    AppService,
    CloudinaryService,
  ],
  controllers: [RatingController, UsersController, AppController],
})
export class AppModule {}
