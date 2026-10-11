import { randomBytes } from 'node:crypto';
import { All, Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createPaymentSchema,
  verifyPaymentSchema,
  type InstallmentTerms,
  type PaymentMethodOptionDto,
  type PaymentResultDto,
} from '@iphoneha/shared';
import { AuthGuard } from '../../common/guards';
import { CurrentUser, SkipCsrf } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import { Errors } from '../../common/errors';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { Inject } from '@nestjs/common';
import type { AuthUser } from '../../types/express';
import { clientIp } from '../../common/utils/http.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './provider-registry.service';
import { MockGatewayService } from './providers/mock-gateway.service';
import { redirectFormCsp, renderRedirectForm } from './redirect-form.page';

const amountQuerySchema = z.object({ amount: z.coerce.number().int().min(0).max(10_000_000_000).default(0) });
const mockResultSchema = z.object({ result: z.enum(['SUCCESS', 'FAILED', 'CANCELLED']) });

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly gateway: MockGatewayService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Payment options with eligibility for a given basket amount. */
  @Get('methods')
  methods(
    @Query(new ZodQuery(amountQuerySchema)) query: { amount: number },
  ): Promise<PaymentMethodOptionDto[]> {
    return this.registry.options(query.amount);
  }

  @Get('installment-terms')
  terms(): Promise<InstallmentTerms[]> {
    return this.registry.installmentTerms();
  }

  @UseGuards(AuthGuard)
  @Post('create')
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(createPaymentSchema))
    body: { orderId: string; method?: PaymentMethodOptionDto['method'] },
    @Req() req: Request,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: body.orderId, userId: user.id },
      include: { items: true },
    });
    if (!order) throw Errors.notFound('سفارش پیدا نشد');
    return this.payments.createForOrder(order, body.method, { customerIp: clientIp(req) });
  }

  /** The bridge into a gateway entered by POST (Tara): posts the form kept on the payment. */
  @SkipCsrf()
  @Get('go/:paymentId')
  async go(@Param('paymentId') paymentId: string, @Res() res: Response): Promise<void> {
    const page = await this.payments.redirectFormFor(paymentId);
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', redirectFormCsp(page.form, nonce));
    res
      .status(page.expired ? 410 : 200)
      .type('html')
      .send(renderRedirectForm({ ...page, nonce, storeUrl: this.config.WEB_URL.replace(/\/$/, '') }));
  }

  @UseGuards(AuthGuard)
  @Post('verify')
  async verify(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(verifyPaymentSchema)) body: { paymentId: string },
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: body.paymentId, order: { userId: user.id } },
      select: { id: true },
    });
    if (!payment) throw Errors.notFound('تراکنش پیدا نشد');
    return this.payments.verifyAndFinalize(body.paymentId);
  }

  @UseGuards(AuthGuard)
  @Get('result/:orderNumber')
  result(
    @CurrentUser() user: AuthUser,
    @Param('orderNumber') orderNumber: string,
  ): Promise<PaymentResultDto> {
    return this.payments.resultFor(orderNumber, user.id);
  }

  /** Where every gateway sends the customer back. Verification happens server-side. */
  @SkipCsrf()
  @All('callback/:provider/:paymentId')
  async callback(
    @Param('provider') provider: string,
    @Param('paymentId') paymentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const query = {
      ...(req.query as Record<string, unknown>),
      ...((req.body as Record<string, unknown>) ?? {}),
    };
    const { redirectUrl } = await this.payments.handleCallback(provider, paymentId, query);
    res.redirect(302, redirectUrl);
  }

  // ─── Mock gateway (development / tests) ────────────────────────────────────

  @SkipCsrf()
  @Get('mock/:token')
  async mockPage(@Param('token') token: string, @Res() res: Response): Promise<void> {
    this.assertMockAllowed();
    const session = await this.gateway.getOrThrow(token);
    // a page of its own: inline styles, and a form back to this API
    res.setHeader(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.type('html').send(this.gateway.renderPage(session, `${this.config.publicApiUrl}/payments/mock`));
  }

  @SkipCsrf()
  @Post('mock/:token/complete')
  async mockComplete(
    @Param('token') token: string,
    @Body(new ZodBody(mockResultSchema)) body: { result: 'SUCCESS' | 'FAILED' | 'CANCELLED' },
    @Res() res: Response,
  ): Promise<void> {
    this.assertMockAllowed();
    const session = await this.gateway.complete(token, body.result);
    const url = new URL(session.callbackUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('status', body.result === 'SUCCESS' ? 'OK' : 'NOK');
    res.redirect(302, url.toString());
  }

  /** The mock gateway approves payments without money: it must not exist where mocks are off. */
  private assertMockAllowed(): void {
    if (!this.config.allowMockPayments) throw Errors.notFound('صفحه پیدا نشد');
  }
}
