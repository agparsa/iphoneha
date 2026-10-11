import { MelipayamakSmsProvider } from '../sms/melipayamak-sms.provider';

type FetchCall = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: FetchCall[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const form = (call: FetchCall) => Object.fromEntries(new URLSearchParams(String(call.init.body)));

describe('MelipayamakSmsProvider', () => {
  const patterns = { otp: 111, orderPaid: 222, orderShipped: 333 };

  it('sends an OTP through the approved pattern: only the code travels and there is no sender line', async () => {
    const { impl, calls } = fakeFetch(200, {
      Value: '1234567890123456789',
      RetStatus: 1,
      StrRetStatus: 'Ok',
    });
    const provider = new MelipayamakSmsProvider('user', 'secret', patterns, impl);

    const result = await provider.send('09121234567', { kind: 'otp', code: '482913' });

    expect(result).toEqual({ provider: 'melipayamak', messageId: '1234567890123456789', accepted: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');
    expect(calls[0]!.init.method).toBe('POST');
    expect(form(calls[0]!)).toEqual({
      username: 'user',
      password: 'secret',
      to: '09121234567',
      bodyId: '111',
      text: '482913',
    });
  });

  it('treats RetStatus ≠ 1 as a failure even though the HTTP status is 200', async () => {
    const { impl } = fakeFetch(200, { Value: '-7', RetStatus: 35, StrRetStatus: 'InvalidData' });
    const provider = new MelipayamakSmsProvider('user', 'wrong', patterns, impl);

    await expect(provider.send('09121234567', { kind: 'otp', code: '1111' })).rejects.toThrow(/RetStatus 35/);
  });

  it('fails on an HTTP error so the queue retries it', async () => {
    const { impl } = fakeFetch(502, {});
    const provider = new MelipayamakSmsProvider('user', 'secret', patterns, impl);

    await expect(provider.send('09121234567', { kind: 'otp', code: '1111' })).rejects.toThrow(/HTTP 502/);
  });

  it('says the service is unreachable when no answer comes back, not that the password is wrong', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    }) as unknown as typeof fetch;
    const provider = new MelipayamakSmsProvider('user', 'secret', patterns, impl);

    await expect(provider.send('09121234567', { kind: 'otp', code: '1111' })).rejects.toThrow(
      'Melipayamak unreachable: ECONNRESET',
    );
  });

  it('recognises a firewall page as no answer from Melipayamak', async () => {
    const impl = (async () =>
      new Response('<html><body><h1>403 Forbidden</h1></body></html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;
    const provider = new MelipayamakSmsProvider('user', 'secret', patterns, impl);

    await expect(provider.send('09121234567', { kind: 'otp', code: '1111' })).rejects.toThrow(
      /Melipayamak unreachable: HTTP 403 403 Forbidden/,
    );
  });

  it('passes the order number and tracking code as two pattern variables', async () => {
    const { impl, calls } = fakeFetch(200, { Value: '99', RetStatus: 1 });
    const provider = new MelipayamakSmsProvider('user', 'secret', patterns, impl);

    await provider.send('09121234567', {
      kind: 'order-shipped',
      orderNumber: 'IH-1001',
      trackingCode: '8812;77',
    });
    await provider.send('09121234567', { kind: 'order-shipped', orderNumber: 'IH-1002', trackingCode: null });
    await provider.send('09121234567', { kind: 'order-paid', orderNumber: 'IH-1003' });

    expect(form(calls[0]!)).toMatchObject({ bodyId: '333', text: 'IH-1001;8812,77' });
    expect(form(calls[1]!)).toMatchObject({ bodyId: '333', text: 'IH-1002;ثبت نشده' });
    expect(form(calls[2]!)).toMatchObject({ bodyId: '222', text: 'IH-1003' });
  });

  it('sends the staff alerts through their own patterns: request number and method, order number and amount', async () => {
    const { impl, calls } = fakeFetch(200, { Value: '7', RetStatus: 1 });
    const provider = new MelipayamakSmsProvider(
      'user',
      'secret',
      { ...patterns, alertCreditRequest: 444, alertOrderPaid: 555 },
      impl,
    );

    await provider.send('09121234567', { kind: 'alert-credit-request', number: '۱۲', method: 'چک صیادی' });
    await provider.send('09121234567', {
      kind: 'alert-order-paid',
      orderNumber: 'IH100012',
      amount: '۸۵٬۰۰۰٬۰۰۰',
    });

    expect(form(calls[0]!)).toMatchObject({ bodyId: '444', text: '۱۲;چک صیادی' });
    expect(form(calls[1]!)).toMatchObject({ bodyId: '555', text: 'IH100012;۸۵٬۰۰۰٬۰۰۰' });
  });

  it('sends the customer messages of the store: order ok, booklet, instalment paid, overdue', async () => {
    const { impl, calls } = fakeFetch(200, { Value: '8', RetStatus: 1 });
    const provider = new MelipayamakSmsProvider(
      'user',
      'secret',
      {
        ...patterns,
        installmentReminder: 600,
        orderConfirmed: 601,
        contractIssued: 602,
        installmentPaid: 603,
        installmentOverdue: 604,
      },
      impl,
    );

    await provider.send('09121234567', {
      kind: 'order-confirmed',
      orderNumber: 'IH100012',
      amount: '۸۵٬۰۰۰٬۰۰۰',
    });
    await provider.send('09121234567', {
      kind: 'contract-issued',
      contractNumber: '۱۰۲۴',
      months: '۱۲',
      monthly: '۹٬۴۲۰٬۰۰۰',
      firstDue: '۱۴۰۵/۰۸/۱۰',
    });
    await provider.send('09121234567', {
      kind: 'installment-paid',
      index: '۳',
      contractNumber: '۱۰۲۴',
      amount: '۹٬۴۲۰٬۰۰۰',
      remaining: '۸۴٬۷۸۰٬۰۰۰',
    });
    await provider.send('09121234567', {
      kind: 'installment-overdue',
      contractNumber: '۱۰۲۴',
      amount: '۹٬۴۲۰٬۰۰۰',
      dueDate: '۱۴۰۵/۰۷/۱۰',
    });

    expect(form(calls[0]!)).toMatchObject({ bodyId: '601', text: 'IH100012;۸۵٬۰۰۰٬۰۰۰' });
    expect(form(calls[1]!)).toMatchObject({ bodyId: '602', text: '۱۰۲۴;۱۲;۹٬۴۲۰٬۰۰۰;۱۴۰۵/۰۸/۱۰' });
    expect(form(calls[2]!)).toMatchObject({ bodyId: '603', text: '۳;۱۰۲۴;۹٬۴۲۰٬۰۰۰;۸۴٬۷۸۰٬۰۰۰' });
    expect(form(calls[3]!)).toMatchObject({ bodyId: '604', text: '۱۰۲۴;۹٬۴۲۰٬۰۰۰;۱۴۰۵/۰۷/۱۰' });
  });

  it('falls back to the older patterns: PAYMENT for «order ok», the reminder for «overdue»', async () => {
    const { impl, calls } = fakeFetch(200, { Value: '9', RetStatus: 1 });
    const provider = new MelipayamakSmsProvider(
      'user',
      'secret',
      { ...patterns, installmentReminder: 600 },
      impl,
    );

    await provider.send('09121234567', { kind: 'order-confirmed', orderNumber: 'IH100012', amount: '۱' });
    await provider.send('09121234567', {
      kind: 'installment-overdue',
      contractNumber: '۷',
      amount: '۲',
      dueDate: '۱۴۰۵/۰۷/۱۰',
    });
    const booklet = await provider.send('09121234567', {
      kind: 'contract-issued',
      contractNumber: '۷',
      months: '۶',
      monthly: '۳',
      firstDue: '۱۴۰۵/۰۸/۱۰',
    });

    expect(form(calls[0]!)).toMatchObject({ bodyId: '222', text: 'IH100012' });
    expect(form(calls[1]!)).toMatchObject({ bodyId: '600', text: '۷;۲;۱۴۰۵/۰۷/۱۰' });
    expect(booklet.accepted).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('skips notifications that have no approved pattern instead of failing', async () => {
    const { impl, calls } = fakeFetch(200, { Value: '1', RetStatus: 1 });
    const provider = new MelipayamakSmsProvider('user', 'secret', { otp: 111 }, impl);

    const result = await provider.send('09121234567', { kind: 'order-paid', orderNumber: 'IH-1' });
    const alert = await provider.send('09121234567', {
      kind: 'alert-credit-request',
      number: '1',
      method: 'سفته',
    });

    expect(result.accepted).toBe(false);
    expect(alert.accepted).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
