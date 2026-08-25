import { PrismaClient } from '../../apps/auth-org-service/src/generated/prisma';
import { readIntegrationEnv } from './integration-env';

let client: PrismaClient | undefined;

export function getAuthDb(): PrismaClient {
  if (!client) {
    const url = readIntegrationEnv().INTEGRATION_DATABASE_URL_AUTH_ORG?.trim();
    if (!url) {
      throw new Error(
        'INTEGRATION_DATABASE_URL_AUTH_ORG is required for auth_db assertions',
      );
    }
    client = new PrismaClient({
      datasources: { db: { url } },
    });
  }
  return client;
}

export async function disconnectAuthDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
