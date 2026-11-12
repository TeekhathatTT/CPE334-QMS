import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { validateUuidParam } from './middleware/validateUuid';
import { AppError } from './errors/AppError';

export const app = express();

// Base middleware
app.use(cors({ origin: true, credentials: true }));
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
