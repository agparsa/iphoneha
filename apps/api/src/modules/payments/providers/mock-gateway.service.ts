import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { formatToman } from '@iphoneha/shared';
import { REDIS_CLIENT } from '../../../infra/redis/redis.constants';
import { randomToken } from '../../../common/utils';
import { Errors } from '../../../common/errors';

export type MockSessionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface MockSession {
  token: string;
  paymentId: string;
  providerCode: string;
  providerName: string;
  brandColor: string;
  orderNumber: string;
  amount: number;
  callbackUrl: string;
  status: MockSessionStatus;
  trackingCode: string | null;
  /** Installment summary shown on the mock page */
  installment: { downPayment: number; months: number; monthly: number } | null;
  createdAt: string;
}

const TTL_SECONDS = 2 * 60 * 60;

/**
 * Local stand-in for a real payment gateway: it keeps a session in Redis and
 * serves a page where the tester approves, declines or cancels the payment.
 * The flow (redirect → callback → server-side verify) matches a real gateway,
 * so swapping in a live client changes nothing else.
 */
@Injectable()
export class MockGatewayService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(token: string): string {
    return `mockpay:${token}`;
  }

  async create(
    session: Omit<MockSession, 'token' | 'status' | 'trackingCode' | 'createdAt'>,
  ): Promise<MockSession> {
    const token = randomToken(18);
    const record: MockSession = {
      ...session,
      token,
      status: 'PENDING',
      trackingCode: null,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(this.key(token), JSON.stringify(record), 'EX', TTL_SECONDS);
    return record;
  }

  async get(token: string): Promise<MockSession | null> {
    const raw = await this.redis.get(this.key(token));
    return raw ? (JSON.parse(raw) as MockSession) : null;
  }

  async getOrThrow(token: string): Promise<MockSession> {
    const session = await this.get(token);
    if (!session) throw Errors.notFound('این تراکنش آزمایشی پیدا نشد یا منقضی شده است');
    return session;
  }

  async complete(token: string, status: Exclude<MockSessionStatus, 'PENDING'>): Promise<MockSession> {
    const session = await this.getOrThrow(token);
    if (session.status === 'PENDING') {
      session.status = status;
      session.trackingCode = status === 'SUCCESS' ? `MOCK${Date.now().toString().slice(-10)}` : null;
      await this.redis.set(this.key(token), JSON.stringify(session), 'EX', TTL_SECONDS);
    }
    return session;
  }

  async markRefunded(token: string): Promise<void> {
    const session = await this.get(token);
    if (!session) return;
    session.status = 'REFUNDED';
    await this.redis.set(this.key(token), JSON.stringify(session), 'EX', TTL_SECONDS);
  }

  /** Minimal, self-contained HTML for the fake gateway page. */
  renderPage(session: MockSession, basePath: string): string {
    const rows = [
      ['شماره سفارش', session.orderNumber],
      ['مبلغ قابل پرداخت', formatToman(session.amount)],
      ...(session.installment
        ? ([
            ['پیش‌پرداخت', formatToman(session.installment.downPayment)],
            ['تعداد اقساط', `${session.installment.months} قسط`],
            ['قسط ماهانه', formatToman(session.installment.monthly)],
          ] as [string, string][])
        : []),
    ];
    const done = session.status !== 'PENDING';
    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>درگاه آزمایشی ${session.providerName}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f7;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#08090a;padding:16px}
  .card{width:min(420px,100%);background:#fff;border:1px solid rgba(12,16,24,.08);border-radius:20px;overflow:hidden}
  .head{padding:18px 20px;color:#fff;background:${session.brandColor};display:flex;justify-content:space-between;align-items:center}
  .head strong{font-size:15px}
  .head span{font-size:11px;opacity:.85}
  .body{padding:20px}
  .row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(12,16,24,.06);font-size:13px}
  .row:last-child{border-bottom:0}
  .row span{color:#63676e}
  .row b{font-weight:600}
  .actions{display:grid;gap:9px;margin-top:18px}
  button{height:46px;border-radius:12px;border:0;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
  .ok{background:#0f9d6a;color:#fff}
  .fail{background:#fff;color:#c2273c;border:1px solid rgba(194,39,60,.35)}
  .cancel{background:rgba(12,16,24,.05);color:#43464b}
  .note{margin-top:14px;font-size:11px;color:#8b8f96;line-height:1.9;text-align:center}
  .done{padding:28px 20px;text-align:center;font-size:14px}
</style>
</head>
<body>
  <div class="card">
    <div class="head"><strong>${session.providerName}</strong><span>درگاه آزمایشی</span></div>
    ${
      done
        ? `<div class="done">وضعیت این تراکنش قبلاً ثبت شده است (${session.status}).<br/>می‌توانید این صفحه را ببندید.</div>`
        : `<div class="body">
      ${rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('')}
      <form class="actions" method="post" action="${basePath}/${session.token}/complete">
        <button class="ok" name="result" value="SUCCESS" type="submit">پرداخت موفق</button>
        <button class="fail" name="result" value="FAILED" type="submit">پرداخت ناموفق</button>
        <button class="cancel" name="result" value="CANCELLED" type="submit">انصراف از پرداخت</button>
      </form>
      <p class="note">این صفحه شبیه‌ساز درگاه است و هیچ تراکنش واقعی انجام نمی‌دهد.<br/>برای اتصال درگاه واقعی، کلاینت سرویس را جایگزین کنید.</p>
    </div>`
    }
  </div>
</body>
</html>`;
  }
}
