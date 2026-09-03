import { Pool } from "pg";

export const DEFAULT_HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";
export const SRUJAN_PROFILE_ID = "11111111-1111-1111-1111-111111111112";
export const DISHA_PROFILE_ID = "11111111-1111-1111-1111-111111111113";

let pool: Pool | null = null;

export function getDb(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured on server.");
    }

    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}
