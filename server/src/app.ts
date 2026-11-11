import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { validateUuidParam } from './middleware/validateUuid';
import { prisma } from './db';
import { AppError } from './errors/AppError';

export const app = express();

// Base middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(requestIdMiddleware);

// Automatic UUIDv4 validation for path parameters
app.param('queueId', validateUuidParam('queueId'));
app.param('entryId', validateUuidParam('entryId'));

// Healthcheck route
app.get('/api/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      data: {
        status: 'ok',
        db: true,
      },
    });
  } catch (err) {
    res.status(500).json({
      data: {
        status: 'error',
        db: false,
      },
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Database connection failed.',
        requestId: req.requestId,
      },
    });
  }
});

// Sprint 1 Route Stubs for Foundation & UUID parameter validation
app.get('/api/queues/:queueId', (req: Request, res: Response) => {
  res.status(200).json({
    data: {
      queueId: req.params.queueId,
    },
  });
});

app.get('/api/me/queue-entries/:entryId', (req: Request, res: Response) => {
  res.status(200).json({
    data: {
      entryId: req.params.entryId,
    },
  });
});

// Catch-all for unhandled routes
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(404, 'RESOURCE_NOT_FOUND', `Route ${req.method} ${req.path} not found.`));
});

// Centralized error handler
app.use(errorHandler);

