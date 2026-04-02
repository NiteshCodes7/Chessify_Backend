import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from 'src/auth/guards/access.guard';
import { ChatService } from './chat.service';

interface ChatControl extends Request {
  user: {
    userId: string;
  };
}

@Controller('chat')
@UseGuards(AccessGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':friendId')
  async getDM(@Req() req: ChatControl, @Param('friendId') friendId: string) {
    console.log('USER:', req.user.userId);
    console.log('FRIEND:', friendId);

    const data = await this.chatService.getDM(req.user.userId, friendId);
    console.log('DB RESULT:', data);

    return data;
  }
}
