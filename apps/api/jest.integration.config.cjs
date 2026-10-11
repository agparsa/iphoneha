const base = require('./jest.config.cjs');

/** Integration tests: real PostgreSQL + Redis (see test/setup-integration.ts). */
module.exports = {
  ...base,
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
  setupFiles: [],
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFilesAfterEnv: ['<rootDir>/test/setup-integration.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
};
