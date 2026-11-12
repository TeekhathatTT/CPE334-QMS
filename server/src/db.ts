import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

export const getDatabaseUrl = (): string => {
  if (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  return (
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/qms_db?schema=public'
  );
};

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
    },
  },
});
