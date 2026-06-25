import type { PermissionBroker, PermissionDecision, PermissionRequest } from './types.js';

export interface StaticPermissionBrokerOptions {
  decision: PermissionDecision['decision'];
  reason?: string | null;
  resolvedByActorId?: string | null;
  allowTools?: string[];
  denyTools?: string[];
}

export class StaticPermissionBroker implements PermissionBroker {
  private readonly decision: PermissionDecision['decision'];
  private readonly reason?: string | null;
  private readonly resolvedByActorId?: string | null;
  private readonly allowTools: Set<string>;
  private readonly denyTools: Set<string>;

  constructor(options: StaticPermissionBrokerOptions) {
    this.decision = options.decision;
    this.reason = options.reason;
    this.resolvedByActorId = options.resolvedByActorId;
    this.allowTools = new Set(options.allowTools ?? []);
    this.denyTools = new Set(options.denyTools ?? []);
  }

  async resolve(request: PermissionRequest): Promise<PermissionDecision> {
    if (this.denyTools.has(request.toolName)) {
      return this.toDecision('denied');
    }

    if (this.allowTools.has(request.toolName)) {
      return this.toDecision('approved');
    }

    return this.toDecision(this.decision);
  }

  private toDecision(decision: PermissionDecision['decision']): PermissionDecision {
    return {
      decision,
      reason: this.reason ?? (decision === 'denied' ? 'Permission denied by static policy.' : null),
      resolvedByActorId: this.resolvedByActorId ?? 'static-policy',
      classification: decision === 'denied' ? 'user_reject' : 'user_temporary'
    };
  }
}
