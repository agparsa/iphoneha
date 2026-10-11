import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  addToCartSchema,
  applyCouponSchema,
  updateCartItemSchema,
  type CartDto,
  type AddToCartInput,
  type UpdateCartItemInput,
} from '@iphoneha/shared';
import { OptionalAuthGuard } from '../../common/guards';
import { ZodBody } from '../../common/zod-validation.pipe';
import { GUEST_CART_COOKIE } from '../../common/cookies';
import { setCookie } from '../../common/utils';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { Inject } from '@nestjs/common';
import { CartService, type CartContext, type CartResult } from './cart.service';

@ApiTags('cart')
@Controller('cart')
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(
    private readonly cart: CartService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private context(req: Request): CartContext {
    return {
      userId: req.authUser?.id ?? null,
      guestToken: (req.cookies?.[GUEST_CART_COOKIE] as string | undefined) ?? null,
    };
  }

  private respond(res: Response, result: CartResult): CartDto {
    if (result.newGuestToken) {
      setCookie(res, GUEST_CART_COOKIE, result.newGuestToken, {
        secure: this.config.COOKIE_SECURE,
        maxAgeMs: 30 * 24 * 3600 * 1000,
      });
    }
    return result.cart;
  }

  @Get()
  async get(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CartDto> {
    return this.respond(res, await this.cart.get(this.context(req)));
  }

  @Post()
  async add(
    @Body(new ZodBody(addToCartSchema)) body: AddToCartInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    return this.respond(res, await this.cart.addItem(this.context(req), body.variantId, body.quantity));
  }

  @Patch('items/:id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(updateCartItemSchema)) body: UpdateCartItemInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    return this.respond(res, await this.cart.updateItem(this.context(req), id, body.quantity));
  }

  @Delete('items/:id')
  async remove(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    return this.respond(res, await this.cart.removeItem(this.context(req), id));
  }

  @Delete()
  async clear(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CartDto> {
    return this.respond(res, await this.cart.clear(this.context(req)));
  }

  /** A coupon code is a secret of sorts: a handful of tries, not three hundred a minute. */
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  @Post('coupon')
  async applyCoupon(
    @Body(new ZodBody(applyCouponSchema)) body: { code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    return this.respond(res, await this.cart.applyCoupon(this.context(req), body.code));
  }

  @Delete('coupon')
  async removeCoupon(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CartDto> {
    return this.respond(res, await this.cart.removeCoupon(this.context(req)));
  }
}
