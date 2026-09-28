import * as path from 'path';

// Single source of truth for the test database location, shared by the
// global setup (schema push) and every test file (via jest setupFiles),
// so unit/integration tests never touch the dev.db that `prisma db seed`
// populates.
export const TEST_DB_PATH = path.join(__dirname, 'test.db');
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;
