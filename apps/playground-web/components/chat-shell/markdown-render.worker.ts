/// <reference lib="webworker" />

import type { MarkdownShikiRuntime } from './markdown-shiki-runtime';
import { highlightCodeBlocks, parseMarkdown } from './markdown-core';

type WorkerRequest = {
  id: number;
  text: string;
};

type WorkerResponse =
  | { id: number; ok: true; html: string }
  | { id: number; ok: false; error: string };

let shikiRuntimePromise: Promise<MarkdownShikiRuntime> | null = null;

async function getShikiRuntime(): Promise<MarkdownShikiRuntime> {
  if (!shikiRuntimePromise) {
    shikiRuntimePromise = import('./markdown-shiki-runtime')
      .then((module) => module.createMarkdownShikiRuntime())
      .catch((error) => {
        shikiRuntimePromise = null;
        throw error;
      });
  }

  return shikiRuntimePromise;
}

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const id = typeof event.data?.id === 'number' && Number.isFinite(event.data.id) ? event.data.id : -1;
  if (id < 0) return;

  const text = typeof event.data?.text === 'string' ? event.data.text : '';

  void highlightCodeBlocks(parseMarkdown(text), getShikiRuntime)
    .then((html) => {
      const response: WorkerResponse = { id, ok: true, html };
      workerScope.postMessage(response);
    })
    .catch((error) => {
      const response: WorkerResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
      workerScope.postMessage(response);
    });
};
