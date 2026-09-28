import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

/**
 * A `libsql://` (or `https://...turso.io`) URL means we're pointed at Turso
 * and need the driver adapter to reach it over the network; a local `file:`
 * URL (dev/tests) talks to the SQLite file directly with no adapter, exactly
 * as before this migration.
 */
function isRemoteLibsqlUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith('libsql://') || url.startsWith('https://'));
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (isRemoteLibsqlUrl(databaseUrl)) {
      const adapter = new PrismaLibSql({
        url: databaseUrl!,
        authToken: process.env.DATABASE_AUTH_TOKEN,
      });
      super({ adapter });
    } else {
      super();
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
