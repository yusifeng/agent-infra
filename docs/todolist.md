# Playground Thread Runtime Binding Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] chat header 当前模式错误地读取了全局 `selectedModelKey`，而不是当前 thread 自身的持久化绑定。
- [x] `selectedModelKey` 当前是 playground chat composer 的发送意图状态，不是 thread 级状态。
- [x] `pinned` 已经通过 `apps/playground-fastify-server/src/features/thread-catalog/*` 这条 app-specific 扩展链路存储在 `playground_thread_catalog` 中。
- [x] `playground_thread_catalog` 已经承担了 playground 对 thread 的附加事实，不需要把 thread 运行绑定下沉到 `packages/core` / `packages/app` / `packages/db`。
- [x] 首次可靠的模型事实来源不是前端请求体，而是 `POST /api/threads/:threadId/runs/stream` 中 `startText()` 返回的 `runtimeSelection`。
- [x] 现有 `docs/source-of-truth/playground-chat-mode-model.md` 仍把 `selectedModelKey` 视为真实发送事实源，需要补充 thread 绑定后的分工边界。

### 0.2 Goals
- [ ] 让 playground thread 拥有 app-specific 的持久化运行绑定字段：`runtime_provider` / `runtime_model`。
- [ ] 让 Vite chat header 的模式展示读取当前 thread DTO，而不是读取全局 `selectedModelKey`。
- [x] 在 thread 首次真实发送时，使用 runtime 最终采用的 `provider/model` 写入 `playground_thread_catalog`。
- [ ] 明确 `/new`、已有 thread、历史 thread 三类状态下的 header / composer 行为。

### 0.3 Non-goals
- [x] 不把运行绑定下沉到 shared durable chat infra 的通用 `Thread` 模型。
- [x] 不通过“最近一次 run”动态推断 header 模式作为长期事实源。
- [x] 不在这次任务里设计通用多 app 的 runtime profile 系统。
- [x] 不在第一轮就做历史 thread 的强制回填。

## 1. Definitions First

### 1.1 Source of Truth
- [ ] 更新 [playground-chat-mode-model.md](/Users/david/Documents/github/agent-infra/docs/source-of-truth/playground-chat-mode-model.md)，明确区分：
  - `selectedModelKey` 是 composer 发送意图
  - `playground_thread_catalog.runtime_provider/runtime_model` 是 thread 级持久化绑定
- [ ] 保持 [playground-host-auth-model.md](/Users/david/Documents/github/agent-infra/docs/source-of-truth/playground-host-auth-model.md) 中“thread ownership 继续只使用 host catalog”的边界不变。

### 1.2 Data model
- [ ] 为 `playground_thread_catalog` 增加可空字段：
- [x] 为 `playground_thread_catalog` 增加可空字段：
  - `runtime_provider`
  - `runtime_model`
- [x] 定义新列的默认策略：
  - 新建空 thread 时为 `NULL`
  - 历史 thread 不做首轮强回填
- [ ] 明确 header 模式投影规则：
  - `deepseek + deepseek-v4-flash -> 快速模式`
  - `deepseek + deepseek-v4-pro -> 专家模式`
  - `NULL` 或非 DeepSeek 组合 -> header 不显示模式

### 1.3 Types / Interfaces
- [x] 扩展服务端 `PlaygroundThreadCatalogRow`。
- [x] 扩展服务端 `PlaygroundThreadDto` 投影字段。
- [x] 扩展 Vite 侧 `PlaygroundThreadDto` 与 thread normalization/schema。
- [ ] 增加一个前端投影 helper，把 `runtime_provider/runtime_model` 映射成 header 所需的 mode 展示值。
- [ ] 明确 thread 已绑定后的发送规则：
  - [x] 确认是“拒绝不同模型发送”还是“忽略 UI 选择并强制沿用 thread binding”。

## 2. Backend / Platform

### 2.1 Schema / bootstrap
- [x] 在 [schema.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/features/thread-catalog/repo/schema.ts) 的 sqlite / pg table 定义中增加 `runtime_provider` / `runtime_model`。
- [x] 为 bootstrap 增加老库增列语句，避免 `CREATE TABLE IF NOT EXISTS` 只覆盖新库。
- [x] 保持现有 catalog backfill 逻辑可运行，新列默认回填为 `NULL`。

### 2.2 Repo / service
- [x] 在 [thread-catalog-repo.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/features/thread-catalog/repo/thread-catalog-repo.ts) 中扩展 row 映射与 `create()` 入参。
- [x] 增加 `updateRuntimeBinding(...)` 或 `bindRuntimeIfUnset(...)` 能力。
- [x] 在 [thread-catalog-service.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/features/thread-catalog/service/thread-catalog-service.ts) 中提供 thread 绑定写入的 service 边界。

### 2.3 Route write path
- [x] 在 [chat.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/routes/chat.ts) 的 `POST /api/threads/:threadId/runs/stream` 中，在 `startText()` 成功返回后写入 binding。
- [x] 写入使用 `started.runtimeSelection.provider/model`，不直接信任 `turnInput.provider/model`。
- [x] 仅在当前 thread 尚未绑定时写入首次 binding。
- [x] 为已绑定 thread 的模型不一致情况加入显式处理。

### 2.4 DTO projection / API
- [x] 在 [project-playground-thread-dto.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/features/thread-catalog/service/project-playground-thread-dto.ts) 中投影 `runtimeProvider` / `runtimeModel`。
- [x] 确认 `GET /api/threads`、`GET /api/threads/:threadId`、rename、pin/unpin、archive 等返回 thread DTO 的路径都带出新字段。

## 3. Frontend Boundary

### 3.1 Schema / repo
- [x] 更新 `apps/playground-vite-web/src/features/durable-chat/types/thread.ts`。
- [x] 更新 `apps/playground-vite-web/src/features/durable-chat/schema/thread-management.ts`。
- [x] 确认 `fetchThreads` / `fetchThread` 返回的前端 DTO 已包含 binding 字段。

### 3.2 Service / runtime
- [ ] 从 header 数据链中移除“使用 `selectedModelKey` 推导当前 thread 模式”的逻辑。
- [ ] 在 runtime 或 service 层增加基于 `activeThread.runtimeProvider/runtimeModel` 的 mode projection。
- [ ] 保持 `/new` 状态下 header 继续隐藏标题与模式。
- [ ] 确认切换 thread 时 header 模式随 `activeThread` 变化，而不是随最后一次全局选择变化。

### 3.3 UI / interaction
- [ ] 让 [chat-header.tsx](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/components/chat-header.tsx) 只读当前 thread 绑定。
- [ ] 让 composer 对已有 thread 的模型选择行为与 thread binding 收敛。
- [ ] 若产品规则要求已有 thread 不可切模式，补禁用或提示状态。
- [ ] 保持现有 mode icon 组件复用，不重新发明第二套模式图标体系。

## 4. Tests

### 4.1 Backend / schema
- [x] 为 thread catalog schema/bootstrap 增加测试，覆盖新列存在与老库增列路径。
- [x] 为 repo/service 增加 `runtimeProvider/runtimeModel` create / update 测试。

### 4.2 Route / server
- [x] 增加首次发送后 binding 被写入并通过 thread DTO 返回的测试。
- [x] 增加已绑定 thread 再次发送时的模型一致性测试。
- [ ] 明确历史 `NULL` binding thread 的行为测试。

### 4.3 Frontend
- [ ] 增加切换不同 thread 时 header 模式正确变化的 runtime / console 测试。
- [ ] 增加 `/new` 不显示模式的测试。
- [ ] 增加“仅变更 `selectedModelKey` 不会错误修改别的 thread header 模式”的测试。

## 5. Recommended Execution Order

### Loop 1
- [x] 扩展 `playground_thread_catalog` schema、bootstrap、repo row 和 DTO 投影链。
- [x] 先把 thread 绑定字段打通到前端，但允许值为 `NULL`。
- [x] 跑 schema/repo/DTO 相关定向测试。
- [x] 跑 `codex review`，通过后提交这一切片。

### Loop 2
- [x] 在 `runs/stream` 首次发送路径中写入 `runtimeSelection` 绑定。
- [x] 明确并实现已绑定 thread 的模型一致性规则。
- [x] 跑 route/server 定向测试。
- [x] 跑 `codex review`，通过后提交这一切片。

### Loop 3
- [ ] 前端 header 改为读取 `activeThread.runtimeProvider/runtimeModel`。
- [ ] composer 与已有 thread 的模型选择行为收敛。
- [ ] 跑 Vite runtime / UI 定向测试。
- [ ] 跑 `codex review`，通过后提交这一切片。

### Loop 4
- [ ] 更新 source-of-truth 文档，反映 `selectedModelKey` 与 thread binding 的职责边界。
- [ ] 复查是否还存在从全局选择错误推导 thread 模式的残留代码。
- [ ] 全部完成后删除 `docs/todolist.md`。
