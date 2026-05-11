# Thread Auto Title Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] shared infra 已经有 thread title 持久化与修改链路，不需要为“自动标题”新增 infra 专属能力。
- [x] 自动标题是否启用、何时触发、如何生成，属于 `playground-fastify-server` / `playground-vite-web` 的业务层决策。
- [x] 自动标题的后端触发时机已定为：一个 run 完成后。
- [x] 自动标题只在 thread 仍处于默认标题态时触发；如果标题已经不是默认态，则不触发。
- [x] 前端确认不接受全量 thread list refresh，只接受当前 thread 的定点 refresh。
- [x] 标题更新后的打字机效果应同时作用于 `header` 和 `sidebar` 当前 active thread item。
- [x] 后端应生成完整标题并持久化；前端只负责表现层动画，不做标题流式协议。

### 0.2 Goals
- [ ] 在 run 完成后，为默认标题态的当前 thread 自动生成一个标题并写回真实 `thread.title`。
- [ ] 为当前 thread 提供单独 refresh 能力，避免为了标题变化重拉整张 thread list。
- [ ] 让 `header` 与 `sidebar` 当前 active thread item 共享同一份打字机动画状态。
- [ ] 保证自动标题失败不会阻塞主聊天链路，也不会覆盖用户手动标题。

### 0.3 Non-goals
- [x] 不把“自动标题”抽成 shared infra 的默认能力。
- [x] 不新增标题字符流 / SSE / websocket 事件协议。
- [x] 不做全量 thread list revalidate。
- [x] 不让非 active thread 的 sidebar item 执行动画。
- [x] 不覆盖用户手动 rename 过的标题。
- [x] 不在 replay / shared snapshot 页面接入这套动画。

## 1. Definitions First

### 1.1 Source of Truth
- [ ] 先按本 todo 实现与验证；如果行为稳定，再决定是否新增一份 host-level source-of-truth 文档说明 thread auto-title 规则。
- [ ] 保持 [playground-chat-mode-model.md](/Users/david/Documents/github/agent-infra/docs/source-of-truth/playground-chat-mode-model.md) 继续只定义 `/new` landing 与模式切换，不把 auto-title 规则硬塞进去。

### 1.2 Data model
- [x] 明确定义“默认标题态”的业务判断：
  - `null`
  - `''`
  - `'New Thread'`
- [ ] 明确后端写回前需要再次检查当前 thread title 是否仍处于默认标题态，避免在异步生成期间覆盖用户手动修改。
- [ ] 明确前端动画状态与真实 thread state 分离：
  - 真实数据继续来自 `thread.title`
  - 动画中的可见标题为独立 runtime UI state

### 1.3 Types / Interfaces
- [x] 明确单 thread refresh 合约，优先新增 `GET /api/threads/:threadId`，返回与当前 mutation response 一致的单 thread dto。
- [ ] 明确后端自动标题生成器的输入边界：
  - 至少包含当前 run / thread 的首轮用户问题或可控截断上下文
  - 输出完整标题字符串或 `null`
- [ ] 明确前端共享动画状态结构，例如：
  - `typingTitleThreadId`
  - `typingTitleVisibleText`
  - `typingTitleFinalText`
- [ ] 明确前端只在“默认标题态 -> 新标题”且 thread 仍为 active 时启动动画。

## 2. Backend / Platform

### 2.1 Host business flow
- [ ] 找到 run 完成后的稳定后端挂点，在不阻塞主聊天链路的前提下触发 auto-title 任务。
- [ ] 用轻量 LLM 生成标题；失败时只记录日志，不影响主聊天成功路径。
- [ ] 复用现有 title 更新链路写回标题，而不是新增一套 parallel persistence path。
- [ ] 写回前重新检查当前 title 是否仍然是默认标题态，避免覆盖手动 rename。

### 2.2 Routes
- [x] 新增单 thread 读取 route：`GET /api/threads/:threadId`。
- [x] 复用现有 thread access control，确保只能读取当前用户可见 thread。
- [x] 让新 route 返回与现有创建/重命名接口相同形状的单 thread dto，方便前端 patch 当前 state。

### 2.3 Shared boundaries
- [ ] 只在必要时触碰 `packages/app` / `packages/contracts` / `packages/durable-chat-server`，避免把业务策略提升成 shared 默认行为。
- [ ] 如果 route helper / DTO projector 需要复用，优先抽已有 thread dto 组装逻辑，而不是复制一份字段映射。

## 3. Frontend Boundary

### 3.1 Repo / schema
- [ ] 在 `chat-api.ts` 新增单 thread fetch 方法，复用现有 thread dto normalize 逻辑。
- [ ] 如果当前 `thread-management` schema 里没有单 thread response normalize，补最小能力，不做无关重构。

### 3.2 Runtime / service
- [ ] 在 run 完成后的前端收尾阶段，触发当前 thread 的定点 refresh，而不是全量拉列表。
- [ ] patch 本地 `threads` state 时，仅替换当前 thread 的最新 dto。
- [ ] 当 patch 结果满足“默认标题态 -> 新标题”且 thread 仍为 active 时，启动打字机动画。
- [ ] 如果用户在 refresh 回来前切换 thread，则只静默更新真实标题，不启动动画。

### 3.3 UI
- [ ] `ChatHeader` 渲染时优先读取当前共享动画文本；动画结束后回退到真实 `currentThreadTitle`。
- [ ] `ChatSidebar` 只让当前 active thread item 在满足条件时显示同一份动画文本。
- [ ] 非 active thread item 始终直接显示真实标题，不参与动画。
- [ ] 动画节奏保持轻量，避免过长或明显阻滞聊天主流程。

## 4. Tests

### 4.1 Backend tests
- [ ] 覆盖 run 完成后默认标题态触发 auto-title 的 happy path。
- [ ] 覆盖非默认标题态不触发 auto-title。
- [ ] 覆盖用户已手动 rename 时不会被 auto-title 覆盖。
- [ ] 覆盖 auto-title 失败不影响主聊天成功路径。
- [x] 覆盖单 thread refresh route 的访问控制与返回 shape。

### 4.2 Frontend tests
- [ ] 覆盖当前 thread 的定点 refresh 只请求单 thread，不重拉整个 thread list。
- [ ] 覆盖 `header` 与 `sidebar active item` 共享同一份动画文本。
- [ ] 覆盖非 active thread 不触发动画。
- [ ] 覆盖用户切换 thread 时不继续对旧 active thread 运行动画。
- [ ] 覆盖手动 rename 场景不触发打字机。

## 5. Recommended Execution Order

### Loop 1
- [x] 定义默认标题态、单 thread refresh 合约与后端 auto-title 触发/写回边界。
- [x] 实现 `GET /api/threads/:threadId` 与 focused backend tests。
- [x] 验证：
  - `pnpm --filter playground-fastify-server test -- <targeted tests>`
  - `pnpm --filter playground-fastify-server typecheck`
- [ ] 运行 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`。
- [ ] review clean 后立即提交。

### Loop 2
- [ ] 实现后端 run 完成后的 auto-title 生成与安全写回。
- [ ] 补 auto-title 触发/不触发/不覆盖 的 focused backend tests。
- [ ] 验证：
  - `pnpm --filter playground-fastify-server test -- <targeted tests>`
  - `pnpm --filter playground-fastify-server typecheck`
- [ ] 运行 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`。
- [ ] review clean 后立即提交。

### Loop 3
- [ ] 前端接入单 thread 定点 refresh 与当前 thread patch。
- [ ] 增加共享打字机状态，让 `header + sidebar active item` 同步显示。
- [ ] 补 runtime / ui focused tests。
- [ ] 验证：
  - `pnpm --filter playground-vite-web test -- <targeted tests>`
  - `pnpm --filter playground-vite-web typecheck`
- [ ] 运行 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`。
- [ ] review clean 后立即提交。

### Loop 4
- [ ] 真实手工验证：
  - 新 thread 首轮 run 完成后是否自动改标题
  - 用户手动 rename 后是否不再被覆盖
  - header 与 sidebar active item 是否同步执行打字机
- [ ] 若行为稳定，决定是否把长期规则提升到新的 `docs/source-of-truth/*` 文档。
- [ ] 完成后删除本 todo，避免留下并行真相。
