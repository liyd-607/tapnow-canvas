import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('credits')
export class CreditsController {
  constructor(private creditsService: CreditsService) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  balance(@CurrentUser() user: any) {
    return this.creditsService.getBalance(user.userId);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  transactions(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.creditsService.getTransactions(
      user.userId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
  }
}
