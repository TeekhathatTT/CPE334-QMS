import express, { Express, NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Default location of the built React client (`npm run build --workspace=client`).
 *
 * Resolved from this file's directory, not the process working directory, so it is the same
 * whether the server runs compiled (`server/dist/staticClient.js`) or from source
 * (`server/src/staticClient.ts`): both sit two levels below the repository root.
 */
export const DEFAULT_CLIENT_DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');

const isApiPath = (requestPath: string): boolean => requestPath === '/api' || requestPath.startsWith('/api/');

/**
 * Serves the built client from the same origin as the API (production only).
 *
 * - Files in `clientDist` are served as static assets.
 * - Any other GET/HEAD request that is NOT under `/api` receives `index.html`, so client-side
 *   routes such as `/customer` work on a hard refresh or deep link.
 * - `/api/...` requests are never touched here; unknown API paths still reach the JSON
 *   `404 RESOURCE_NOT_FOUND` catch-all.
 *
 * Throws at startup if the build output is missing, instead of silently serving nothing.
 */
export function mountClient(app: Express, clientDist: string = DEFAULT_CLIENT_DIST): void {
  const indexHtml = path.join(clientDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      `Client build not found: ${indexHtml} does not exist. ` +
        'Run "npm run build" before starting the server with NODE_ENV=production.'
    );
  }

  const serveStatic = express.static(clientDist, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isApiPath(req.path)) return next();
    serveStatic(req, res, next);
  });

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (isApiPath(req.path)) return next();
    // index.html references hashed asset names, so it must be revalidated on every load.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });
}
