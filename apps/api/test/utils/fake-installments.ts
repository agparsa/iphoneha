/**
 * Fakes of SnappPay, Tara, DigiPay, Bajet and AzkiVam as the store sees them
 * over HTTP, for the integration tests of the live installment clients. They
 * keep just enough state to answer like the real services do.
 */
export type Json = Record<string, unknown>;
export const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** SnappPay as the store sees it: tokens, a first instalment the test «pays», verify → settle. */
export class FakeSnappPay {
  readonly payments = new Map<string, { transactionId: string; amount: number; status: string }>();
  readonly calls: string[] = [];
  private seq = 0;
  pay(token: string) {
    this.payments.get(token)!.status = 'PENDING';
  }
  answer(method: string, url: URL, body: Json): Response {
    const path = url.pathname.replace('/api/online', '');
    this.calls.push(`${method} ${path}`);
    const ok = (response: unknown) => reply({ successful: true, response });
    const refused = (errorCode: number, status: number) =>
      reply({ successful: false, errorData: { errorCode, message: 'خطا', data: null } }, status);
    if (path === '/v1/oauth/token') return reply({ access_token: 'snapp-token', expires_in: 3600 });
    if (path === '/offer/v1/eligible')
      return ok({ eligible: true, title_message: 'اسنپ‌پی', description: '۴ قسط' });
    if (path === '/payment/v1/token') {
      this.seq += 1;
      const token = `PT-${this.seq}`;
      this.payments.set(token, {
        transactionId: String(body.transactionId),
        amount: Number(body.amount),
        status: 'registered',
      });
      return ok({
        paymentToken: token,
        paymentPageUrl: `https://payment.snapppay.example/?paymentToken=${token}`,
      });
    }
    const token = path.endsWith('/status')
      ? url.searchParams.get('paymentToken')!
      : String(body.paymentToken);
    const payment = this.payments.get(token);
    if (!payment) return refused(1007, 404);
    if (path === '/payment/v1/status')
      return ok({ transactionId: payment.transactionId, status: payment.status, amount: payment.amount });
    const moves: Record<string, [string, string]> = {
      '/payment/v1/verify': ['PENDING', 'VERIFY'],
      '/payment/v1/settle': ['VERIFY', 'SETTLE'],
      '/payment/v1/cancel': ['SETTLE', 'CANCEL'],
      '/payment/v1/revert': ['PENDING', 'REVERT'],
    };
    const [from, to] = moves[path] ?? [];
    if (!from || payment.status !== from) return refused(1011, 400);
    payment.status = to!;
    return ok({ transactionId: payment.transactionId });
  }
}

/** DigiPay's UPG: tickets, a callback the test builds, verify by tracking code, deliver. */
export class FakeDigipay {
  readonly tickets = new Map<
    string,
    { providerId: string; amount: number; trackingCode: string | null; verified: boolean }
  >();
  readonly delivered: Json[] = [];
  unknownOnce = false;
  private seq = 0;
  pay(providerId: string): string {
    const ticket = [...this.tickets.values()].find((t) => t.providerId === providerId)!;
    ticket.trackingCode = `52394705116677287825${10 + this.seq}`;
    return ticket.trackingCode;
  }
  answer(url: URL, body: Json): Response {
    const path = url.pathname.replace('/digipay/api/', '');
    const success = { title: 'SUCCESS', status: 0, message: 'عملیات با موفقیت انجام شد', level: 'INFO' };
    if (path === 'oauth/token') return reply({ access_token: 'dp-token', expires_in: 3599 });
    if (path === 'tickets/business') {
      this.seq += 1;
      const ticket = `v2:${this.seq}`;
      this.tickets.set(ticket, {
        providerId: String(body.providerId),
        amount: Number(body.amount),
        trackingCode: null,
        verified: false,
      });
      return reply({
        result: success,
        ticket,
        redirectUrl: `https://web.digipay.example/web-pay/tgs/${ticket}`,
      });
    }
    if (path === 'purchases/verify') {
      if (this.unknownOnce) {
        this.unknownOnce = false;
        return reply({ result: { status: 9011, message: 'نامشخص', level: 'WARN' } }, 422);
      }
      const ticket = [...this.tickets.values()].find((t) => t.trackingCode === body.trackingCode);
      if (!ticket) return reply({ result: { status: 9000, message: 'یافت نشد', level: 'WARN' } }, 422);
      ticket.verified = true;
      return reply({
        result: success,
        trackingCode: ticket.trackingCode,
        providerId: ticket.providerId,
        amount: ticket.amount,
        paymentGateway: 4,
      });
    }
    if (path === 'purchases/deliver') {
      this.delivered.push({ ...body, type: url.searchParams.get('type') });
      return reply({ result: success });
    }
    return reply({ result: { status: 1054, message: 'bad path' } }, 400);
  }
}

/** AzkiVam: tickets created (1), paid by the test (8), verified (2). */
export class FakeAzkiVam {
  readonly tickets = new Map<string, { status: number; amount: number; signature: string }>();
  private seq = 0;
  pay(ticket: string) {
    this.tickets.get(ticket)!.status = 8;
  }
  answer(url: URL, body: Json, headers: Headers): Response {
    if (headers.get('merchantid') !== '12345' || !/^[0-9a-f]+$/.test(headers.get('signature') ?? '')) {
      return reply({ rsCode: 18, message: 'Signature Invalid' }, 403);
    }
    if (url.pathname === '/payment/purchase') {
      this.seq += 1;
      const ticket = `AZKITICKET${String(this.seq).padStart(6, '0')}`;
      this.tickets.set(ticket, {
        status: 1,
        amount: Number(body.amount),
        signature: headers.get('signature')!,
      });
      return reply({
        rsCode: 0,
        result: { ticket_id: ticket, payment_uri: `https://panel.azki.example/payment/?ticketId=${ticket}` },
      });
    }
    const ticket = this.tickets.get(String(body.ticket_id));
    if (!ticket) return reply({ rsCode: 2, message: '' }, 404);
    if (url.pathname === '/payment/status')
      return reply({ rsCode: 0, result: { rsCode: 0, status: ticket.status } });
    if (url.pathname === '/payment/verify') {
      if (ticket.status !== 8)
        return reply({ rsCode: 28, message: 'Ticket status is not valid for verifying.' }, 500);
      ticket.status = 2;
      return reply({ rsCode: 0, result: { rsCode: 0, ticket_id: body.ticket_id, status: 2 } });
    }
    return reply({ rsCode: 4, message: 'Malformed Data' }, 400);
  }
}

/** Tara's IPG: sign-in, payment tokens, verify. The test «pays» a token; verify answers only for a paid one. */
export class FakeTara {
  readonly tokens = new Map<
    string,
    {
      amount: number;
      mobile: string;
      serviceId: string;
      invoice: Json[];
      status: 'open' | 'paid' | 'verified';
    }
  >();
  readonly calls: string[] = [];
  /** the next verify answers like a gateway page (no JSON), as a hiccup would */
  failVerifyOnce = false;
  /** the next call with the bearer answers 401, as an expired access token does */
  expireTokenOnce = false;
  private seq = 0;
  pay(token: string) {
    this.tokens.get(token)!.status = 'paid';
  }
  answer(url: URL, body: Json, headers: Headers): Response {
    const path = url.pathname.replace(/^\/pay/, '');
    this.calls.push(`POST ${path}`);
    if (path === '/api/v2/authenticate') {
      if (body.username !== 'iphoneha-tara' || body.password !== 'tara-pw') {
        return reply({ result: 401, description: 'نام کاربری یا رمز عبور اشتباه است' }, 401);
      }
      this.seq += 1;
      return reply({ accessToken: `tara-access-${this.seq}`, expiresIn: 1800, result: 0, description: 'OK' });
    }
    if (!/^Bearer tara-access-\d+$/.test(headers.get('authorization') ?? '') || this.expireTokenOnce) {
      this.expireTokenOnce = false;
      return reply({ result: 401, description: 'Unauthorized' }, 401);
    }
    if (path === '/api/clubGroups') {
      return reply({
        result: 0,
        ipgClubMerchandiseGroupReportList: [
          { id: 12, title: 'موبایل و تبلت' },
          { id: 26, title: 'سایر' },
        ],
      });
    }
    if (path === '/api/getToken') {
      const list = (body.serviceAmountList as Json[]) ?? [];
      const invoice = (body.taraInvoiceItemList as Json[]) ?? [];
      const sum = invoice.reduce((total, line) => total + Number(line.fee) * Number(line.count), 0);
      if (!/^09\d{9}$/.test(String(body.mobile)))
        return reply({ result: 12, description: 'شماره موبایل نامعتبر است' });
      if (list.length !== 1 || list[0]!.serviceId !== '4410')
        return reply({ result: 14, description: 'کد درگاه نامعتبر است' });
      if (sum !== Number(body.amount))
        return reply({ result: 15, description: 'مبلغ فاکتور با مبلغ تراکنش برابر نیست' });
      this.seq += 1;
      const token = `TARATOKEN${String(this.seq).padStart(8, '0')}`;
      this.tokens.set(token, {
        amount: Number(body.amount),
        mobile: String(body.mobile),
        serviceId: '4410',
        invoice,
        status: 'open',
      });
      return reply({ token, result: 0, description: 'OK' });
    }
    if (path === '/api/purchaseVerify') {
      if (this.failVerifyOnce) {
        this.failVerifyOnce = false;
        return new Response('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        });
      }
      const token = this.tokens.get(String(body.token));
      if (!token) return reply({ result: 20, description: 'توکن یافت نشد' });
      if (token.status === 'open') return reply({ result: 21, description: 'تراکنش پرداخت نشده است' });
      if (token.status === 'verified')
        return reply({ result: 22, description: 'تراکنش قبلاً تأیید شده است' });
      token.status = 'verified';
      return reply({
        result: 0,
        rrn: `9${String(this.seq).padStart(11, '0')}`,
        amount: token.amount,
        cardNumber: '6037-99**-****-1234',
        traceNumber: `T${this.seq}`,
        invoiceDate: '1405/07/05',
        description: 'OK',
      });
    }
    return reply({ result: 99, description: 'bad path' }, 404);
  }
}

/** Bajet's JETPAY: token, order, inquiry, verify. `finalStatus` moves from PEND (the test pays → SUCCESS) to VERIFIED. */
export class FakeBajet {
  readonly orders = new Map<
    string,
    {
      orderId: string;
      amount: number;
      mobile: string;
      status: 'INIT' | 'PEND' | 'SUCCESS' | 'VERIFIED' | 'FAILED' | 'REVERSE';
      credit: number;
    }
  >();
  readonly calls: string[] = [];
  private seq = 0;
  pay(referenceId: string, credit?: number) {
    const order = this.orders.get(referenceId)!;
    order.status = 'SUCCESS';
    order.credit = credit ?? order.amount;
  }
  fail(referenceId: string) {
    this.orders.get(referenceId)!.status = 'FAILED';
  }
  answer(url: URL, body: Json, headers: Headers): Response {
    const operation = url.pathname.replace('/api/v1/jetpay/', '');
    this.calls.push(`POST ${operation}`);
    const ok = (result: unknown) => reply({ status: 200, success: true, result });
    const refused = (code: number, en: string, status = 400) =>
      reply({ status, success: false, result: { error: { code, en } } }, status);
    if (operation === 'token') {
      if (
        body.username !== 'iphoneha-bajet' ||
        body.password !== 'bajet-pw' ||
        body.terminalId !== '880011'
      ) {
        return refused(1100006, 'invalid credentials', 401);
      }
      return ok({ token: 'bajet-jwt', expiresIn: 3600 });
    }
    if (headers.get('authorization') !== 'Bearer bajet-jwt') return refused(1100007, 'unauthorized', 401);
    if (operation === 'order') {
      if (!/^09\d{9}$/.test(String(body.mobile))) return refused(700003, 'invalid mobile');
      this.seq += 1;
      const referenceId = `BJ${String(this.seq).padStart(10, '0')}`;
      this.orders.set(referenceId, {
        orderId: String(body.orderId),
        amount: Number(body.amount),
        mobile: String(body.mobile),
        status: 'PEND',
        credit: 0,
      });
      return ok({ referenceId, referUrl: `https://jetpay.bajet.example/fa/login?id=${referenceId}&lang=fa` });
    }
    const order = this.orders.get(String(body.referenceId));
    if (!order) return refused(700001, 'transaction not found');
    const split = {
      creditAmount: order.credit,
      cashAmount: order.status === 'PEND' || order.status === 'INIT' ? 0 : order.amount - order.credit,
    };
    if (operation === 'inquiry') {
      return ok({
        referenceId: body.referenceId,
        orderId: order.orderId,
        amount: order.amount,
        finalStatus: order.status,
        ...split,
      });
    }
    if (operation === 'verify') {
      if (order.status !== 'SUCCESS') return refused(700007, `transaction is ${order.status}`);
      order.status = 'VERIFIED';
      return ok({ referenceId: body.referenceId, orderId: order.orderId, ...split });
    }
    return refused(404, 'bad path', 404);
  }
}

export interface InstallmentFakes {
  snapp: FakeSnappPay;
  digipay: FakeDigipay;
  azki: FakeAzkiVam;
  tara?: FakeTara;
  bajet?: FakeBajet;
}

/**
 * Sends the API's outgoing calls to these hosts to the fakes; everything else
 * goes out as usual. `fakes()` is read on every call, so tests can start each
 * case with fresh ones. Undone by `jest.restoreAllMocks()`.
 */
export function interceptInstallmentApis(
  hosts: { snapp: string[]; digipay: string[]; azki: string[]; tara?: string[]; bajet?: string[] },
  fakes: () => InstallmentFakes,
): void {
  const realFetch = globalThis.fetch;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const raw = init?.body;
    let body: Json = {};
    if (typeof raw === 'string') {
      try {
        body = JSON.parse(raw) as Json;
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw));
      }
    }
    const headers = new Headers(init?.headers);
    const { snapp, digipay, azki, tara, bajet } = fakes();
    if (hosts.snapp.includes(url.hostname)) return snapp.answer(init?.method ?? 'GET', url, body);
    if (hosts.digipay.includes(url.hostname)) return digipay.answer(url, body);
    if (hosts.azki.includes(url.hostname)) return azki.answer(url, body, headers);
    if (tara && hosts.tara?.includes(url.hostname)) return tara.answer(url, body, headers);
    if (bajet && hosts.bajet?.includes(url.hostname)) return bajet.answer(url, body, headers);
    return realFetch(input, init);
  });
}
