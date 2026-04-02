import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { AccessGuard } from 'src/auth/guards/access.guard';

interface AuthRequest extends Request {
  user: {
    userId: string;
  };
}

@Controller('friends')
@UseGuards(AccessGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('request')
  send(@Req() req: AuthRequest, @Body('email') email: string) {
    return this.friendsService.sendRequestByEmail(req.user.userId, email);
  }

  @Post('accept/:id')
  accept(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.friendsService.acceptRequest(id, req.user.userId);
  }

  @Get('requests')
  getPending(@Req() req: AuthRequest) {
    return this.friendsService.getPendingRequests(req.user.userId);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.friendsService.listFriends(req.user.userId);
  }
}
