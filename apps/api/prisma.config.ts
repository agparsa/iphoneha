import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { loadRootEnv } from './prisma/seed-env';

// The monorepo keeps a single .env at the root; Prisma only looks next to the
// schema, so it is loaded here before the datasource URL is resolved.
loadRootEnv();

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
