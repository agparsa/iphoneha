import { AzkiVamClient, azkiSignature } from '../providers/installment/live/azkivam.client';
import { fakeService, json, type Route } from './live-fetch';

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const credentials = { baseUrl: 'https://azki.test', merchantId: '12345', apiKey: KEY };

/** An AzkiVam with one ticket whose status the test moves along. */
function azki(extra: Record<string, Route> = {}, start = 1) {
  const ticket = { status: start };
  const service = fakeService({
    'POST /payment/purchase': () =>
      json({
        rsCode: 0,
        result: {
          payment_uri: 'https://panel.azkivam.com/payment/?ticketId=PJQPHFwN1AM6EUAJ',
          ticket_id: 'PJQPHFwN1AM6EUAJ',
        },
      }),
    'POST /payment/status': (call) =>
      json({
        rsCode: 0,
        result: {
          rsCode: 0,
          status: ticket.status,
          ticket_id: (call.body as { ticket_id: string }).ticket_id,
        },
      }),
    'POST /payment/verify': () => {
      if (ticket.status !== 8)
        return json({ rsCode: 28, message: 'Ticket status is not valid for verifying.' }, 500);
      ticket.status = 2;
      return json({ rsCode: 0, result: { rsCode: 0, ticket_id: 'PJQPHFwN1AM6EUAJ', status: 2 } });
    },
    'POST /payment/reverse': () => {
      const already = ticket.status === 3;
      ticket.status = 3;
      return json({ rsCode: 0, result: already ? { rsCode: 16 } : { ticket_id: 'PJQPHFwN1AM6EUAJ' } });
    },
    ...extra,
  });
  return { service, ticket, client: new AzkiVamClient(credentials, service.impl) };
}

const context = {
  paymentId: 'pay_1',
  orderId: 'ord_1',
  orderNumber: 'IH100001',
  amount: 120_500_000,
  customer: { name: 'مشتری', phone: '09121234567' },
  description: 'سفارش IH100001',
  callbackUrl: 'https://iphoneha.com/api/payments/callback/azkivam-live/pay_1',
  items: [
    {
      title: 'آیفون ۱۷ پرو',
      quantity: 2,
      unitPrice: 60_000_000,
      sku: 'IPHONE-17-PRO-256-SILVER',
      url: 'https://iphoneha.com/iphone/iphone-17-pro',
    },
  ],
  shipping: 500_000,
  discount: 0,
};
const session = {
  context,
  plan: { downPayment: 0, months: 36, monthly: 0 },
  providerName: 'ازکی‌وام',
  brandColor: '#1a3fc4',
  providerCode: 'azkivam-live',
};
const REF = 'PJQPHFwN1AM6EUAJ';

describe('AzkiVamClient', () => {
  it('signs every request like AzkiVam’s own integrations (AES-256-CBC, zero IV, hex)', () => {
    expect(azkiSignature('/payment/purchase', KEY, 1_758_888_000_000)).toBe(
      'e154f15791cb6ede6be47470582850e5b3d6934476b6d02febe0aba0ea71a17a1bacc010af859cdefe5d1823ad7ddbe11a76e044fd7ea5bd642571feb05ea085ba260e4b213ef28bf3a093851bd756ccb8c8905cd219a5e725c56a9a020b5d2afe9458e451d35f70dc9e61fe18c5eca0',
    );
    expect(() => azkiSignature('/payment/purchase', 'short')).toThrow(/64 hex/);
  });

  it('opens a ticket in Rial whose lines add up to the amount', async () => {
    const { client, service } = azki();
    const created = await client.createSession(session);

    expect(created).toMatchObject({
      ref: REF,
      redirectUrl: `https://panel.azkivam.com/payment/?ticketId=${REF}`,
    });
    const call = service.calls[0]!;
    expect(call.headers.merchantid).toBe('12345');
    expect(call.headers.signature).toMatch(/^[0-9a-f]{224}$/); // 98 bytes → 7 AES blocks
    const body = call.body as {
      amount: number;
      provider_id: number;
      merchant_id: number;
      mobile_number: string;
      redirect_uri: string;
      fallback_uri: string;
      items: { name: string; count: number; amount: number; url: string }[];
    };
    expect(body.amount).toBe(1_205_000_000);
    expect(body.items).toEqual([
      {
        name: 'آیفون ۱۷ پرو',
        count: 2,
        amount: 600_000_000,
        url: 'https://iphoneha.com/iphone/iphone-17-pro',
      },
      { name: 'هزینهٔ ارسال', count: 1, amount: 5_000_000, url: 'https://iphoneha.com' },
    ]);
    expect(body.items.reduce((sum, item) => sum + item.amount * item.count, 0)).toBe(body.amount);
    expect(String(body.provider_id)).toMatch(/^[1-9]\d{11}$/);
    expect(body).toMatchObject({
      merchant_id: 12345,
      mobile_number: '09121234567',
      redirect_uri: context.callbackUrl,
      fallback_uri: context.callbackUrl,
    });
    expect(created.raw).toEqual({ ticketId: REF, providerId: body.provider_id, amountRial: 1_205_000_000 });
  });

  it('sends a coupon order as one line, so the lines still add up', async () => {
    const { client, service } = azki();
    await client.createSession({
      ...session,
      context: { ...context, amount: 119_500_000, discount: 1_000_000 },
    });
    const body = service.calls[0]!.body as {
      amount: number;
      items: { name: string; amount: number; count: number }[];
    };
    expect(body.items).toEqual([
      expect.objectContaining({ name: 'سفارش IH100001', count: 1, amount: 1_195_000_000 }),
    ]);
    expect(body.amount).toBe(1_195_000_000);
  });

  it('explains the refusals a buyer can cause', async () => {
    const { client } = azki({
      'POST /payment/purchase': () => json({ rsCode: 20, message: 'Customer mismatch' }, 400),
    });
    await expect(client.createSession(session)).rejects.toThrow(/rsCode 20.*ثبت‌نام نکرده/);
  });

  it('verifies a Done ticket and reports it captured', async () => {
    const { client, service } = azki({}, 8);
    const result = await client.verify({
      ref: REF,
      amount: 120_500_000,
      callback: { status: 'Done', ticketId: REF },
    });
    expect(result).toMatchObject({ status: 'SUCCESS', providerRef: REF, trackingCode: REF });
    expect(service.trail()).toEqual(['POST /payment/status', 'POST /payment/verify']);
    expect(service.calls[1]!.body).toEqual({ ticket_id: REF });
  });

  it('decides from the ticket state, not from the callback', async () => {
    // verified meanwhile, settled or queued: captured without another verify
    for (const status of [2, 6, 9]) {
      const { client, service } = azki({}, status);
      expect((await client.verify({ ref: REF, amount: 1 })).status).toBe('SUCCESS');
      expect(service.count('POST /payment/verify')).toBe(0);
    }
    // still created: waiting — unless our own ticket came back without «Done»
    expect(
      (await azki({}, 1).client.verify({ ref: REF, amount: 1, callback: { status: 'Done', ticketId: REF } }))
        .status,
    ).toBe('PENDING');
    expect(
      (
        await azki({}, 1).client.verify({
          ref: REF,
          amount: 1,
          callback: { status: 'canceled', ticketId: REF },
        })
      ).status,
    ).toBe('FAILED');
    // a callback about another ticket changes nothing
    expect(
      (
        await azki({}, 1).client.verify({
          ref: REF,
          amount: 1,
          callback: { status: 'canceled', ticketId: 'OTHER' },
        })
      ).status,
    ).toBe('PENDING');
    // reversed, failed, canceled, expired
    for (const status of [3, 4, 5, 7]) {
      expect((await azki({}, status).client.verify({ ref: REF, amount: 1 })).status).toBe('FAILED');
    }
  });

  it('looks again when verify says the ticket moved on (rsCode 28)', async () => {
    let calls = 0;
    const { client, ticket } = azki(
      {
        'POST /payment/verify': () => {
          ticket.status = 2; // verified by a parallel request
          return json({ rsCode: 28, message: 'Ticket status is not valid for verifying.' }, 500);
        },
        'POST /payment/status': () => {
          calls += 1;
          return json({ rsCode: 0, result: { rsCode: 0, status: calls === 1 ? 8 : ticket.status } });
        },
      },
      8,
    );
    expect((await client.status({ ref: REF, amount: 1 })).status).toBe('SUCCESS');
  });

  it('proves the shop id and key with the status of a ticket that does not exist', async () => {
    const answers: [unknown, number, string | RegExp][] = [
      [{ rsCode: 2, message: 'Resource Not Found' }, 404, 'OK'],
      [{ rsCode: 5, message: 'Data Not Found' }, 404, 'OK'],
      [{ rsCode: 44, message: 'Validation exception' }, 400, 'UNSURE'],
    ];
    for (const [body, status, expected] of answers) {
      const { client, service } = azki({ 'POST /payment/status': () => json(body, status) });
      expect((await client.probe()).status).toBe(expected);
      expect(service.calls[0]!.body).toEqual({ ticket_id: 'IPHONEHA0PROBE00' });
    }
    for (const [body, status, message] of [
      [{ rsCode: 18, message: 'Signature Invalid' }, 403, /rsCode 18/],
      [{ rsCode: 15, message: 'Access Denied' }, 403, /rsCode 15/],
      ['<html>403 Forbidden</html>', 403, /HTTP 403/],
    ] as const) {
      const { client } = azki({
        'POST /payment/status': () =>
          typeof body === 'string' ? new Response(body, { status }) : json(body, status),
      });
      await expect(client.probe()).rejects.toThrow(message);
    }
  });

  it('reverses the whole amount with the original provider id', async () => {
    const { client, service } = azki({}, 2);
    const result = await client.refund({
      ref: REF,
      amount: 120_500_000,
      paidAmount: 120_500_000,
      meta: { providerId: 100123456789 },
    });
    expect(result.status).toBe('REFUNDED');
    expect(service.calls[0]!.body).toEqual({ ticket_id: REF, provider_id: 100123456789, reason: 'regret' });

    const again = await client.refund({
      ref: REF,
      amount: 120_500_000,
      paidAmount: 120_500_000,
      meta: { providerId: 100123456789 },
    });
    expect(again).toMatchObject({ status: 'REFUNDED', message: expect.stringContaining('قبلاً') });

    expect((await client.refund({ ref: REF, amount: 1, paidAmount: 120_500_000 })).status).toBe('MANUAL');
    const settled = azki({
      'POST /payment/reverse': () => json({ rsCode: 59, message: 'not reversible' }, 400),
    });
    expect((await settled.client.refund({ ref: REF, amount: 5, paidAmount: 5 })).status).toBe('MANUAL');
  });
});
