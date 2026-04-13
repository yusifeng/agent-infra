本次 handoff 使用的 bundle：`repomix-chat-runtime-ux-core.txt`

对应 prompt：`chat-runtime-ux-handoff-prompt.md`

下面是本次打包文件清单，路径均为仓库相对路径（repo-relative）。

## Chat UI 主链路
- `apps/playground-web/components/durable-chat-console.tsx`
- `apps/playground-web/components/chat-shell/message-list.tsx`
- `apps/playground-web/components/chat-shell/composer-dock.tsx`
- `apps/playground-web/components/chat-shell/durable-log-pane.tsx`
- `apps/playground-web/components/chat-shell/markdown-renderer.tsx`
- `apps/playground-web/components/chat-shell/markdown-service.ts`
- `apps/playground-web/components/chat-shell/types.ts`
- `apps/playground-web/components/chat-shell/helpers.ts`

说明：
- 这些文件覆盖当前 chat 主区域、底部 composer、右侧 durable log，以及 assistant markdown 渲染。
- 重点是看消息状态、loading/operator 逻辑、live assistant 与正式 message 的渲染关系。

## Playground 服务装配与 DTO 映射
- `apps/playground-web/lib/playground-base-services.ts`
- `apps/playground-web/lib/playground-read-services.ts`
- `apps/playground-web/lib/playground-services.ts`
- `apps/playground-web/lib/api-dto.ts`
- `apps/playground-web/lib/api-route-errors.ts`

说明：
- 这些文件展示 Next.js 页面/route 如何接入 app 层、runtime 层与数据库。

## Next API Routes
- `apps/playground-web/app/api/threads/route.ts`
- `apps/playground-web/app/api/threads/[threadId]/messages/route.ts`
- `apps/playground-web/app/api/threads/[threadId]/runs/route.ts`
- `apps/playground-web/app/api/threads/[threadId]/runs/stream/route.ts`
- `apps/playground-web/app/api/runs/[id]/timeline/route.ts`

说明：
- 这些文件覆盖 thread list/create、messages、runs、timeline 以及最关键的 SSE stream route。

## App 层编排
- `packages/app/src/app.ts`
- `packages/app/src/types.ts`
- `packages/app/src/errors.ts`
- `packages/app/src/index.ts`

说明：
- 这些文件定义 thread / turn / run timeline 的应用边界。
- WebGPT 需要通过它们理解当前“startText -> runTurn -> projection read”的编排方式。

## Contracts / Core
- `packages/contracts/src/index.ts`
- `packages/core/src/types.ts`
- `packages/core/src/repositories.ts`

说明：
- 这些文件提供 DTO、事件类型、仓储接口等静态边界。

## Runtime 持久化主链路
- `packages/runtime-pi/src/runtime.ts`
- `packages/runtime-pi/src/types.ts`
- `packages/runtime-pi/src/index.ts`

说明：
- 这是本次 handoff 的关键部分之一。
- WebGPT 需要重点检查：
  - `message_update` 是否仍然高频写 durable `run_events`
  - `message_end` / `agent_end` / `run.status` 的落库与 SSE 时序
  - live assistant 与 persisted update 的耦合方式

## DB 实现（当前 sqlite/turso 主线）
- `packages/db/src/client.ts`
- `packages/db/src/repositories-sqlite.ts`
- `packages/db/src/schema-sqlite.ts`

说明：
- 当前 `playground-web` 使用 sqlite/turso 兼容路径。
- 这些文件用于帮助判断 DB 写入频率、读取路径和 durable tail 的可能来源。

## 设计文档
- `docs/architecture.md`
- `docs/runtime-observability.md`
- `docs/playground-web-chat-shell-todo.md`

说明：
- 这些文件帮助理解项目原始架构目标、durable observability 设计意图，以及当前 chat shell 本地重构背景。
