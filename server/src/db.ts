import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/qms_db?schema=public',
    },
  },
});
