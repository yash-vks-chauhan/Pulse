import 'reflect-metadata';
// config import first: validates the environment and fails fast pre-boot.
import { config } from './config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@pulse/shared';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(helmet());

  // Custom JSON parser: bounded body size + raw-body capture so webhook HMAC
  // signatures verify against the exact bytes that were signed.
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.enableCors({
    origin: [config.webOrigin],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-api-key', SIGNATURE_HEADER, TIMESTAMP_HEADER],
    maxAge: 600,
  });

  app.setGlobalPrefix('api', { exclude: ['healthz'] });
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`crm-api listening on :${config.port} (env=${config.env})`);
}

void bootstrap();
