import { enableBigIntSerialization } from '../src/common/bigint';
import { loadRootEnv } from '../prisma/seed-env';

loadRootEnv();
enableBigIntSerialization();

process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = './storage-test';
process.env.DEV_EXPOSE_OTP = 'true';
process.env.SMS_DRIVER = 'console';
process.env.PAYMENT_ONLINE_DRIVER = 'mock';
process.env.RESERVATION_TTL_MINUTES = process.env.RESERVATION_TTL_MINUTES ?? '15';
