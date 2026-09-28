/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/jest.global-setup.ts',
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  // All spec files share one SQLite test database file; run serially to
  // avoid cross-file race conditions on shared tables.
  maxWorkers: 1,
};
