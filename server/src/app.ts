import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { validateUuidParam } from './middleware/validateUuid';
import { AppError } from './errors/AppError';

export const app = express();

// CORS is opt-in. The browser client is served same-origin (Vite proxy in development),
// so no cross-origin access is granted unless CORS_ORIGIN lists explicit origins.
const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

// Base middleware
app.use(express.json());
app.use(cookieParser());
app.use(requestIdMiddleware);
app.use(requestLogger);

// Automatic UUIDv4 validation for route parameters
app.param('queueId', validateUuidParam('queueId'));
app.param('entryId', validateUuidParam('entryId'));

// Catch-all for undefined routes conforming to SDS §5.1 / §5.3
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(404, 'RESOURCE_NOT_FOUND', `Route ${req.method} ${req.path} not found.`));
});

// Centralized error handler
app.use(errorHandler);
