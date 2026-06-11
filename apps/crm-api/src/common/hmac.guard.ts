import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from '@pulse/shared';
import type { Request } from 'express';
import { config } from '../config';

/**
 * Verifies the HMAC-SHA256 signature on simulator → CRM webhooks
 * (`/api/receipts`). The signature covers the exact raw bytes of the body
 * plus a timestamp bound into the MAC, with a replay window — a captured
 * callback cannot be modified or replayed.
 */
@Injectable()
export class HmacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const result = verifySignature({
      secret: config.hmacSecret,
      timestamp: request.header(TIMESTAMP_HEADER),
      signature: request.header(SIGNATURE_HEADER),
      rawBody: request.rawBody ?? Buffer.alloc(0),
    });
    if (!result.valid) {
      throw new UnauthorizedException({ error: 'invalid_signature', reason: result.reason });
    }
    return true;
  }
}
