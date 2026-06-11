import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { config, type AiProvider } from '../config';
import {
  buildDraftSystemPrompt,
  buildDraftUserMessage,
  buildInsightsUserMessage,
  buildJsonInstruction,
  buildRetryMessage,
  buildSegmentUserMessage,
  DRAFT_OUTPUT_SCHEMA,
  INSIGHTS_OUTPUT_SCHEMA,
  INSIGHTS_SYSTEM_PROMPT,
  parseDraftResponse,
  parseInsightsResponse,
  parseSegmentResponse,
  SEGMENT_OUTPUT_SCHEMA,
  SEGMENT_SYSTEM_PROMPT,
  type AiDraftResponse,
  type AiInsightsResponse,
  type AiSegmentResponse,
  type ParseResult,
} from './ai.logic';
import type { DraftRequest, NlSegmentRequest } from './ai.schemas';

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1024;
/** A rate-limited provider sits out this long before the chain retries it. */
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Internal transport failure — drives the chain's failover decision. */
class ProviderError extends Error {
  constructor(
    message: string,
    readonly rateLimited: boolean,
  ) {
    super(message);
  }
}

/**
 * The only place in the system that talks to an LLM — now a failover CHAIN
 * of providers, free tiers first:
 *
 *   openrouter (free models + model fallback) → gemini (free tier) →
 *   groq (free tier) → anthropic (paid, if keyed)
 *
 * Each provider is its own account on its own service, used within its own
 * terms; when one is rate-limited it cools down for 5 minutes and the next
 * leg serves. The REAL guarantee stays local and provider-independent:
 * every response is zod-validated (one corrective retry, then an honest
 * 422), the LLM produces artifacts — never actions — and no customer PII
 * ever goes upstream. Upstream errors are logged here, clients get generics.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic: Anthropic | undefined;
  private readonly cooldownUntil = new Map<AiProvider, number>();

  constructor() {
    this.anthropic = config.aiKeys.anthropic
      ? new Anthropic({
          apiKey: config.aiKeys.anthropic,
          timeout: REQUEST_TIMEOUT_MS,
          maxRetries: 1,
        })
      : undefined;
    if (config.aiChain.length > 0) {
      this.logger.log(
        `AI chain: ${config.aiChain.map((p) => `${p} (${config.aiModels[p]})`).join(' → ')}`,
      );
    }
  }

  get configured(): boolean {
    return config.aiChain.length > 0;
  }

  async nlToSegment(input: NlSegmentRequest): Promise<AiSegmentResponse & { model: string }> {
    return this.completeWithOneRetry(
      SEGMENT_SYSTEM_PROMPT,
      buildSegmentUserMessage(input.prompt),
      SEGMENT_OUTPUT_SCHEMA,
      parseSegmentResponse,
      0.2,
    );
  }

  async draftMessages(input: DraftRequest): Promise<AiDraftResponse & { model: string }> {
    const result = await this.completeWithOneRetry(
      buildDraftSystemPrompt(input.channel, input.variant_count),
      buildDraftUserMessage(input.objective, input.audience_summary),
      DRAFT_OUTPUT_SCHEMA,
      (text) => parseDraftResponse(text, input.channel),
      0.9,
    );
    // Cap to the requested count even if the model over-delivers.
    return { ...result, variants: result.variants.slice(0, input.variant_count) };
  }

  /** Aggregate stats in (no PII), narrative + next-action out. */
  async summarizeCampaign(stats: unknown): Promise<AiInsightsResponse & { model: string }> {
    return this.completeWithOneRetry(
      INSIGHTS_SYSTEM_PROMPT,
      buildInsightsUserMessage(stats),
      INSIGHTS_OUTPUT_SCHEMA,
      parseInsightsResponse,
      0.4,
    );
  }

  /**
   * One chain pass + at most one corrective retry: validation issues are fed
   * back verbatim; a second invalid response fails the request honestly.
   */
  private async completeWithOneRetry<T>(
    system: string,
    userMessage: string,
    outputSchema: unknown,
    parse: (text: string) => ParseResult<T>,
    temperature: number,
  ): Promise<T & { model: string }> {
    if (!this.configured) {
      throw new ServiceUnavailableException({ error: 'ai_not_configured' });
    }

    const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, servedBy } = await this.completeViaChain(
        system,
        messages,
        outputSchema,
        temperature,
      );
      const parsed = parse(text);
      if (parsed.ok) return { ...parsed.value, model: servedBy };

      this.logger.warn(
        `AI response failed validation (attempt ${attempt + 1}, ${servedBy}): ${parsed.issues.join('; ')}`,
      );
      if (attempt === 0) {
        messages.push(
          { role: 'assistant', content: text },
          { role: 'user', content: buildRetryMessage(parsed.issues) },
        );
        continue;
      }
      throw new UnprocessableEntityException({
        error: 'ai_invalid_output',
        issues: parsed.issues,
      });
    }
    /* istanbul ignore next -- unreachable */
    throw new UnprocessableEntityException({ error: 'ai_invalid_output' });
  }

  /** Walk the provider chain; rate-limited legs cool down for 5 minutes. */
  private async completeViaChain(
    system: string,
    messages: ChatMessage[],
    outputSchema: unknown,
    temperature: number,
  ): Promise<{ text: string; servedBy: string }> {
    const now = Date.now();
    let sawRateLimit = false;

    for (const provider of config.aiChain) {
      if ((this.cooldownUntil.get(provider) ?? 0) > now) {
        sawRateLimit = true;
        continue;
      }
      try {
        const text = await this.completeWith(provider, system, messages, outputSchema, temperature);
        return { text, servedBy: `${provider}:${config.aiModels[provider]}` };
      } catch (error) {
        if (error instanceof ProviderError) {
          if (error.rateLimited) {
            sawRateLimit = true;
            this.cooldownUntil.set(provider, Date.now() + RATE_LIMIT_COOLDOWN_MS);
            this.logger.warn(`${provider} rate-limited — cooling down 5 min, trying next leg`);
          } else {
            this.logger.error(`${provider} failed: ${error.message} — trying next leg`);
          }
          continue;
        }
        throw error;
      }
    }

    if (sawRateLimit) {
      throw new ServiceUnavailableException({ error: 'ai_rate_limited' });
    }
    throw new BadGatewayException({ error: 'ai_upstream_error' });
  }

  private completeWith(
    provider: AiProvider,
    system: string,
    messages: ChatMessage[],
    outputSchema: unknown,
    temperature: number,
  ): Promise<string> {
    switch (provider) {
      case 'anthropic':
        return this.completeAnthropic(system, messages, outputSchema);
      case 'openrouter':
        return this.completeOpenAiCompatible(provider, OPENROUTER_URL, system, messages, outputSchema, temperature, {
          // OpenRouter-only: within-provider model fallback routing.
          ...(config.aiFallbackModels.length > 0
            ? { models: [config.aiModels.openrouter, ...config.aiFallbackModels] }
            : {}),
        });
      case 'groq':
        return this.completeOpenAiCompatible(provider, GROQ_URL, system, messages, outputSchema, temperature, {});
      case 'gemini':
        return this.completeGemini(system, messages, outputSchema, temperature);
    }
  }

  private async completeAnthropic(
    system: string,
    messages: ChatMessage[],
    outputSchema: unknown,
  ): Promise<string> {
    try {
      const response = await this.anthropic!.messages.create({
        model: config.aiModels.anthropic,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages,
        output_config: {
          format: {
            type: 'json_schema',
            schema: outputSchema as Record<string, unknown>,
          },
        },
      });
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ProviderError(`anthropic ${error.status}: ${error.message}`, error.status === 429);
      }
      throw new ProviderError(`anthropic unreachable: ${(error as Error).message}`, false);
    }
  }

  /** OpenAI-compatible chat completions (OpenRouter, Groq). Schema rides in
   *  the prompt — free-model support for server-side formats is spotty. */
  private async completeOpenAiCompatible(
    provider: AiProvider,
    url: string,
    system: string,
    messages: ChatMessage[],
    outputSchema: unknown,
    temperature: number,
    extraBody: Record<string, unknown>,
  ): Promise<string> {
    const body = JSON.stringify({
      model: config.aiModels[provider],
      messages: [
        { role: 'system', content: system + buildJsonInstruction(outputSchema) },
        ...messages,
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature,
      ...extraBody,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.aiKeys[provider]}`,
          'content-type': 'application/json',
          ...(provider === 'openrouter'
            ? { 'http-referer': config.webOrigin, 'x-title': 'Pulse Campaign Copilot' }
            : {}),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderError(`${provider} unreachable: ${(error as Error).message}`, false);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError(
        `${provider} ${response.status}: ${detail.slice(0, 300)}`,
        response.status === 429,
      );
    }

    const payload = (await response.json().catch(() => undefined)) as
      | { choices?: Array<{ message?: { content?: string | null } }> }
      | undefined;
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      throw new ProviderError(`${provider} returned an empty completion`, false);
    }
    return text;
  }

  /** Google AI Studio (Gemini) REST API — free tier, JSON response mode. */
  private async completeGemini(
    system: string,
    messages: ChatMessage[],
    outputSchema: unknown,
    temperature: number,
  ): Promise<string> {
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: system + buildJsonInstruction(outputSchema) }] },
      contents: messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature,
        responseMimeType: 'application/json',
      },
    });

    let response: Response;
    try {
      response = await fetch(`${GEMINI_URL_BASE}/${config.aiModels.gemini}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': config.aiKeys.gemini!,
          'content-type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderError(`gemini unreachable: ${(error as Error).message}`, false);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError(
        `gemini ${response.status}: ${detail.slice(0, 300)}`,
        response.status === 429,
      );
    }

    const payload = (await response.json().catch(() => undefined)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      | undefined;
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');
    if (typeof text !== 'string' || text.length === 0) {
      throw new ProviderError('gemini returned an empty completion', false);
    }
    return text;
  }
}
