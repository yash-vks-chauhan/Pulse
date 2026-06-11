import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  timingSafeEqualStrings,
  verifySignature,
} from '@pulse/shared';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

/** Rejects /send requests that are not HMAC-signed by the CRM. */
export function requireHmacSignature(req: Request, res: Response, next: NextFunction): void {
  const result = verifySignature({
    secret: config.hmacSecret,
    timestamp: req.header(TIMESTAMP_HEADER),
    signature: req.header(SIGNATURE_HEADER),
    rawBody: req.rawBody ?? Buffer.alloc(0),
  });
  if (!result.valid) {
    res.status(401).json({ error: 'invalid_signature', reason: result.reason });
    return;
  }
  next();
}

/** Protects the chaos/config endpoints with the admin key (timing-safe). */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-admin-key');
  if (!provided || !timingSafeEqualStrings(provided, config.adminKey)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
