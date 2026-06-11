import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqualStrings } from '@pulse/shared';
import type { Request } from 'express';
import { config } from '../config';

/**
 * API-key auth for all write endpoints (`x-api-key`). Comparison is
 * timing-safe. The web app holds the key server-side only — it never reaches
 * the browser.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key');
    if (!provided || !timingSafeEqualStrings(provided, config.apiKey)) {
      throw new UnauthorizedException({ error: 'invalid_api_key' });
    }
    return true;
  }
}
