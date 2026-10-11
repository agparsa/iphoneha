import { DEFAULT_INSTALLMENT_TERMS } from '@iphoneha/shared';
import { SnapPayProvider } from '../providers/installment/snappay.provider';
import { AzkiVamProvider } from '../providers/installment/azkivam.provider';
import type { InstallmentGatewayClient } from '../providers/installment/installment-gateway.client';

const client: InstallmentGatewayClient = {
  driver: 'mock',
  createSession: jest.fn(async () => ({ ref: 'ref-1', redirectUrl: 'https://gateway.test/ref-1' })),
  verify: jest.fn(async () => ({ status: 'SUCCESS' as const, providerRef: 'ref-1', trackingCode: 'T1' })),
  status: jest.fn(async () => ({ status: 'SUCCESS' as const })),
  refund: jest.fn(async () => ({ status: 'REFUNDED' as const, reference: 'ref-1' })),
};

describe('installment providers', () => {
  const snapp = new SnapPayProvider(client, async () => DEFAULT_INSTALLMENT_TERMS.SNAPPAY);
  const azki = new AzkiVamProvider(client, async () => DEFAULT_INSTALLMENT_TERMS.AZKIVAM);

  it('exposes the method and a driver-specific code', () => {
    expect(snapp.method).toBe('SNAPPAY');
    expect(snapp.code).toBe('snappay-mock');
    expect(snapp.kind).toBe('INSTALLMENT');
    expect(snapp.displayName).toBe('اسنپ‌پی');
  });

  it('rejects amounts above the credit ceiling', async () => {
    const result = await snapp.checkEligibility({ amount: 500_000_000 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('سقف اعتبار');
  });

  it('returns a repayment estimate when eligible', async () => {
    const result = await snapp.checkEligibility({ amount: 100_000_000 });
    expect(result.eligible).toBe(true);
    expect(result.estimate).toEqual({ downPayment: 25_000_000, months: 4, monthly: expect.any(Number) });
  });

  it('spreads long term loans over more months', async () => {
    const result = await azki.checkEligibility({ amount: 100_000_000 });
    expect(result.estimate?.months).toBe(36);
    expect(result.estimate!.monthly).toBeLessThan(5_000_000);
  });

  it('delegates the session creation to the gateway client', async () => {
    const created = await snapp.createPayment({
      paymentId: 'p1',
      orderId: 'o1',
      orderNumber: 'IH100001',
      amount: 50_000_000,
      customer: { name: 'تست', phone: '09120000000' },
      description: 'test',
      callbackUrl: 'https://shop.test/callback',
      items: [],
    });
    expect(created).toMatchObject({ providerRef: 'ref-1', redirectUrl: 'https://gateway.test/ref-1' });
    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ providerCode: 'snappay-mock', plan: expect.objectContaining({ months: 4 }) }),
    );
  });

  it('reports a missing provider reference instead of calling the gateway', async () => {
    const result = await snapp.verifyPayment({
      payment: {
        id: 'p1',
        providerRef: null,
        amount: 1,
        method: 'SNAPPAY',
        provider: 'snappay-mock',
        meta: null,
      },
    });
    expect(result.status).toBe('FAILED');
  });

  it('lets a live service that answers for itself hide itself, in its own words', async () => {
    const answers = [
      { eligible: false, title: 'پرداخت قسطی با اسنپ‌پی', description: 'این مبلغ در بازهٔ اسنپ‌پی نیست' },
      { eligible: true, title: 'پرداخت قسطی با اسنپ‌پی', description: '۴ قسط' },
    ];
    const live: InstallmentGatewayClient = {
      ...client,
      driver: 'live',
      eligibility: jest.fn(async () => answers.shift()!),
    };
    const provider = new SnapPayProvider(live, async () => DEFAULT_INSTALLMENT_TERMS.SNAPPAY);
    expect(provider.code).toBe('snappay-live');
    expect(await provider.checkEligibility({ amount: 100_000_000 })).toEqual({
      eligible: false,
      reason: 'این مبلغ در بازهٔ اسنپ‌پی نیست',
      estimate: null,
    });
    expect((await provider.checkEligibility({ amount: 100_000_000 })).eligible).toBe(true);

    const silent: InstallmentGatewayClient = {
      ...client,
      driver: 'live',
      eligibility: jest.fn(async () => Promise.reject(new Error('down'))),
    };
    const unreachable = new SnapPayProvider(silent, async () => DEFAULT_INSTALLMENT_TERMS.SNAPPAY);
    expect(await unreachable.checkEligibility({ amount: 100_000_000 })).toMatchObject({
      eligible: false,
      reason: expect.stringContaining('پاسخ نمی‌دهد'),
    });
  });

  it('hands the callback and the stored meta to the client, and asks it about delivery', async () => {
    const verify = jest.fn(async () => ({ status: 'PENDING' as const, providerRef: 'ref-1' }));
    const confirmDelivery = jest.fn(async () => ({ status: 'CONFIRMED' as const }));
    const live: InstallmentGatewayClient = { ...client, driver: 'live', verify, confirmDelivery };
    const provider = new SnapPayProvider(live, async () => DEFAULT_INSTALLMENT_TERMS.SNAPPAY);
    const payment = {
      id: 'p1',
      providerRef: 'ref-1',
      amount: 10,
      method: 'SNAPPAY' as const,
      provider: 'snappay-live',
      meta: { a: 1 },
      trackingCode: 'T',
    };

    await provider.verifyPayment({ payment, callbackQuery: { state: 'OK' } });
    await provider.verifyPayment({ payment, callbackQuery: {} });
    expect(verify).toHaveBeenNthCalledWith(1, {
      ref: 'ref-1',
      amount: 10,
      callback: { state: 'OK' },
      meta: { a: 1 },
    });
    expect(verify).toHaveBeenNthCalledWith(2, {
      ref: 'ref-1',
      amount: 10,
      callback: undefined,
      meta: { a: 1 },
    });

    expect(await provider.confirmDelivery({ payment, orderNumber: 'IH1', skus: ['S'] })).toEqual({
      status: 'CONFIRMED',
    });
    expect(confirmDelivery).toHaveBeenCalledWith({
      ref: 'ref-1',
      meta: { a: 1 },
      trackingCode: 'T',
      orderNumber: 'IH1',
      skus: ['S'],
    });
    expect(await snapp.confirmDelivery({ payment, orderNumber: 'IH1', skus: [] })).toEqual({
      status: 'NOT_NEEDED',
    });
  });
});
