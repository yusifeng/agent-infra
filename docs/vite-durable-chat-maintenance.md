# Vite Durable Chat 维护约束

这份文档记录 `apps/playground-vite-web/src/features/durable-chat` 的**持续性维护约束**，用于约束后续新增功能和局部重构。

它不是一次性改造待办；如果某条规则被违反，应在对应开发 loop 中修正，而不是继续回到“fat runtime hook / fat component”模式。

## 分层约束

- 新功能接入外部数据 shape 时，优先进入 `schema/` 或 `repo/`。
- 新功能的纯 derive / merge / display rule 优先进入 `service/`。
- `runtime/` 只做 orchestration 和 side effects。
- `components/` 只做 props 绑定、事件转发和展示。
- 不再把长期 feature policy 直接写进大型组件或 fat hook。

## 测试约束

- 每个新展示规则优先补 `service` 测试，再接入 UI。
- 每个新的 copy / merge / derive / parse 逻辑优先补 `service` 或 `schema` 测试。
- `repo` 层变更优先补边界测试，覆盖：
  - HTTP 成功/失败
  - browser API
  - storage 解析失败
- `runtime` 层只测 orchestration、恢复、轮询、reconcile 等副作用行为。
- `ui` 层测试只覆盖高价值渲染和交互，不把纯规则判断留在组件测试里。

## 当前非目标

以下内容当前明确**不作为默认重构目标**：

- 不对 [apps/playground-vite-web/src/features/durable-chat/durable-chat-console.tsx](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/durable-chat-console.tsx) 做额外抽象。
- 不主动重构 [apps/playground-vite-web/src/features/durable-chat/runtime/use-chat-session-controller.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-chat-session-controller.ts)，除非状态机复杂度继续上升。
- 不主动重构 [apps/playground-vite-web/src/features/durable-chat/runtime/use-run-inspector-controller.ts](/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-run-inspector-controller.ts)。
- 不为了“看起来更干净”引入新的外部状态管理库。
- 不做只移动文件/重命名、但没有边界收益的大重构。

## 开发 loop 约束

- 优先做低风险、高收益、可逐轮提交的整理。
- 每一轮重构只保留一个主线目标。
- 每一轮都要跑针对性的验证，而不是默认跑全仓：
  - `pnpm --filter playground-vite-web test`
  - `pnpm --filter playground-vite-web typecheck`
- 代码改动在合适时机做 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`，不要积累过大 diff 再统一 review。
- 优先保持行为不变，再追求层次更纯。

## 适用方式

当后续为 Vite durable-chat 增加功能时，先判断新逻辑属于哪一层：

- 未知输入解析：`schema/`
- 边界访问：`repo/`
- 纯展示派生：`service/`
- 生命周期编排：`runtime/`
- 组件渲染：`components/`

如果一个改动很难归到这些层，先停下来重述问题边界，不要直接塞进现有 fat file。
