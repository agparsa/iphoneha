import Redis from 'ioredis';
import { loadRootEnv } from '../prisma/seed-env';

/**
 * Clears the OTP counters (cooldown, per-phone and per-IP budgets) in Redis.
 * Handy when a local E2E run has used up the hourly allowance.
 */
async function main(): Promise<void> {
  loadRootEnv();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  const patterns = ['otp:*', 'dev:otp:*'];
  let removed = 0;

  for (const pattern of patterns) {
    const stream = redis.scanStream({ match: pattern, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length === 0) continue;
      removed += await redis.del(...keys);
    }
  }

  console.log(`✓ ${removed} OTP key(s) cleared`);
  await redis.quit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
