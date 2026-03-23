// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { request as undiciRequest } from 'undici';
import chalk from 'chalk';
import { getConfig } from './config.js';
import { optimize } from './optimizer/index.js';
import { countTokens, fetchExactTokenCount } from './stats/counter.js';
import { recordRequest, getStats, type RequestMetrics } from './stats/session.js';

// Set to true via setDebugMode() when --debug flag is passed
let debugMode = false;
export function setDebugMode(enabled: boolean): void { debugMode = enabled; }

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const REQUEST_TIMEOUT = 120 * 1000;

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

interface ProxyServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface UsageData {
  /** Actual non-cached input tokens billed — straight from Anthropic, always accurate */
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Parse cache usage from a non-streaming JSON response body.
 */
function extractUsageFromJson(text: string): UsageData {
  try {
    const json = JSON.parse(text);
    return {
      input_tokens: json?.usage?.input_tokens,
      cache_read_input_tokens: json?.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: json?.usage?.cache_creation_input_tokens ?? 0,
    };
  } catch {
    return { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  }
}

/**
 * Parse cache usage from SSE stream chunks. Anthropic sends usage in
 * `message_start` and `message_delta` events. We accumulate both.
 */
function extractUsageFromSSE(chunks: string): UsageData {
  let inputTokens: number | undefined;
  let cacheRead = 0;
  let cacheCreation = 0;

  const lines = chunks.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const usage = parsed?.message?.usage ?? parsed?.usage;
      if (usage) {
        // input_tokens appears in message_start; use it as the authoritative count
        if (typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens;
        if (usage.cache_read_input_tokens) cacheRead += usage.cache_read_input_tokens;
        if (usage.cache_creation_input_tokens) cacheCreation += usage.cache_creation_input_tokens;
      }
    } catch { /* not all lines are valid JSON */ }
  }

  return {
    input_tokens: inputTokens,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreation,
  };
}

export class AnthropicProxy implements ProxyServer {
  private fastify: FastifyInstance;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.fastify = Fastify({ logger: false });
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.fastify.all('*', this.proxyHandler.bind(this));
  }

  private async proxyHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const targetUrl = `${ANTHROPIC_API_BASE}${request.url}`;
    const urlPath = request.url.split('?')[0];
    const isMessagesEndpoint =
      request.method === 'POST' && urlPath === '/v1/messages';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestBody = request.body as any;

    const localOrigTokens = isMessagesEndpoint && requestBody
      ? countTokens(requestBody)
      : 0;

    let optimizedBody = requestBody;
    let extraHeaders: Record<string, string> = {};
    let clientCacheDetected = false;
    if (isMessagesEndpoint && requestBody) {
      const result = optimize(requestBody);
      optimizedBody = result.body;
      extraHeaders = result.extraHeaders;
      clientCacheDetected = result.clientCacheDetected;
    }

    const localCompTokens = isMessagesEndpoint && optimizedBody
      ? countTokens(optimizedBody)
      : localOrigTokens;

    // Extract auth headers so we can call count_tokens on Anthropic's side.
    // We snapshot them now before the request loop modifies forwardHeaders.
    const authHeaders: Record<string, string> = {};
    for (const key of ['x-api-key', 'authorization', 'anthropic-version', 'anthropic-beta']) {
      const val = request.headers[key] ?? request.headers[key.toLowerCase()];
      if (val) authHeaders[key] = Array.isArray(val) ? val[0] : String(val);
    }

    // Fire the accurate token count in parallel with the main request.
    // Uses Anthropic's own tokenizer → zero latency impact, verified numbers.
    const { accurateTokenCounting } = getConfig().optimizer;
    const exactOrigTokensPromise: Promise<number | null> =
      isMessagesEndpoint && requestBody && accurateTokenCounting
        ? fetchExactTokenCount(requestBody, authHeaders)
        : Promise.resolve(null);

    if (debugMode && isMessagesEndpoint) {
      process.stderr.write(
        chalk.dim(`[debug] → api.anthropic.com:443  ${request.method} ${urlPath}`) + '\n' +
        chalk.dim('[debug] ✗ no other outbound connections') + '\n',
      );
    }

    try {
      const forwardHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey !== 'host' &&
          lowerKey !== 'connection' &&
          lowerKey !== 'transfer-encoding' &&
          // Strip Accept-Encoding so Anthropic returns uncompressed responses.
          // undici decompresses automatically, but forwarding the original
          // Content-Encoding header causes the client to double-decompress → ZlibError.
          lowerKey !== 'accept-encoding' &&
          // Strip Content-Length: the optimizer may change the body size
          // (e.g. injecting cache_control). Let undici recalculate from the
          // actual serialised body to avoid a length mismatch → 502.
          lowerKey !== 'content-length' &&
          value !== undefined
        ) {
          forwardHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
        }
      }
      // Merge extra headers from the optimizer. For anthropic-beta specifically,
      // append rather than overwrite: Claude CLI sends its own beta flags
      // (e.g. claude-code-20250219) that identify it as a Claude Code client and
      // enable OAuth auth. Overwriting them causes a 401 "OAuth not supported".
      for (const [k, v] of Object.entries(extraHeaders)) {
        const existing = forwardHeaders[k] ?? forwardHeaders[k.toLowerCase()];
        if (k.toLowerCase() === 'anthropic-beta' && existing) {
          const parts = new Set([...existing.split(',').map(s => s.trim()), v.trim()]);
          forwardHeaders[k] = [...parts].join(',');
        } else {
          forwardHeaders[k] = v;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: any = undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = optimizedBody;
        if (typeof body === 'object' && body !== null) {
          body = JSON.stringify(body);
        }
      }

      const response = await undiciRequest(targetUrl, {
        method: request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
        headers: forwardHeaders,
        body,
        maxRedirections: 0,
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
      });

      reply.code(response.statusCode);

      for (const [key, value] of Object.entries(response.headers)) {
        const lowerKey = key.toLowerCase();
        if (
          value !== undefined &&
          lowerKey !== 'content-length' &&
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'connection'
        ) {
          reply.header(key, value);
        }
      }

      const contentType = response.headers['content-type'] as string;
      const isStreaming = contentType?.includes('text/event-stream');

      if (isStreaming) {
        if (isMessagesEndpoint && response.statusCode === 200) {
          const sseChunks: string[] = [];

          response.body.on('data', (chunk: Buffer) => {
            sseChunks.push(chunk.toString());
          });

          let recorded = false;
          const onEnd = async () => {
            if (recorded) return;
            recorded = true;

            const usage = extractUsageFromSSE(sseChunks.join(''));
            const exactOrig = await exactOrigTokensPromise;

            // origTokens: Anthropic count_tokens (verified) → fallback tiktoken (estimated)
            const origTokens = exactOrig ?? localOrigTokens;
            const origVerified = exactOrig !== null;

            // compTokens: usage.input_tokens from response (verified) → fallback tiktoken
            const compTokens = usage.input_tokens ?? localCompTokens;
            const compVerified = usage.input_tokens !== undefined;

            const metrics: RequestMetrics = {
              origTokens,
              origVerified,
              compTokens,
              compVerified,
              cacheReadTokens: usage.cache_read_input_tokens ?? 0,
              cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
            };
            recordRequest(metrics);
            this.printRequestLog(metrics, clientCacheDetected);
          };
          response.body.once('end', onEnd);
          response.body.once('close', onEnd);
        }
        reply.send(response.body);
      } else {
        const responseText = await response.body.text();

        if (isMessagesEndpoint && response.statusCode === 200) {
          const usage = extractUsageFromJson(responseText);
          const exactOrig = await exactOrigTokensPromise;

          const origTokens = exactOrig ?? localOrigTokens;
          const origVerified = exactOrig !== null;

          const compTokens = usage.input_tokens ?? localCompTokens;
          const compVerified = usage.input_tokens !== undefined;

          const metrics: RequestMetrics = {
            origTokens,
            origVerified,
            compTokens,
            compVerified,
            cacheReadTokens: usage.cache_read_input_tokens ?? 0,
            cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
          };
          recordRequest(metrics);
          this.printRequestLog(metrics, clientCacheDetected);
        }

        reply.send(responseText);
      }

    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { statusCode?: number; body?: unknown };

      if (
        err.code === 'UND_ERR_HEADERS_TIMEOUT' ||
        err.code === 'UND_ERR_BODY_TIMEOUT' ||
        err.code === 'ETIMEDOUT'
      ) {
        reply.code(504).send({
          error: { type: 'gateway_timeout', message: 'Request to Anthropic API timed out' },
        });
      } else if (err.statusCode) {
        reply.code(err.statusCode);
        reply.send(err.body ?? {
          error: { type: 'api_error', message: err.message ?? 'Unknown error occurred' },
        });
      } else {
        reply.code(502).send({
          error: { type: 'bad_gateway', message: 'Failed to connect to Anthropic API' },
        });
      }
    }
  }

  private printRequestLog(metrics: RequestMetrics, clientCacheDetected: boolean): void {
    const { origTokens, compTokens, cacheReadTokens, origVerified, compVerified } = metrics;
    const savedTokens = origTokens - compTokens;
    const savePct = origTokens > 0 ? (savedTokens / origTokens) * 100 : 0;
    const { pricing } = getConfig();
    const pruneSaved = (savedTokens / 1_000_000) * pricing.inputPerMillion;
    const stats = getStats();

    // ✓ = verified by Anthropic API  ~= tiktoken estimate
    const tokBadge = (origVerified && compVerified)
      ? chalk.dim('✓')
      : chalk.dim('~');

    const cols: string[] = [];
    cols.push(chalk.bold.cyan(`#${stats.requests}`));

    if (savedTokens > 0) {
      cols.push(
        chalk.cyan(`${formatNumber(origTokens)}→${formatNumber(compTokens)} tok`) +
        tokBadge +
        chalk.green(` -${savePct.toFixed(1)}%`) +
        chalk.yellow(` $${pruneSaved.toFixed(4)}`),
      );
    } else {
      cols.push(chalk.dim(`${formatNumber(origTokens)} tok`) + tokBadge);
    }

    // Cache hit savings — always verified (from Anthropic response)
    if (cacheReadTokens > 0) {
      const cacheSaved =
        (cacheReadTokens / 1_000_000) * (pricing.inputPerMillion - pricing.cacheReadPerMillion);
      cols.push(
        chalk.magenta(`⚡ ${formatNumber(cacheReadTokens)} cached`) +
        chalk.dim('✓') +
        chalk.yellow(` $${cacheSaved.toFixed(4)}`),
      );
    } else if (clientCacheDetected) {
      cols.push(chalk.dim('⚡ cache pending'));
    }

    cols.push(chalk.gray(`Σ $${stats.savedCost.toFixed(4)}`));

    const SEP = chalk.dim(' │ ');
    const bar = chalk.dim('─'.repeat(52));
    const label = chalk.bold.green('Pruner');
    const content = cols.join(SEP);

    process.stderr.write(`\n${bar}\n ${label}  ${content}\n${bar}\n`);
  }

  async start(): Promise<void> {
    await this.fastify.listen({ port: this.port, host: '127.0.0.1' });
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }
}

export async function startProxy(port: number): Promise<() => Promise<void>> {
  const proxy = new AnthropicProxy(port);
  await proxy.start();
  const bar = chalk.dim('─'.repeat(52));
  const { accurateTokenCounting } = getConfig().optimizer;

  let statusLine =
    ` ${chalk.bold.green('Pruner')}  ${chalk.dim('proxy')} ${chalk.white(`→ 127.0.0.1:${port}`)}  ` +
    chalk.dim('optimizing your Claude requests');

  if (accurateTokenCounting) {
    statusLine += chalk.dim('  [verified ✓]');
  }

  process.stderr.write(`${bar}\n${statusLine}\n`);

  if (debugMode) {
    process.stderr.write(
      ` ${chalk.yellow('debug mode')}  ` +
      chalk.dim('only connects to: ') + chalk.white('api.anthropic.com:443') + '\n' +
      ` ${chalk.dim('verify:')}        ` +
      chalk.dim('sudo lsof -i -n -P | grep pruner') + '\n',
    );
  }

  process.stderr.write(`${bar}\n`);
  return () => proxy.stop();
}
