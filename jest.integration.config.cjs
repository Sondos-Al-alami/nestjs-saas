/**
 * Jest config for black-box integration / E2E tests.
 */
const { resolve } = require('node:path');
const integrationTsconfig = require('./test/integration/tsconfig.json');

/** @type {import('jest').Config} */
module.exports = {
  rootDir: resolve(__dirname),
  testEnvironment: 'node',
  testRegex: '\\.integration-spec\\.ts$',
  testTimeout: 60_000,
  maxWorkers: 1,
  globalSetup: '<rootDir>/test/integration/global-setup.cjs',
  globalTeardown: '<rootDir>/test/integration/global-teardown.cjs',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          ...integrationTsconfig.compilerOptions,
          module: 'commonjs',
          moduleResolution: 'node16',
          resolvePackageJsonExports: false,
        },
      },
    ],
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@saas/common$': '<rootDir>/libs/common/src/index.ts',
    '^@saas/common/(.*)$': '<rootDir>/libs/common/src/$1',
  },
};
