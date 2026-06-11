import { sendRequestSchema, type SendResponse } from '@pulse/shared';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { SimulatorState, simulatorConfigSchema } from './channels';
import { config } from './config';
import { CallbackEmitter } from './emitter';
import { requireAdminKey, requireHmacSignature } from './middleware';
import { TokenBucket } from './throttle';
import type { Channel } from '@pulse/shared';

const state = new SimulatorState();
const emitter = new CallbackEmitter(state, config.hmacSecret, config.callbackAllowlist);
emitter.start();

const buckets: Record<Channel, TokenBucket> = {
  whatsapp: new TokenBucket(state.channels.whatsapp.ratePerSec, state.channels.whatsapp.burst),
  sms: new TokenBucket(state.channels.sms.ratePerSec, state.channels.sms.burst),
  email: new TokenBucket(state.channels.email.ratePerSec, state.channels.email.burst),
  rcs: new TokenBucket(state.channels.rcs.ratePerSec, state.channels.rcs.burst),
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
);

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'channel-simulator', pendingCallbacks: emitter.pendingCount() });
});

/**
 * POST /send — the vendor send API.
 * HMAC-verified, schema-validated, throttled per channel. Accepted messages
 * get a planned lifecycle of async callbacks; throttled ones are returned for
 * the CRM to re-enqueue with backoff.
 */
app.post('/send', requireHmacSignature, (req, res) => {
  const parsed = sendRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
    return;
  }
  const { messages, callback_url } = parsed.data;

  if (!emitter.isAllowedCallbackUrl(callback_url)) {
    res.status(400).json({ error: 'callback_url_not_allowed' });
    return;
  }

  const result: SendResponse = { accepted: [], throttled: [], rejected: [] };
  for (const message of messages) {
    if (!buckets[message.channel].take()) {
      result.throttled.push(message.message_id);
      continue;
    }
    emitter.schedule(message.message_id, message.channel, callback_url);
    result.accepted.push(message.message_id);
  }

  res.status(202).json(result);
});

/** Chaos panel API — read and tune failure/latency/chaos dials at runtime. */
app.get('/admin/config', requireAdminKey, (_req, res) => {
  res.json({ ...state.snapshot(), stats: emitter.stats });
});

app.put('/admin/config', requireAdminKey, (req, res) => {
  const parsed = simulatorConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_config', issues: parsed.error.flatten() });
    return;
  }
  state.apply(parsed.data);
  for (const channel of Object.keys(buckets) as Channel[]) {
    buckets[channel].configure(state.channels[channel].ratePerSec, state.channels[channel].burst);
  }
  res.json(state.snapshot());
});

// No stack traces or internals in error responses.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[channel-simulator] unhandled error:', err);
  res.status(err.name === 'PayloadTooLargeError' ? 413 : 500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`[channel-simulator] listening on :${config.port} (env=${config.env})`);
});
