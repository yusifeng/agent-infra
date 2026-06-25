import { describe, expect, it } from 'vitest';

import {
  buildDockerContainerName,
  buildDockerRunArgs,
  normalizeGuestWorkspaceRelativePath,
  parseDockerContainerRuntime,
  safeContainerSegment
} from '../src/docker-agent-process';

describe('docker-agent-process', () => {
  it('builds docker run args with mounts, env, workdir, and command', () => {
    const args = buildDockerRunArgs({
      command: ['node', '/opt/agent-runtime/runner.mjs'],
      containerName: 'agent-infra-test-run',
      env: {
        HOME: '/agent-home',
        TMPDIR: '/tmp'
      },
      image: 'agent-infra/test:local',
      mounts: [
        {
          source: '/host/workspace',
          target: '/workspace'
        },
        {
          source: '/host/credentials',
          target: '/agent-credentials',
          readonly: true
        }
      ],
      workdir: '/workspace'
    });

    expect(args).toEqual([
      'run',
      '--rm',
      '-i',
      '--name',
      'agent-infra-test-run',
      '--workdir',
      '/workspace',
      '--mount',
      'type=bind,source=/host/workspace,target=/workspace',
      '--mount',
      'type=bind,source=/host/credentials,target=/agent-credentials,readonly',
      '--env',
      'HOME=/agent-home',
      '--env',
      'TMPDIR=/tmp',
      'agent-infra/test:local',
      'node',
      '/opt/agent-runtime/runner.mjs'
    ]);
  });

  it('adds a Docker runtime when one is configured', () => {
    const args = buildDockerRunArgs({
      command: ['node', '/opt/agent-runtime/runner.mjs'],
      containerName: 'agent-infra-test-run',
      image: 'agent-infra/test:local',
      mounts: [],
      runtime: 'runsc',
      workdir: '/workspace'
    });

    expect(args.slice(0, 5)).toEqual(['run', '--rm', '-i', '--runtime', 'runsc']);
  });

  it('parses only supported Docker runtime names', () => {
    expect(parseDockerContainerRuntime(undefined)).toBeUndefined();
    expect(parseDockerContainerRuntime('')).toBeUndefined();
    expect(parseDockerContainerRuntime('default')).toBeUndefined();
    expect(parseDockerContainerRuntime('runc')).toBe('runc');
    expect(parseDockerContainerRuntime('runsc')).toBe('runsc');
    expect(() => parseDockerContainerRuntime('custom-runtime')).toThrow('Unsupported Docker runtime');
  });

  it('normalizes guest workspace paths without allowing traversal', () => {
    expect(normalizeGuestWorkspaceRelativePath('/workspace/snake/index.html', '/workspace')).toBe('snake/index.html');
    expect(normalizeGuestWorkspaceRelativePath('/workspace/../secret.txt', '/workspace')).toBeNull();
    expect(normalizeGuestWorkspaceRelativePath('/agent-home/session.jsonl', '/workspace')).toBeNull();
  });

  it('sanitizes container name segments', () => {
    expect(safeContainerSegment('run/id with spaces')).toBe('run-id-with-spaces');
    expect(safeContainerSegment('x'.repeat(80))).toHaveLength(48);
  });

  it('builds unique container names for repeated attempts of the same run', () => {
    const first = buildDockerContainerName('agent-infra-claude', 'run/id with spaces');
    const second = buildDockerContainerName('agent-infra-claude', 'run/id with spaces');

    expect(first).toMatch(/^agent-infra-claude-run-id-with-spaces-[A-Za-z0-9_.-]{8}$/);
    expect(second).toMatch(/^agent-infra-claude-run-id-with-spaces-[A-Za-z0-9_.-]{8}$/);
    expect(second).not.toBe(first);
  });
});
