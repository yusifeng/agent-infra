import type {
  RuntimePiContext,
  RuntimePiInput,
  RuntimePiRunTurnOptions,
  RuntimePiRuntime,
  RuntimePiRuntimeOptions
} from './types.js';

export type RuntimePiLazyOptionsResolver =
  | RuntimePiRuntimeOptions
  | (() => RuntimePiRuntimeOptions | Promise<RuntimePiRuntimeOptions>);

async function resolveOptions(input: RuntimePiLazyOptionsResolver | undefined): Promise<RuntimePiRuntimeOptions> {
  if (!input) {
    return {};
  }

  if (typeof input === 'function') {
    return await input();
  }

  return input;
}

export function createLazyPiRuntime(options?: RuntimePiLazyOptionsResolver): RuntimePiRuntime {
  let runtimePromise: Promise<RuntimePiRuntime> | null = null;

  async function loadRuntime() {
    if (!runtimePromise) {
      runtimePromise = (async () => {
        const [{ createPiRuntime }, resolvedOptions] = await Promise.all([
          import('./runtime.js'),
          resolveOptions(options)
        ]);

        return createPiRuntime(resolvedOptions);
      })().catch((error) => {
        runtimePromise = null;
        throw error;
      });
    }

    return await runtimePromise;
  }

  return {
    async prepare(input: Pick<RuntimePiInput, 'provider' | 'model'> = {}) {
      const runtime = await loadRuntime();
      return await runtime.prepare(input);
    },
    async runTurn(ctx: RuntimePiContext, input: RuntimePiInput, runOptions?: RuntimePiRunTurnOptions) {
      const runtime = await loadRuntime();
      await runtime.runTurn(ctx, input, runOptions);
    }
  };
}
