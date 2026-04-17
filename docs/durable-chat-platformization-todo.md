# Durable Chat Platformization Todo

本文是一个**临时执行清单**，目标不是定义长期架构愿景，而是把已经在 `apps/playground-web` 验证过的 durable chat consumer 模式，逐步提炼成未来多个项目可复用的能力。

完成后，长期有效的结论应回收进：

- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/playground-web-chat-runtime-architecture.md`

然后删除本文。

## 目标

把当前仍主要沉在 `apps/playground-web` 内部的复用复杂度，拆成可以逐步上移的平台能力：

- server-side bootstrap / service composition
- server-side SSE / route transport primitive
- browser-side headless durable chat behavior
- reload / reconnect / reconcile 的稳定语义

这里的“可复用能力”不仅指后端接口，也包括 chat consumer 的关键行为：

- optimistic user message
- live assistant draft
- chat-first state machine
- request sequencing / abort / stale response 防护
- stream 与 durable projection 的 reconcile
- selected run / inspector 的可选恢复

## 非目标

本轮不做以下事情：

- 不把 `playground-web` UI shell 产品化进 package
- 不先做大范围 stream contract 重设计
- 不先引入第二个 runtime adapter 作为阻塞条件
- 不把 Next router、DOM、scroll、textarea 行为上移到 package
- 不一次性做“完整 SDK”

## 当前判断

当前方向已经足够明确，可以开始改，不需要再补一轮外部调研。

执行顺序应是：

1. 先提炼复用层
2. 再在提炼过程中识别真正需要硬化的 contract
3. 最后再做最小必要的协议调整

而不是反过来先改 contract。

## Phase 1: Server Bootstrap Primitive

### 目标

把当前 `playground-web` 自己承担的 server-side 组装逻辑，提炼成可复用 primitive，但**不先做完整 route factory**。

### 范围

- `packages/db`
- 新 package：暂定 `packages/durable-chat-server`
- `apps/playground-web/lib/*` 中与 bootstrap 相关的代码

### 工作包

1. 提炼 db repository bundle factory
   - 当前来源：`apps/playground-web/lib/playground-base-services.ts`
   - 目标：consumer 不再自己根据 db mode 手写 repo 选择

2. 提炼 transaction wrapper factory
   - 目标：consumer 不再自己手写 transaction + transactional repos 包装

3. 提炼 app/runtime bootstrap primitive
   - 当前来源：`playground-base-services.ts`、`playground-services.ts`
   - 目标：consumer 只注入 runtime、appId policy、metadata policy

4. 提炼 route 通用 helper
   - 当前来源：`lib/api-route-errors.ts`、`lib/api-dto.ts`
   - 目标：先抽 error mapping / dto mapping primitive，不急着抽整套路由

### 验收

- `apps/playground-web/lib/playground-base-services.ts` 明显变薄
- `apps/playground-web/lib/playground-services.ts` 明显变薄
- 新 consumer 若要接入，不需要再复制 repo mode switch / transaction wrapping
- `playground-web` 路由行为不变

### 风险控制

- 先不做完整 route handler factory
- 不把 auth、user scope、thread metadata policy 硬编码进 package

## Phase 2: Headless Chat Core Extraction

### 目标

把 transcript 主链路中的复用复杂度，从 `playground-web` 中抽成 browser-side headless core。

### 范围

- 新 package：暂定 `packages/durable-chat-client`
- `apps/playground-web/features/durable-chat/*`
- 只覆盖 core chat，不先强绑 inspector

### 工作包

1. 定义 transport interface
   - `fetchThreads`
   - `fetchMeta`
   - `fetchThreadMessages`
   - `openTextTurnStream`
   - 先不把 UI / router 混进去

2. 提炼 chat state machine
   - `idle / thinking / streaming / transcript-final / failed`
   - optimistic user message
   - live assistant draft
   - stale request / abort protection

3. 提炼 send / load / reconcile controller
   - 当前重点来源：
     - `send-message-flow.ts`
     - `load-thread-flow.ts`
     - `reconcile-completed-turn.ts`
     - `chat-session-flow.ts`

4. 把 headless 规则从 UI helper 中移出
   - 例如 assistant message 可见性判断

5. 为 React consumer 提供薄包装
   - 可以有 hook
   - 但 hook 不是唯一核心形态

### 验收

- `playground-web` 不再直接持有大块聊天状态机逻辑
- 新 consumer 不需要复制 `send-message-flow.ts` 级别的复杂度
- UI shell 仍然保留在 `apps/playground-web/components/*`
- 不引入 Next router / DOM 依赖到 headless core

### 风险控制

- 不把当前几十个 setter API 原样公开
- 不把 scroll / textarea / sidebar / route push 逻辑一起带走

## Phase 3: Optional Inspector Extraction

### 目标

把 recent runs / selected run / timeline 作为**可选模块**提炼，而不是默认强绑到 core chat。

### 范围

- `packages/durable-chat-client` 内的 `inspector/*` 子模块
- `apps/playground-web/features/durable-chat/runtime/load-log-inspector-flow.ts`

### 工作包

1. 抽 inspector state slice
2. 抽 recent runs / timeline hydrate
3. 抽 selected run persistence interface
4. 保持 chat 主链路与 inspector 解耦

### 验收

- 没有 inspector 的 consumer 也能直接复用 core chat
- 有 inspector 的 consumer 不需要复制当前恢复逻辑
- pane 开关不会重新绑回主聊天热路径

## Phase 4: Contract Hardening

### 目标

只在前 2-3 阶段真正暴露出 contract 缺口后，再做最小必要的协议硬化。

### 范围

- `packages/contracts`
- 相关 stream route / client transport

### 候选项

以下不是默认立即执行，而是**候选项**：

- stream event 顺序字段
- 更清晰的 terminal / reconcile hint
- runtime meta 命名去 `runtime-pi` 偏向
- transport codec 的收口位置

### 验收

- contract 的修改有明确复用收益，不是为了“更漂亮”
- 不需要 consumer 再靠隐式 heuristic 判断主聊天完成态
- 修改不会反向把平台边界改乱

### 风险控制

- 不在没有证据前先做大面积协议改名
- 不默认把所有 codec 都塞回现有 `packages/contracts` 核心边界

## Phase 5: Playground Cleanup And Validation

### 目标

让 `apps/playground-web` 真正退回 reference consumer，只保留：

- UI shell
- consumer policy
- demo/runtime 注入
- product wording

### 工作包

1. playground 改为消费上游 package
2. 删除多余的 page-local orchestration
3. 回收长期有效结论到正式 docs
4. 删除本文

### 验收

- `apps/playground-web` 明显变成“薄 consumer”
- 再起一个新 web consumer 时，不需要再复制当前 durable chat runtime 逻辑

## 第一阶段执行顺序

接下来先做 Phase 1，不并行展开其它阶段。

建议 loop 顺序：

1. 先抽 `db` repo/transaction bundle primitive
2. 再抽 app/runtime bootstrap primitive
3. 再让 `playground-web` 改用新 primitive
4. 最后再看是否有足够证据去抽 route helper

## 完成标准

当下面这些条件成立时，说明这条主线成功：

- 新 web consumer 不需要复制当前 `playground-web` 的 bootstrap 模式
- 新 web consumer 不需要复制当前 `send-message-flow.ts` 级别的聊天控制逻辑
- `playground-web` 继续是 reference consumer，但不再是复杂度的主要归宿
- server-side 与 browser-side 的复用层边界清晰，没有把 UI shell 一起平台化
