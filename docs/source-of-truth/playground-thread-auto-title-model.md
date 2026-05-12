# Playground Thread Auto Title 模型说明

这份说明定义 `apps/playground-fastify-server` 与 `apps/playground-vite-web`
当前采用的 **thread auto-title 业务规则**。

它记录长期事实和边界，不是某一次任务的执行说明。

## 当前状态

playground 当前支持在一次主聊天 run 完成后，为仍处于默认标题态的 thread
自动生成真实标题，并把该标题写回 durable `thread.title`。

这是一项 **host / consumer 业务能力**，不是 shared infra 的默认行为。

## 核心边界

### 1. 自动标题不是 shared infra 默认能力

shared infra 继续只提供：

- `thread.title` 的 durable 持久化
- thread title 更新链路

它不强制任何 consumer 自动生成标题。

是否启用 auto-title、何时触发、如何生成，属于：

- `apps/playground-fastify-server`
- `apps/playground-vite-web`

的业务层决策。

### 2. 真实标题事实源永远是后端持久化后的 `thread.title`

后端负责：

- 在合适时机生成完整标题
- 通过现有 title 更新链路写回 durable thread

前端不猜标题，不直接生成 durable title，也不接标题字符流。

## 触发规则

### 1. 触发时机

当前 playground 固定在：

- **一个 run 完成后**

尝试触发一次 auto-title。

它不在以下时机触发：

- 首条 user message 刚发出时
- 用户手动 rename 时
- replay / share snapshot 页面

### 2. 默认标题态

当前业务把下面这些值视为“仍可自动命名”的默认标题态：

- `null`
- `''`
- `'New Thread'`

只有 thread 仍处于默认标题态时，才允许 auto-title。

### 3. 写回前重新检查

后端在生成标题后、真正写回前，必须重新读取 thread 最新状态并再次检查：

- 当前 title 是否仍然是默认标题态

如果用户已经手动改名，则 auto-title 必须放弃写回。

## 生成规则

### 1. 生成器属于 host 业务层

当前自动标题生成器不进入 shared packages。

它由 `playground-fastify-server` 直接注入并使用轻量 LLM 生成标题。

### 2. 输入边界

当前生成输入使用：

- 当前 thread 的首轮用户问题
- 并在业务层做长度截断

它不是整段 transcript 的共享抽象，也不要求 shared 层理解“标题生成 prompt”。

### 3. 失败语义

auto-title 失败时：

- 只记录日志
- 不影响主聊天 run 的成功结果
- 不阻塞前端消息发送/完成链路

### 4. 可观测性

当前后端会区分 auto-title 的 skip / failure 原因，并记录结构化结果，至少包括：

- `no_generator`
- `thread_unavailable`
- `title_no_longer_default`
- `no_source_text`
- `normalized_title_empty`
- `repo_read_failed`
- `provider_request_failed`
- `rename_writeback_failed`

它的目标是明确区分：

- 没有触发
- 触发后生成失败
- 生成成功但写回被放弃

## 前端刷新与表现

### 1. 不做全量 thread list refresh

当前前端固定采用：

- **只更新当前匹配的 thread 记录**

而不是为了标题变化重拉整个 thread list。

### 2. 标题更新主路径是 playground 私有 stream event

当前 playground 已扩展一层业务侧 stream union：

- 公共部分仍然是 `RunStreamEventDto`
- playground 私有部分额外包含 `thread.title_updated`

这个事件属于：

- `playground-fastify-server`
- `playground-vite-web`

之间的业务协议，不进入 shared `packages/contracts`。

`thread.title_updated` 当前直接携带：

- `threadId`
- `title`
- `updatedAt`

前端收到后会立即 patch 本地 thread state。

### 3. 轮询 refresh 只保留为 fallback

当前前端仍保留一次：

- **只针对当前 active thread 的定点 refresh**

但这条链路已经降级为 fallback。

只有在一次 completed run 结束后，本地 thread 仍保持默认标题态时，
前端才会用它兜底，防止业务事件缺失时完全错过 auto-title。

### 4. 打字机效果只属于表现层

当前打字机效果遵循这些规则：

- `header`
- `sidebar` 当前 active thread item

共享同一份动画文本。

它不是一份新的 durable 数据，也不会写回 `threads` 的真实状态源。

### 5. 动画只对 active thread 生效

当前前端只会让：

- **当前 active thread**

执行打字机标题动画。

非 active thread item：

- 直接显示真实标题
- 不参与动画

如果用户在 refresh 返回前切走 thread：

- 真实标题仍然会静默更新
- 但不会对旧 thread 再执行动画

## 非目标

当前 auto-title 模型明确不包含：

- shared infra 级的默认 auto-title 开关
- 标题字符流协议
- 全量 thread list revalidate
- 非 active sidebar item 动画
- 覆盖用户手动标题
