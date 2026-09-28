import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

/**
 * A `libsql://` (or `https://...turso.io`) URL means we're pointed at Turso
 * and need the driver adapter to reach it over the network; a local `file:`
 * URL (dev/tests) connects directly with no adapter.
 */
function isRemoteLibsqlUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith('libsql://') || url.startsWith('https://'));
}

export function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (isRemoteLibsqlUrl(databaseUrl)) {
    const adapter = new PrismaLibSql({
      url: databaseUrl!,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}
