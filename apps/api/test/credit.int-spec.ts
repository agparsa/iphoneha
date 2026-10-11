import { anonymous, loginAdmin, type Actor } from './utils/actors';
import { resetDb } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

/** «خرید اقساطی با چک صیادی یا سفته»: the storefront form and the admin inbox. */
describe('Credit requests', () => {
  let ctx: TestContext;
  let visitor: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    visitor = await anonymous(ctx);
  });

  const request = {
    name: 'علی رضایی',
    phone: '09121234567',
    city: 'اصفهان',
    method: 'CHEQUE',
    productSlug: 'iphone-17-pro-max',
    months: 12,
    note: 'پیش‌پرداخت ۳۰ درصد دارم',
    source: '/installments/cheque',
  };

  /** Each test sends from its own address, so the per-visitor throttle stays out of the way. */
  const send = (body: Record<string, unknown>, ip = '203.0.113.20') =>
    visitor.agent
      .post('/api/credit-requests')
      .set('x-csrf-token', visitor.csrf)
      .set('x-forwarded-for', ip)
      .send(body);

  async function addSupportAdmin(): Promise<Actor> {
    await ctx.prisma.adminUser.create({
      data: { phone: '09120000002', name: 'پشتیبان فروش', role: 'SUPPORT' },
    });
    return loginAdmin(ctx, '09120000002');
  }

  it('stores a request and answers with a number to quote on the phone', async () => {
    const response = await send(request).expect(201);
    expect(response.body).toEqual({ number: expect.any(Number), duplicate: false });

    const stored = await ctx.prisma.creditRequest.findFirstOrThrow({ include: { product: true } });
    expect(stored).toMatchObject({
      number: response.body.number,
      name: 'علی رضایی',
      phone: '09121234567',
      city: 'اصفهان',
      method: 'CHEQUE',
      months: 12,
      source: '/installments/cheque',
      status: 'NEW',
    });
    expect(stored.product?.slug).toBe('iphone-17-pro-max');
    // the name is kept as written, so a renamed model still reads right
    expect(stored.productName).toBe(stored.product?.name);
  });

  it('accepts Persian digits and a request without a model', async () => {
    await send({ name: 'مریم احمدی', phone: '۰۹۱۲۷۶۵۴۳۲۱', method: 'SAFTE' }).expect(201);
    const stored = await ctx.prisma.creditRequest.findFirstOrThrow();
    expect(stored).toMatchObject({ phone: '09127654321', method: 'SAFTE', productId: null, months: null });
  });

  it('rejects an incomplete or malformed form with field errors', async () => {
    const response = await send({ ...request, name: 'ع', phone: '12345', method: 'LOAN' }).expect(400);
    const fields = Object.keys(response.body.details?.fields ?? {});
    expect(fields).toEqual(expect.arrayContaining(['name', 'phone', 'method']));

    await send({ ...request, source: 'https://evil.example/x' }).expect(400);
    await send({ ...request, months: 60 }).expect(400);
    expect(await ctx.prisma.creditRequest.count()).toBe(0);
  });

  it('ignores a model that is not on sale instead of failing the request', async () => {
    await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: false } });
    await send({ ...request, productSlug: 'iphone-16' }).expect(201);
    const stored = await ctx.prisma.creditRequest.findFirstOrThrow();
    expect(stored.productId).toBeNull();
  });

  it('drops a request whose hidden honeypot field was filled in', async () => {
    const response = await send({ ...request, website: 'https://spam.example' }).expect(201);
    expect(response.body).toEqual({ number: null, duplicate: false });
    expect(await ctx.prisma.creditRequest.count()).toBe(0);
  });

  it('treats a second form from the same phone within a day as the same request', async () => {
    const first = await send(request).expect(201);
    const again = await send({ ...request, method: 'SAFTE' }, '203.0.113.21').expect(201);
    expect(again.body).toEqual({ number: first.body.number, duplicate: true });
    expect(await ctx.prisma.creditRequest.count()).toBe(1);

    // once it is closed, the customer can ask again
    await ctx.prisma.creditRequest.updateMany({ data: { status: 'CANCELLED' } });
    const fresh = await send(request, '203.0.113.22').expect(201);
    expect(fresh.body.duplicate).toBe(false);
    expect(fresh.body.number).not.toBe(first.body.number);
  });

  it('limits how many forms one visitor can send', async () => {
    for (let i = 0; i < 5; i++) {
      await send({ ...request, phone: `0912000${String(i).padStart(4, '0')}` }, '203.0.113.30').expect(201);
    }
    const blocked = await send({ ...request, phone: '09120009999' }, '203.0.113.30');
    expect(blocked.status).toBe(429);
    // another visitor is not affected
    await send({ ...request, phone: '09120009999' }, '203.0.113.31').expect(201);
  });

  it('requires the CSRF header', async () => {
    await visitor.agent.post('/api/credit-requests').send(request).expect(403);
  });

  describe('admin inbox', () => {
    it('lists requests newest first with a count per status', async () => {
      await send(request).expect(201);
      await send(
        { ...request, name: 'رضا کریمی', phone: '09351112233', method: 'SAFTE' },
        '203.0.113.23',
      ).expect(201);
      const admin = await loginAdmin(ctx, '09120000000');

      const list = await admin.agent.get('/api/admin/credit-requests').expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.counts).toEqual({ NEW: 2, CONTACTED: 0, CONTRACTED: 0, CANCELLED: 0 });
      expect(list.body.items[0]).toMatchObject({
        name: 'رضا کریمی',
        method: 'SAFTE',
        methodLabel: 'سفته',
        status: 'NEW',
        statusLabel: 'جدید',
        product: { slug: 'iphone-17-pro-max' },
      });

      // the open panel compares latestNumber to notice a request that just came in
      const summary = await admin.agent.get('/api/admin/credit-requests/summary').expect(200);
      expect(summary.body).toEqual({ new: 2, latestNumber: list.body.items[0].number });
    });

    it('lets support staff update the status and note, and audits it', async () => {
      await send(request).expect(201);
      const support = await addSupportAdmin();
      const [item] = (await support.agent.get('/api/admin/credit-requests').expect(200)).body.items;

      const updated = await support.agent
        .patch(`/api/admin/credit-requests/${item.id}`)
        .set('x-csrf-token', support.csrf)
        .send({ status: 'CONTACTED', adminNote: 'فردا مدارک را می‌فرستد' })
        .expect(200);
      expect(updated.body).toMatchObject({
        status: 'CONTACTED',
        statusLabel: 'تماس گرفته شد',
        adminNote: 'فردا مدارک را می‌فرستد',
        handledBy: 'پشتیبان فروش',
      });
      expect(updated.body.handledAt).toEqual(expect.any(String));

      const filtered = await support.agent.get('/api/admin/credit-requests?status=CONTACTED').expect(200);
      expect(filtered.body.items).toHaveLength(1);
      expect((await support.agent.get('/api/admin/credit-requests/summary').expect(200)).body).toEqual({
        new: 0,
        latestNumber: item.number,
      });

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'credit_request.update' },
      });
      expect(audit.entityId).toBe(item.id);
      expect(audit.before).toEqual({ status: 'NEW', adminNote: null });
      // the audit trail keeps the workflow, not the customer's details
      expect(JSON.stringify(audit.after)).not.toContain('09121234567');

      // saving only the status keeps the note
      const moved = await support.agent
        .patch(`/api/admin/credit-requests/${item.id}`)
        .set('x-csrf-token', support.csrf)
        .send({ status: 'CONTRACTED' })
        .expect(200);
      expect(moved.body).toMatchObject({ status: 'CONTRACTED', adminNote: 'فردا مدارک را می‌فرستد' });

      // a note alone does not change who handled the status
      const noted = await support.agent
        .patch(`/api/admin/credit-requests/${item.id}`)
        .set('x-csrf-token', support.csrf)
        .send({ adminNote: '' })
        .expect(200);
      expect(noted.body).toMatchObject({
        status: 'CONTRACTED',
        adminNote: null,
        handledAt: moved.body.handledAt,
      });

      await support.agent
        .patch(`/api/admin/credit-requests/${item.id}`)
        .set('x-csrf-token', support.csrf)
        .send({})
        .expect(400);
    });

    it('keeps the inbox away from roles without leads permissions', async () => {
      await send(request).expect(201);
      const [row] = await ctx.prisma.creditRequest.findMany();
      const warehouse = await loginAdmin(ctx, '09120000001');

      await ctx.http().get('/api/admin/credit-requests').expect(401);
      await warehouse.agent.get('/api/admin/credit-requests').expect(403);
      await warehouse.agent.get('/api/admin/credit-requests/summary').expect(403);
      await warehouse.agent
        .patch(`/api/admin/credit-requests/${row!.id}`)
        .set('x-csrf-token', warehouse.csrf)
        .send({ status: 'CANCELLED' })
        .expect(403);
    });

    it('answers 404 for an unknown request', async () => {
      const admin = await loginAdmin(ctx, '09120000000');
      await admin.agent
        .patch('/api/admin/credit-requests/nope')
        .set('x-csrf-token', admin.csrf)
        .send({ status: 'CONTACTED' })
        .expect(404);
    });
  });
});
