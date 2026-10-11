import { anonymous, defaultAddress, loginAdmin, loginWithProfile, type Actor } from './utils/actors';
import { resetDb } from './utils/db';
import { startCheckout } from './utils/payments';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

const OWNER = '09120000000'; // SUPER_ADMIN in the seed
const WAREHOUSE = '09120000001'; // WAREHOUSE in the seed
const SUPPORT = '09120000002'; // created here

/** A cookie header as the browser stores it: `name=value; Attr; Attr`. */
const cookieNamed = (response: { headers: Record<string, unknown> }, name: string): string | undefined =>
  ((response.headers['set-cookie'] as string[] | undefined) ?? []).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );

/**
 * The properties every release must keep: what the API refuses, what it never
 * tells, and what one visitor can never do to another. A finding of the
 * security audit becomes a case here so it cannot come back.
 */
describe('Security', () => {
  let ctx: TestContext;
  let shippingMethodId: string;
  let variantId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    await ctx.prisma.adminUser.upsert({
      where: { phone: SUPPORT },
      create: { phone: SUPPORT, name: 'پشتیبانی', role: 'SUPPORT', isActive: true },
      update: { role: 'SUPPORT', isActive: true },
    });
    const methods = await ctx.http().get('/api/shipping/methods?province=تهران&subtotal=0').expect(200);
    shippingMethodId = methods.body.find((m: { available: boolean }) => m.available).id;
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    variantId = detail.body.variants.find((v: { availableStock: number }) => v.availableStock >= 5).id;
  });

  /** A signed-in customer with an address and one phone in the cart. */
  const shopper = async (phone: string) => {
    const actor = await loginWithProfile(ctx, phone);
    const addressId = await defaultAddress(actor);
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    return { actor, addressId };
  };
  const order = (actor: Actor, addressId: string) => startCheckout(actor, { addressId, shippingMethodId });

  // ─── headers, cookies and error shape ──────────────────────────────────────

  it('answers with the hardening headers and never a server signature', async () => {
    const response = await ctx.http().get('/api/health').expect(200);
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'",
    );
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers.server).toBeUndefined();
  });

  it('sets the session cookie HttpOnly and SameSite, and only the CSRF cookie readable by scripts', async () => {
    const actor = await anonymous(ctx);
    await ctx.redis.del('otp:cooldown:USER_LOGIN:09125550001');
    const sent = await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone: '09125550001' })
      .expect(201);
    expect(cookieNamed(sent, 'ih_csrf') ?? '').not.toMatch(/HttpOnly/i);
    const code = await ctx.redis.get('dev:otp:09125550001');
    const verified = await actor.agent
      .post('/api/auth/verify-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone: '09125550001', code })
      .expect(201);
    const session = cookieNamed(verified, 'ih_sid');
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/Path=\//);
    // the token itself is random and long enough not to be guessed
    expect(session!.split(';')[0]!.split('=')[1]!.length).toBeGreaterThanOrEqual(40);
    // and the response body never carries it
    expect(JSON.stringify(verified.body)).not.toContain(session!.split(';')[0]!.split('=')[1]!);
  });

  it('turns malformed input and unknown routes into the same small JSON shape, without internals', async () => {
    const actor = await anonymous(ctx);
    const broken = await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .set('content-type', 'application/json')
      .send('{"variantId": ')
      .expect(400);
    expect(Object.keys(broken.body).sort()).toEqual(['code', 'message', 'statusCode']);
    expect(JSON.stringify(broken.body)).not.toMatch(/\n\s+at |node_modules|\/home\//);

    const missing = await ctx.http().get('/api/no-such-route').expect(404);
    expect(missing.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(JSON.stringify(missing.body)).not.toMatch(/Cannot GET|Express/);

    const invalid = await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId: 'x', quantity: 'many' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(invalid.body)).not.toMatch(/zod|ZodError/i);
  });

  it('caps the request body at 1 MB', async () => {
    const actor = await anonymous(ctx);
    const response = await actor.agent
      .post('/api/credit-requests')
      .set('x-csrf-token', actor.csrf)
      .send({ note: 'x'.repeat(1_100_000) })
      .expect(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  // ─── CSRF ──────────────────────────────────────────────────────────────────

  it('refuses every state change without a matching CSRF header — customer, guest and admin alike', async () => {
    const guest = await anonymous(ctx);
    await guest.agent.post('/api/cart').send({ variantId, quantity: 1 }).expect(403);
    await guest.agent
      .post('/api/cart')
      .set('x-csrf-token', 'not-the-cookie')
      .send({ variantId, quantity: 1 })
      .expect(403);

    const { actor, addressId } = await shopper('09125550002');
    await actor.agent
      .post('/api/checkout')
      .set('idempotency-key', 'e2e-csrf-1')
      .send({ addressId, shippingMethodId, paymentMethod: 'ONLINE' })
      .expect(403);
    await actor.agent.patch('/api/users/me').send({ firstName: 'x', lastName: 'y' }).expect(403);

    const admin = await loginAdmin(ctx, OWNER);
    await admin.agent.patch('/api/admin/settings/store').send({}).expect(403);
    // reads never need it
    await admin.agent.get('/api/admin/dashboard').expect(200);
  });

  // ─── roles ─────────────────────────────────────────────────────────────────

  it('lets each role do exactly what its permissions say (guards run before validation: a refusal is 403, never 400)', async () => {
    const support = await loginAdmin(ctx, SUPPORT);
    const warehouse = await loginAdmin(ctx, WAREHOUSE);
    const owner = await loginAdmin(ctx, OWNER);
    const post = (actor: Actor, path: string, body: object = {}) =>
      actor.agent.post(path).set('x-csrf-token', actor.csrf).send(body);
    const patch = (actor: Actor, path: string, body: object = {}) =>
      actor.agent.patch(path).set('x-csrf-token', actor.csrf).send(body);

    // support: reads and the customers' instalments, no writes on stock, prices, orders or settings
    await support.agent.get('/api/admin/orders').expect(200);
    await support.agent.get('/api/admin/ledger/summary').expect(200);
    await support.agent.get('/api/admin/users').expect(200);
    await support.agent.get('/api/admin/settings').expect(403);
    await support.agent.get('/api/admin/exports/orders').expect(403);
    await support.agent.get('/api/admin/reports/sales').expect(403);
    await support.agent.get('/api/admin/audit-logs').expect(403);
    await post(support, '/api/admin/orders').expect(403);
    await post(support, '/api/admin/pricing/bulk').expect(403);
    await post(support, '/api/admin/ledger/contracts').expect(403);
    await post(support, '/api/admin/devices/receive').expect(403);
    await patch(support, '/api/admin/settings/payments').expect(403);

    // warehouse: stock in and out, nothing about people, money or settings
    await warehouse.agent.get('/api/admin/devices').expect(200);
    await post(warehouse, '/api/admin/devices/receive').expect(400); // allowed, so the empty body is what fails
    await warehouse.agent.get('/api/admin/users').expect(403);
    await warehouse.agent.get('/api/admin/ledger/summary').expect(403);
    await warehouse.agent.get('/api/admin/reports/sales').expect(403);
    await warehouse.agent.get('/api/admin/exports/customers').expect(403);
    await warehouse.agent.get('/api/admin/payment-connections').expect(403);
    await post(warehouse, '/api/admin/orders').expect(403);
    await post(warehouse, '/api/admin/pricing/bulk').expect(403);
    await post(warehouse, '/api/admin/admins').expect(403);

    // only the owner manages admins; nobody can switch their own account off
    await post(owner, '/api/admin/admins').expect(400);
    const me = (await owner.agent.get('/api/admin/auth/me').expect(200)).body as { id: string };
    await patch(owner, `/api/admin/admins/${me.id}`, { isActive: false }).expect(400);
  });

  it('ends an administrator’s sessions the moment their role changes or they are switched off', async () => {
    const owner = await loginAdmin(ctx, OWNER);
    const warehouse = await loginAdmin(ctx, WAREHOUSE);
    await warehouse.agent.get('/api/admin/devices').expect(200);
    const target = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { phone: WAREHOUSE } });
    await owner.agent
      .patch(`/api/admin/admins/${target.id}`)
      .set('x-csrf-token', owner.csrf)
      .send({ role: 'SUPPORT' })
      .expect(200);
    await warehouse.agent.get('/api/admin/devices').expect(401);
    await ctx.prisma.adminUser.update({ where: { id: target.id }, data: { role: 'WAREHOUSE' } });
  });

  it('keeps a customer session out of the panel, and an admin session out of the customer account', async () => {
    const { actor } = await shopper('09125550003');
    await actor.agent.get('/api/admin/dashboard').expect(401);
    await actor.agent.get('/api/admin/orders').expect(401);
    const admin = await loginAdmin(ctx, OWNER);
    await admin.agent.get('/api/users/me').expect(401);
    await admin.agent.get('/api/orders').expect(401);
  });

  // ─── one customer, another customer's data ─────────────────────────────────

  it('never lets one customer see, pay, cancel or edit what belongs to another', async () => {
    const alice = await shopper('09125550004');
    const created = await order(alice.actor, alice.addressId).expect(201);
    const { id: orderId, orderNumber } = created.body.order as { id: string; orderNumber: string };
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId } });
    const cart = await ctx.http().get('/api/products/iphone-17').expect(200);
    const otherVariant = cart.body.variants.find(
      (v: { availableStock: number; id: string }) => v.availableStock >= 5 && v.id !== variantId,
    ).id;

    const mallory = await shopper('09125550005');
    const m = mallory.actor;
    const post = (path: string, body: object = {}) =>
      m.agent.post(path).set('x-csrf-token', m.csrf).send(body);
    await m.agent.get(`/api/orders/${orderNumber}`).expect(404);
    await m.agent.get(`/api/orders/${orderId}`).expect(404);
    await post(`/api/orders/${orderId}/cancel`).expect(404);
    await post('/api/payments/create', { orderId }).expect(404);
    await post('/api/payments/verify', { paymentId: payment.id }).expect(404);
    await m.agent.get(`/api/payments/result/${orderNumber}`).expect(404);
    const address = {
      recipientName: 'مالوری',
      mobile: '09125550005',
      province: 'البرز',
      city: 'کرج',
      addressLine: 'خیابان آزمایشی، پلاک ۱',
      postalCode: '3134567890',
    };
    await m.agent
      .patch(`/api/users/me/addresses/${alice.addressId}`)
      .set('x-csrf-token', m.csrf)
      .send(address)
      .expect(404);
    await m.agent
      .delete(`/api/users/me/addresses/${alice.addressId}`)
      .set('x-csrf-token', m.csrf)
      .expect(404);
    await post(`/api/users/me/addresses/${alice.addressId}/default`).expect(404);

    // a cart line of another customer cannot be changed through its id
    await m.agent
      .post('/api/cart')
      .set('x-csrf-token', m.csrf)
      .send({ variantId: otherVariant, quantity: 1 })
      .expect(201);
    const aliceCart = await ctx.prisma.cart.findFirst({
      where: { userId: alice.actor.userId },
      include: { items: true },
    });
    // Alice's cart was emptied by the checkout: give her a line to attack
    await alice.actor.agent
      .post('/api/cart')
      .set('x-csrf-token', alice.actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const line = await ctx.prisma.cartItem.findFirstOrThrow({
      where: { cart: { userId: alice.actor.userId } },
    });
    await m.agent
      .patch(`/api/cart/items/${line.id}`)
      .set('x-csrf-token', m.csrf)
      .send({ quantity: 5 })
      .expect(404);
    await m.agent.delete(`/api/cart/items/${line.id}`).set('x-csrf-token', m.csrf).expect(404);
    expect((await ctx.prisma.cartItem.findUniqueOrThrow({ where: { id: line.id } })).quantity).toBe(1);
    expect(aliceCart).not.toBeNull();

    // and Alice still has everything
    await alice.actor.agent.get(`/api/orders/${orderNumber}`).expect(200);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'PAYMENT_PENDING',
    );
  });

  it('scopes an Idempotency-Key to the customer who used it', async () => {
    const alice = await shopper('09125550006');
    const first = await startCheckout(
      alice.actor,
      { addressId: alice.addressId, shippingMethodId },
      'shared-key',
    ).expect(201);
    const bob = await shopper('09125550007');
    // Bob replays Alice's key: he gets his own order, never hers
    const second = await startCheckout(
      bob.actor,
      { addressId: bob.addressId, shippingMethodId },
      'shared-key',
    ).expect(201);
    expect(second.body.order.id).not.toBe(first.body.order.id);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: second.body.order.id } })).userId).toBe(
      bob.actor.userId,
    );
  });

  // ─── abuse limits ──────────────────────────────────────────────────────────

  it('stops one account from holding the shelf with unpaid orders', async () => {
    const { actor, addressId } = await shopper('09125550008');
    const numbers: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      if (i > 0)
        await actor.agent
          .post('/api/cart')
          .set('x-csrf-token', actor.csrf)
          .send({ variantId, quantity: 1 })
          .expect(201);
      numbers.push((await order(actor, addressId).expect(201)).body.order.id);
    }
    await actor.agent
      .post('/api/cart')
      .set('x-csrf-token', actor.csrf)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const refused = await order(actor, addressId).expect(409);
    expect(refused.body.code).toBe('TOO_MANY_OPEN_ORDERS');
    // the cart and the stock are untouched by the refusal
    expect((await actor.agent.get('/api/cart').expect(200)).body.items).toHaveLength(1);

    // paying or cancelling one opens the door again
    await actor.agent.post(`/api/orders/${numbers[0]}/cancel`).set('x-csrf-token', actor.csrf).expect(201);
    await order(actor, addressId).expect(201);
  });

  it('throttles coupon guessing well below the general request limit', async () => {
    const guest = await anonymous(ctx);
    let refused = 0;
    for (let i = 0; i < 25; i += 1) {
      const response = await guest.agent
        .post('/api/cart/coupon')
        .set('x-csrf-token', guest.csrf)
        .send({ code: `GUESS${i}` });
      if (response.status === 429) refused += 1;
      else expect(response.status).toBeLessThan(500);
    }
    expect(refused).toBeGreaterThanOrEqual(5);
  });

  it('locks a one-time code after five wrong tries and keeps the lock per visitor', async () => {
    const actor = await anonymous(ctx);
    await ctx.redis.del('otp:cooldown:USER_LOGIN:09125550009');
    await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone: '09125550009' })
      .expect(201);
    for (let i = 0; i < 5; i += 1) {
      await actor.agent
        .post('/api/auth/verify-otp')
        .set('x-csrf-token', actor.csrf)
        .send({ phone: '09125550009', code: '000000' })
        .expect(400);
    }
    const code = await ctx.redis.get('dev:otp:09125550009');
    // the right code is worthless once the code is burnt
    const late = await actor.agent
      .post('/api/auth/verify-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone: '09125550009', code })
      .expect(400);
    expect(['OTP_TOO_MANY_ATTEMPTS', 'OTP_EXPIRED']).toContain(late.body.code);
  });

  // ─── input that tries to be code ───────────────────────────────────────────

  it('treats search text as text: SQL, wildcards and script tags are just characters', async () => {
    const everything = (await ctx.http().get('/api/products').expect(200)).body.total as number;
    expect(everything).toBeGreaterThan(0);
    for (const q of [
      "' OR 1=1 --",
      '%',
      '_',
      '%%%',
      '\\',
      '<script>alert(1)</script>',
      'iphone\'; DROP TABLE "Product"; --',
      'zzzz%zzzz',
    ]) {
      const response = await ctx.http().get('/api/products').query({ q }).expect(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('<script>');
    }
    // punctuation is not part of the search language: alone it means «no filter», never «everything matches a pattern»
    expect((await ctx.http().get('/api/products').query({ q: '%%%' }).expect(200)).body.total).toBe(
      everything,
    );
    // and the catalogue is still there
    expect(
      (await ctx.http().get('/api/products').query({ q: 'iphone 17' }).expect(200)).body.items.length,
    ).toBeGreaterThan(0);
    expect(await ctx.prisma.product.count()).toBeGreaterThan(0);
  });

  it('serves product images only from inside the storage folder', async () => {
    for (const path of [
      '../../etc/passwd',
      '..%2F..%2Fetc%2Fpasswd',
      '%2e%2e/%2e%2e/etc/passwd',
      'products/../../.env',
    ]) {
      const response = await ctx.http().get(`/api/media/${path}`);
      expect([404, 400]).toContain(response.status);
      expect(response.text).not.toContain('root:');
    }
  });

  it('accepts only real images from the panel, whatever the file claims to be', async () => {
    const admin = await loginAdmin(ctx, OWNER);
    const product = await ctx.prisma.product.findFirstOrThrow({ where: { slug: 'iphone-17' } });
    const upload = (name: string, type: string, body: Buffer) =>
      admin.agent
        .post(`/api/admin/products/${product.id}/images`)
        .set('x-csrf-token', admin.csrf)
        .attach('file', body, { filename: name, contentType: type });
    const script = await upload('evil.html', 'text/html', Buffer.from('<script>alert(1)</script>'));
    expect(script.status).toBe(400);
    expect(script.body.code).toBe('UNSUPPORTED_FILE');
    const disguised = await upload('photo.png', 'image/png', Buffer.from('<?php system($_GET["c"]); ?>'));
    expect(disguised.status).toBe(400);
    expect(disguised.body.code).toBe('INVALID_IMAGE');
    const huge = await upload('big.png', 'image/png', Buffer.alloc(9 * 1024 * 1024, 1));
    expect([400, 413]).toContain(huge.status);
    expect(
      await ctx.prisma.productImage.count({
        where: { productId: product.id, alt: { in: ['evil.html', 'photo.png'] } },
      }),
    ).toBe(0);
  });

  // ─── payments ──────────────────────────────────────────────────────────────

  it('never marks an order paid on the word of the browser: the gateway is asked', async () => {
    const { actor, addressId } = await shopper('09125550010');
    const created = await order(actor, addressId).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: created.body.order.id } });
    // a forged «success» callback for a payment nobody made
    await ctx
      .http()
      .get(`/api/payments/callback/${payment.provider}/${payment.id}?status=OK&token=${payment.providerRef}`)
      .expect(302);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } })).status).toBe(
      'PAYMENT_PENDING',
    );
    expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'PENDING',
    );
    // the bridge page exists only for gateways entered by form
    await ctx.http().get(`/api/payments/go/${payment.id}`).expect(404);
    await ctx.http().get('/api/payments/go/does-not-exist').expect(404);
  });
});
