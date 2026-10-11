import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { MyContractDto } from '@iphoneha/shared';
import { AuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../types/express';
import { LedgerService } from './ledger.service';

/**
 * The customer's instalment booklets (دفترچهٔ اقساط) in their account: the
 * contracts written for their account or for the mobile they signed in with
 * (an OTP proved they own it), cancelled ones left out.
 */
@ApiTags('users')
@Controller('users/me/installments')
@UseGuards(AuthGuard)
export class MyInstallmentsController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<MyContractDto[]> {
    return this.ledger.mine(user.id, user.phone);
  }

  @Get(':number')
  get(@CurrentUser() user: AuthUser, @Param('number') number: string): Promise<MyContractDto> {
    return this.ledger.mineByNumber(user.id, user.phone, /^\d{1,9}$/.test(number) ? Number(number) : NaN);
  }
}
