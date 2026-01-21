import { Module } from '@nestjs/common';
import { RatingService } from './rating.service';

@Module({
  exports: [RatingModule],
  providers: [RatingService],
})
export class RatingModule {}
