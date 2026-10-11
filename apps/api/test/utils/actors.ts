import type request from 'supertest';
import type { TestContext } from './test-app';

export interface Actor {
  agent: request.Agent;
  csrf: string;
  phone: string;
  userId?: string;
}

const CSRF_COOKIE = 'ih_csrf';

function csrfFromResponse(response: request.Response): string | null {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  if (!cookies) return null;
  for (const cookie of cookies) {
    if (cookie.startsWith(`${CSRF_COOKIE}=`)) return cookie.split(';')[0]!.split('=')[1]!;
  }
  return null;
}

/** Creates an agent that carries cookies and the CSRF header like the browser does. */
export async function anonymous(ctx: TestContext): Promise<Actor> {
  const agent = ctx.http();
  const response = await agent.get('/api/auth/csrf');
  const csrf = csrfFromResponse(response) ?? response.body.csrfToken;
  return { agent, csrf, phone: '' };
}

/** Full OTP login: send code, read it from the dev endpoint, verify. */
export async function login(ctx: TestContext, phone: string): Promise<Actor> {
  const actor = await anonymous(ctx);
  actor.phone = phone;
  // Tests log the same number in repeatedly; skip the human-facing resend cooldown.
  await ctx.redis.del(`otp:cooldown:USER_LOGIN:${phone}`);
  await actor.agent.post('/api/auth/send-otp').set('x-csrf-token', actor.csrf).send({ phone }).expect(201);
  const code = await readOtp(ctx, phone);
  const response = await actor.agent
    .post('/api/auth/verify-otp')
    .set('x-csrf-token', actor.csrf)
    .send({ phone, code })
    .expect(201);
  actor.userId = response.body.user.id;
  return actor;
}

export async function loginWithProfile(ctx: TestContext, phone: string, first = 'کاربر', last = 'آزمایشی') {
  const actor = await login(ctx, phone);
  await actor.agent
    .patch('/api/users/me')
    .set('x-csrf-token', actor.csrf)
    .send({ firstName: first, lastName: last })
    .expect(200);
  return actor;
}

export async function loginAdmin(ctx: TestContext, phone: string): Promise<Actor> {
  const actor = await anonymous(ctx);
  actor.phone = phone;
  await ctx.redis.del(`otp:cooldown:ADMIN_LOGIN:${phone}`);
  await actor.agent
    .post('/api/admin/auth/send-otp')
    .set('x-csrf-token', actor.csrf)
    .send({ phone })
    .expect(201);
  const code = await readOtp(ctx, phone);
  await actor.agent
    .post('/api/admin/auth/verify-otp')
    .set('x-csrf-token', actor.csrf)
    .send({ phone, code })
    .expect(201);
  return actor;
}

export async function readOtp(ctx: TestContext, phone: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = await ctx.redis.get(`dev:otp:${phone}`);
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no OTP was issued for ${phone}`);
}

export async function defaultAddress(actor: Actor): Promise<string> {
  const response = await actor.agent
    .post('/api/users/me/addresses')
    .set('x-csrf-token', actor.csrf)
    .send({
      recipientName: 'گیرنده آزمایشی',
      mobile: actor.phone || '09120000009',
      province: 'تهران',
      city: 'تهران',
      addressLine: 'خیابان آزمایشی، پلاک ۱۰، واحد ۲',
      postalCode: '1234567890',
    })
    .expect(201);
  return response.body.id;
}
