import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { JwtService } from '@nestjs/jwt';

@Module({
  providers: [ChatGateway, ChatService, JwtService],
  controllers: [ChatController],
})
export class ChatModule {}
