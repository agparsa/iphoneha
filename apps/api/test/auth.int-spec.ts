import { anonymous, login, readOtp } from './utils/actors';
import { resetDb } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

describe('Authentication (OTP)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
  });

  it('creates the account on the first successful login', async () => {
    const actor = await anonymous(ctx);
    const phone = '09121110001';

    const sent = await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone: '+98 912 111 0001' })
      .expect(201);
    expect(sent.body).toMatchObject({ sent: true, phone, codeLength: 6 });

    const code = await readOtp(ctx, phone);
    const verified = await actor.agent
      .post('/api/auth/verify-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone, code })
      .expect(201);

    expect(verified.body.isNewUser).toBe(true);
    expect(verified.body.needsProfile).toBe(true);
    expect(verified.body.user.phone).toBe(phone);

    const me = await actor.agent.get('/api/users/me').expect(200);
    expect(me.body.phone).toBe(phone);
  });

  it('stores only a hash of the code', async () => {
    const actor = await anonymous(ctx);
    const phone = '09121110002';
    await actor.agent.post('/api/auth/send-otp').set('x-csrf-token', actor.csrf).send({ phone }).expect(201);
    const code = await readOtp(ctx, phone);
    const record = await ctx.prisma.otpCode.findFirstOrThrow({ where: { phone } });
    expect(record.codeHash).not.toContain(code);
    expect(record.codeHash).toHaveLength(64);
  });

  it('rejects a wrong code and locks the code after 5 attempts', async () => {
    const actor = await anonymous(ctx);
    const phone = '09121110003';
    await actor.agent.post('/api/auth/send-otp').set('x-csrf-token', actor.csrf).send({ phone }).expect(201);

    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await actor.agent
        .post('/api/auth/verify-otp')
        .set('x-csrf-token', actor.csrf)
        .send({ phone, code: '000000' })
        .expect(400);
      expect(response.body.code).toBe('OTP_INVALID');
    }

    const blocked = await actor.agent
      .post('/api/auth/verify-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone, code: '000000' })
      .expect(400);
    expect(blocked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');

    // Even the correct code no longer works — a new one must be requested.
    const code = await readOtp(ctx, phone);
    const afterLock = await actor.agent
      .post('/api/auth/verify-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone, code })
      .expect(400);
    expect(afterLock.body.code).toBe('OTP_EXPIRED');
  });

  it('applies the resend cooldown', async () => {
    const actor = await anonymous(ctx);
    const phone = '09121110004';
    await actor.agent.post('/api/auth/send-otp').set('x-csrf-token', actor.csrf).send({ phone }).expect(201);
    const second = await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone })
      .expect(429);
    expect(second.body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('limits how many codes one phone can request per hour', async () => {
    const actor = await anonymous(ctx);
    const phone = '09121110005';
    // the ceiling is configurable (local dev raises it for the E2E suite), so the
    // test asserts the configured limit rather than a hard-coded number
    const limit = Number(process.env.OTP_MAX_SENDS_PER_HOUR ?? 5);
    for (let i = 0; i < limit; i++) {
      await ctx.redis.del(`otp:cooldown:USER_LOGIN:${phone}`);
      await actor.agent
        .post('/api/auth/send-otp')
        .set('x-csrf-token', actor.csrf)
        .send({ phone })
        .expect(201);
    }
    await ctx.redis.del(`otp:cooldown:USER_LOGIN:${phone}`);
    const blocked = await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone })
      .expect(429);
    expect(blocked.body.message).toContain('بیش از حد مجاز');
  });

  it('limits codes per visitor even when the visitor forges X-Forwarded-For', async () => {
    const actor = await anonymous(ctx);
    const limit = Number(process.env.OTP_MAX_SENDS_PER_IP_PER_HOUR ?? 20);
    // what nginx passes on: whatever the visitor wrote into the header, then
    // the address the request really came from — a new fake one every time
    const send = async (i: number) => {
      // the per-minute request throttle is a separate guard; this test is about the hourly OTP budget
      const throttled = await ctx.redis.keys('throttle:*');
      if (throttled.length) await ctx.redis.del(...throttled);
      return actor.agent
        .post('/api/auth/send-otp')
        .set('x-csrf-token', actor.csrf)
        .set('x-forwarded-for', `10.${i % 250}.${Math.floor(i / 250)}.1, 203.0.113.7`)
        .send({ phone: `0912333${String(i).padStart(4, '0')}` });
    };

    for (let i = 0; i < limit; i++) expect((await send(i)).status).toBe(201);
    const blocked = await send(limit);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain('از این دستگاه');

    // another visitor behind the same proxy is not affected
    await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .set('x-forwarded-for', '203.0.113.8')
      .send({ phone: '09123339999' })
      .expect(201);
  });

  it('requires the CSRF header for state-changing requests', async () => {
    const actor = await anonymous(ctx);
    const response = await actor.agent.post('/api/auth/send-otp').send({ phone: '09121110006' }).expect(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('rejects invalid phone numbers', async () => {
    const actor = await anonymous(ctx);
    const response = await actor.agent
      .post('/api/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone: '0912345' })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('lists and revokes sessions, and logout ends the current one', async () => {
    const first = await login(ctx, '09121110007');
    const second = await login(ctx, '09121110007');

    const sessions = await second.agent.get('/api/auth/sessions').expect(200);
    expect(sessions.body).toHaveLength(2);
    expect(sessions.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    await second.agent.post('/api/auth/sessions/revoke-others').set('x-csrf-token', second.csrf).expect(201);
    await first.agent.get('/api/users/me').expect(401);
    await second.agent.get('/api/users/me').expect(200);

    await second.agent.post('/api/auth/logout').set('x-csrf-token', second.csrf).expect(201);
    await second.agent.get('/api/users/me').expect(401);
  });

  it('blocks admin login for phones that are not administrators', async () => {
    const actor = await anonymous(ctx);
    const phone = '09121110008';
    await actor.agent
      .post('/api/admin/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone })
      .expect(201);
    // No code is delivered for unknown admin phones.
    await expect(readOtp(ctx, phone)).rejects.toThrow();
  });

  it('logs an administrator in and exposes their permissions', async () => {
    const actor = await anonymous(ctx);
    const phone = '09120000000';
    await actor.agent
      .post('/api/admin/auth/send-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone })
      .expect(201);
    const code = await readOtp(ctx, phone);
    const verified = await actor.agent
      .post('/api/admin/auth/verify-otp')
      .set('x-csrf-token', actor.csrf)
      .send({ phone, code })
      .expect(201);
    expect(verified.body.role).toBe('SUPER_ADMIN');
    expect(verified.body.permissions).toContain('products.write');

    const me = await actor.agent.get('/api/admin/auth/me').expect(200);
    expect(me.body.phone).toBe(phone);
  });

  it('keeps customer and admin sessions separate', async () => {
    const customer = await login(ctx, '09121110009');
    await customer.agent.get('/api/admin/auth/me').expect(401);
    await customer.agent.get('/api/admin/dashboard').expect(401);
  });
});
