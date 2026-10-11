import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  createCreditRequestSchema,
  type CreateCreditRequestInput,
  type CreditRequestCreatedDto,
} from '@iphoneha/shared';
import { OptionalAuthGuard } from '../../common/guards';
import { ZodBody } from '../../common/zod-validation.pipe';
import { CreditRequestsService } from './credit-requests.service';

@ApiTags('credit')
@Controller('credit-requests')
export class CreditRequestsController {
  constructor(private readonly requests: CreditRequestsService) {}

  /** «درخواست خرید قسطی با چک یا سفته». A few per visitor are plenty. */
  @Post()
  @HttpCode(201)
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @ApiOperation({ summary: 'Ask to buy with a Sayad cheque or a promissory note; the store calls back' })
  create(
    @Body(new ZodBody(createCreditRequestSchema)) body: CreateCreditRequestInput,
    @Req() req: Request,
  ): Promise<CreditRequestCreatedDto> {
    return this.requests.create(body, req.authUser?.id ?? null);
  }
}
