import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';

import {
  type OpenUrlInput,
  type OpenUrlResult,
  type RunSearchPlannerState,
  createBlockedPolicyToolResult,
  derivePlannerDomain,
  deriveSearchPhase,
  getRemainingBudget,
  normalizePlannerUrl
} from './search-planner';

const DEFAULT_MAX_CHARS = 6000;
const MIN_MAX_CHARS = 500;
const MAX_MAX_CHARS = 12000;

export const openUrlParameters = Type.Object({
  url: Type.String({ description: 'The URL to open and read.' }),
  maxChars: Type.Optional(Type.Number({ description: 'Maximum number of characters to return from the extracted content.' }))
});

function normalizeOpenUrlRequest(input: OpenUrlInput): Required<OpenUrlInput> {
  const url = input.url?.trim() ?? '';
  if (!url) {
    throw new Error('openUrl requires a non-empty url.');
  }

  return {
    url,
    maxChars:
      typeof input.maxChars === 'number' && Number.isFinite(input.maxChars)
        ? Math.min(Math.max(Math.trunc(input.maxChars), MIN_MAX_CHARS), MAX_MAX_CHARS)
        : DEFAULT_MAX_CHARS
  };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr)>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

function matchMetaContent(html: string, matcher: RegExp) {
  const match = html.match(matcher);
  return match?.[1]?.trim() ?? match?.[2]?.trim() ?? null;
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : '';
}

function extractSiteName(html: string, fallbackUrl: string) {
  const explicitSiteName =
    matchMetaContent(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i) ??
    matchMetaContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["'][^>]*>/i);

  return explicitSiteName ?? (derivePlannerDomain(fallbackUrl) || null);
}

function toOpenUrlContentText(html: string, maxChars: number) {
  const text = stripHtmlToText(html);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars).trimEnd()}…`;
}

function buildOpenUrlResult(input: {
  url: string;
  finalUrl: string;
  html: string;
  maxChars: number;
}): OpenUrlResult {
  const title = extractTitle(input.html) || input.finalUrl;
  const contentText = toOpenUrlContentText(input.html, input.maxChars);
  const contentQuality =
    contentText.length >= 1200 ? 'good' : contentText.length >= 300 ? 'partial' : ('failed' as const);

  return {
    url: input.url,
    finalUrl: input.finalUrl,
    title,
    siteName: extractSiteName(input.html, input.finalUrl),
    contentText,
    contentQuality
  };
}

async function fetchOpenUrlResult(input: Required<OpenUrlInput>): Promise<OpenUrlResult> {
  try {
    const response = await fetch(input.url, {
      headers: {
        'user-agent': 'agent-infra-playground/0.1 (+https://github.com/david/agent-infra)'
      }
    });
    const finalUrl = response.url || input.url;

    if (!response.ok) {
      return {
        url: input.url,
        finalUrl,
        title: finalUrl,
        siteName: derivePlannerDomain(finalUrl) || null,
        contentText: `Failed to open the page because the server responded with status ${response.status}.`,
        contentQuality: 'failed'
      };
    }

    const html = await response.text();
    return buildOpenUrlResult({
      url: input.url,
      finalUrl,
      html,
      maxChars: input.maxChars
    });
  } catch (error) {
    return {
      url: input.url,
      finalUrl: input.url,
      title: input.url,
      siteName: derivePlannerDomain(input.url) || null,
      contentText: `Failed to open the page due to a fetch error: ${error instanceof Error ? error.message : 'unknown error'}.`,
      contentQuality: 'failed'
    };
  }
}

export function createOpenUrlTool(options: {
  plannerState: RunSearchPlannerState;
}): AgentTool {
  return {
    name: 'openUrl',
    label: 'Open a Web Page',
    description: 'Open a specific web page and extract readable text from it. Use this after search results are available and you need to inspect a concrete page.',
    parameters: openUrlParameters,
    async execute(toolCallId: string, params: unknown) {
      const request = normalizeOpenUrlRequest((params ?? {}) as OpenUrlInput);
      const normalizedRequestedUrl = normalizePlannerUrl(request.url);
      const requestedDomain = derivePlannerDomain(request.url);
      options.plannerState.phase = deriveSearchPhase(options.plannerState);
      const remainingBudget = getRemainingBudget(options.plannerState);

      if (remainingBudget.openUrl <= 0) {
        const result = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: 'open_url_budget_exceeded',
          message: 'Page-browse budget has been reached for this run. Answer using the evidence that is already available.',
          allowedNextTools: []
        });

        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
          artifact: {
            kind: 'tool-policy-result',
            toolCallId,
            toolName: 'openUrl',
            ...result
          }
        };
      }

      if (options.plannerState.phase !== 'browse') {
        const result = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: 'phase_disallows_open_url',
          message: 'This run is not currently in the browse phase. Use the allowed tools for the current phase or answer with existing evidence.',
          allowedNextTools: []
        });

        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
          artifact: {
            kind: 'tool-policy-result',
            toolCallId,
            toolName: 'openUrl',
            ...result
          }
        };
      }

      if (options.plannerState.openedUrls.includes(normalizedRequestedUrl)) {
        const result = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: 'duplicate_open_url',
          message: 'This page was already opened during the current run. Reuse the existing evidence instead of opening the same URL again.',
          allowedNextTools: []
        });

        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
          artifact: {
            kind: 'tool-policy-result',
            toolCallId,
            toolName: 'openUrl',
            ...result
          }
        };
      }

      if (requestedDomain && options.plannerState.openedDomains.includes(requestedDomain)) {
        const result = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: 'duplicate_open_domain',
          message: 'A page from this domain was already opened during the current run. Prefer synthesizing from existing evidence before opening another page from the same source.',
          allowedNextTools: []
        });

        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
          artifact: {
            kind: 'tool-policy-result',
            toolCallId,
            toolName: 'openUrl',
            ...result
          }
        };
      }

      const result = await fetchOpenUrlResult(request);
      const normalizedFinalUrl = normalizePlannerUrl(result.finalUrl);
      const finalDomain = derivePlannerDomain(result.finalUrl);

      if (options.plannerState.openedUrls.includes(normalizedFinalUrl)) {
        const blockedResult = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: 'duplicate_open_url',
          message: 'This page resolves to a URL that was already opened during the current run. Reuse the existing evidence instead of opening it again.',
          allowedNextTools: []
        });

        return {
          content: [{ type: 'text', text: blockedResult.message }],
          details: blockedResult,
          artifact: {
            kind: 'tool-policy-result',
            toolCallId,
            toolName: 'openUrl',
            ...blockedResult
          }
        };
      }

      if (finalDomain && options.plannerState.openedDomains.includes(finalDomain)) {
        const blockedResult = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: 'duplicate_open_domain',
          message: 'This page resolves to a domain that was already opened during the current run. Reuse the existing evidence instead of opening another copy from the same source.',
          allowedNextTools: []
        });

        return {
          content: [{ type: 'text', text: blockedResult.message }],
          details: blockedResult,
          artifact: {
            kind: 'tool-policy-result',
            toolCallId,
            toolName: 'openUrl',
            ...blockedResult
          }
        };
      }

      options.plannerState.openUrlCalls += 1;
      options.plannerState.openedUrls.push(normalizedFinalUrl);
      if (finalDomain) {
        options.plannerState.openedDomains.push(finalDomain);
      }
      options.plannerState.consecutivePolicyBlocks = 0;
      options.plannerState.phase = deriveSearchPhase(options.plannerState);

      return {
        content: [
          {
            type: 'text',
            text: `Opened page: ${result.title}\nURL: ${result.finalUrl}\n\n${result.contentText}`
          }
        ],
        details: {
          kind: 'open-url-summary',
          url: result.url,
          finalUrl: result.finalUrl,
          title: result.title,
          siteName: result.siteName,
          contentQuality: result.contentQuality
        },
        artifact: {
          kind: 'open-url-content',
          toolCallId,
          ...result
        }
      };
    }
  };
}
