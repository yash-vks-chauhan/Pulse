import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { config } from '../config';
import {
  buildDraftSystemPrompt,
  buildDraftUserMessage,
  buildRetryMessage,
  buildSegmentUserMessage,
  DRAFT_OUTPUT_SCHEMA,
  parseDraftResponse,
  parseSegmentResponse,
  SEGMENT_OUTPUT_SCHEMA,
  SEGMENT_SYSTEM_PROMPT,
  type AiDraftResponse,
  type AiSegmentResponse,
  type ParseResult,
} from './ai.logic';
import type { DraftRequest, NlSegmentRequest } from './ai.schemas';

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1024;

/**
 * The only place in the system that talks to an LLM.
 *
 *  - Structured outputs constrain the response to a JSON schema server-side;
 *    the result is then re-validated with zod here (defense in depth) and
 *    invalid documents get exactly one corrective retry before failing
 *    honestly with a 422.
 *  - The LLM produces artifacts (DSL / drafts), never actions. It has no
 *    tools, no database access, and never sees customer PII.
 *  - Upstream errors are logged server-side and surfaced as a generic 502.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | undefined;

  constructor() {
    this.client = config.anthropicApiKey
      ? new Anthropic({
          apiKey: config.anthropicApiKey,
          timeout: REQUEST_TIMEOUT_MS,
          maxRetries: 1,
        })
      : undefined;
  }

  get configured(): boolean {
    return this.client !== undefined;
  }

  async nlToSegment(input: NlSegmentRequest): Promise<AiSegmentResponse & { model: string }> {
    const result = await this.completeWithOneRetry(
      SEGMENT_SYSTEM_PROMPT,
      buildSegmentUserMessage(input.prompt),
      SEGMENT_OUTPUT_SCHEMA,
      parseSegmentResponse,
    );
    return { ...result, model: config.aiModel };
  }

  async draftMessages(input: DraftRequest): Promise<AiDraftResponse & { model: string }> {
    const result = await this.completeWithOneRetry(
      buildDraftSystemPrompt(input.channel, input.variant_count),
      buildDraftUserMessage(input.objective, input.audience_summary),
      DRAFT_OUTPUT_SCHEMA,
      (text) => parseDraftResponse(text, input.channel),
    );
    // Cap to the requested count even if the model over-delivers.
    return { variants: result.variants.slice(0, input.variant_count), model: config.aiModel };
  }

  /**
   * One call + at most one corrective retry: the validation issues are fed
   * back to the model verbatim; a second invalid response fails the request.
   */
  private async completeWithOneRetry<T>(
    system: string,
    userMessage: string,
    outputSchema: unknown,
    parse: (text: string) => ParseResult<T>,
  ): Promise<T> {
    if (!this.client) {
      throw new ServiceUnavailableException({ error: 'ai_not_configured' });
    }

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.complete(system, messages, outputSchema);
      const parsed = parse(text);
      if (parsed.ok) return parsed.value;

      this.logger.warn(`AI response failed validation (attempt ${attempt + 1}): ${parsed.issues.join('; ')}`);
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

  private async complete(
    system: string,
    messages: Anthropic.MessageParam[],
    outputSchema: unknown,
  ): Promise<string> {
    try {
      const response = await this.client!.messages.create({
        model: config.aiModel,
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
        // Log the detail server-side; never leak upstream internals to clients.
        this.logger.error(`Anthropic API error ${error.status}: ${error.message}`);
        throw new BadGatewayException({ error: 'ai_upstream_error' });
      }
      throw error;
    }
  }
}
