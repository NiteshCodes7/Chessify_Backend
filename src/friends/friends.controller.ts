import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
  Delete,
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

  @Get('search')
  search(@Req() req: AuthRequest, @Query('q') q: string) {
    return this.friendsService.searchUsers(req.user.userId, q);
  }

  @Post('request')
  send(@Req() req: AuthRequest, @Body('identifier') identifier: string) {
    return this.friendsService.sendRequestByIdentifier(
      req.user.userId,
      identifier,
    );
  }

  @Post('accept/:id')
  accept(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.friendsService.acceptRequest(id, req.user.userId);
  }

  @Post('reject/:id')
  reject(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.friendsService.rejectRequest(id, req.user.userId);
  }

  @Get('requests')
  getPending(@Req() req: AuthRequest) {
    return this.friendsService.getPendingRequests(req.user.userId);
  }

  @Delete(':friendId')
  unfriend(@Req() req: AuthRequest, @Param('friendId') friendId: string) {
    return this.friendsService.unfriend(req.user.userId, friendId);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.friendsService.listFriends(req.user.userId);
  }
}
