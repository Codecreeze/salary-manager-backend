import { execSync } from 'child_process';
import * as fs from 'fs';
import { TEST_DATABASE_URL, TEST_DB_PATH } from './test-db';

export default async function globalSetup() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${TEST_DB_PATH}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  execSync('npx prisma db push --skip-generate --schema=prisma/schema.prisma', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
