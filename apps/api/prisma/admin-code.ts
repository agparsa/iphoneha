/**
 * Break-glass admin login: prints a one-time admin login code in the server
 * terminal, for when SMS cannot deliver one (pattern not approved yet, the SMS
 * service unreachable). Run by deploy/admin-code.sh as the app user — whoever
 * can run it already controls the server, so it opens nothing new.
 *
 *   ADMIN_CODE_PHONE   an ACTIVE admin's mobile
 *
 * The code replaces any code sent to that phone before (the newest one is the
 * only valid one), so request the code on the login page FIRST, then run this.
 */
import { createHmac, randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '@iphoneha/shared';
import { loadRootEnv } from './seed-env';

loadRootEnv();

const prisma = new PrismaClient();
const VALID_MINUTES = 10;

async function main(): Promise<void> {
  const phone = normalizePhone(process.env.ADMIN_CODE_PHONE);
  if (!phone) throw new Error('ADMIN_CODE_PHONE is not a valid Iranian mobile number');
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error('OTP_SECRET is not set');

  const admin = await prisma.adminUser.findUnique({ where: { phone } });
  if (!admin?.isActive) throw new Error(`${phone} is not an active admin of this store`);

  const length = Number(process.env.OTP_LENGTH) || 6;
  let code = '';
  for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();

  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { phone, purpose: 'ADMIN_LOGIN', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpCode.create({
      data: {
        phone,
        purpose: 'ADMIN_LOGIN',
        // exactly how OtpService hashes a code, so the normal login accepts it
        codeHash: createHmac('sha256', secret).update(`${phone}:ADMIN_LOGIN:${code}`).digest('hex'),
        expiresAt: new Date(Date.now() + VALID_MINUTES * 60_000),
        maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
        ip: 'server-console',
      },
    }),
  ]);

  console.log(`\n  admin login code for ${phone} (${admin.name}):\n\n      ${code}\n`);
  console.log(
    `  valid for ${VALID_MINUTES} minutes, once — type it on the login page where the SMS code goes\n`,
  );
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
