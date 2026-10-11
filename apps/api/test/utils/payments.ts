import type { Actor } from './actors';
import type { TestContext } from './test-app';

/** Drives the mock gateway the way a customer's browser would. */
export async function completeMockPayment(
  ctx: TestContext,
  actor: Actor,
  providerRef: string,
  result: 'SUCCESS' | 'FAILED' | 'CANCELLED',
): Promise<void> {
  const complete = await ctx
    .http()
    .post(`/api/payments/mock/${providerRef}/complete`)
    .type('form')
    .send({ result })
    .expect(302);

  const location = complete.headers.location as string;
  const callbackPath = new URL(location).pathname + new URL(location).search;
  await actor.agent.get(callbackPath).expect(302);
}

export function startCheckout(
  actor: Actor,
  input: { addressId: string; shippingMethodId: string; paymentMethod?: string; couponCode?: string },
  idempotencyKey = `test-${Math.random().toString(36).slice(2)}`,
) {
  return actor.agent
    .post('/api/checkout')
    .set('x-csrf-token', actor.csrf)
    .set('idempotency-key', idempotencyKey)
    .send({ paymentMethod: 'ONLINE', ...input });
}
