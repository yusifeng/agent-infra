import { describe, expect, it } from 'vitest';

import * as runtimePi from '../src/index';

describe('runtime-pi root entrypoint', () => {
  it('keeps config helpers on the root entrypoint', () => {
    expect(runtimePi.listRuntimePiModelOptions).toBeTypeOf('function');
    expect(runtimePi.listAvailableRuntimePiModelOptionsFromEnv).toBeTypeOf('function');
    expect(runtimePi.resolveRuntimePiConfigFromEnv).toBeTypeOf('function');
  });

  it('does not expose runtime execution helpers on the root entrypoint', () => {
    expect('createPiRuntime' in runtimePi).toBe(false);
    expect('runAssistantTurnWithPi' in runtimePi).toBe(false);
    expect('createDemoTools' in runtimePi).toBe(false);
  });
});
