# Playground Web Chat Runtime Architecture

本文只讨论 `apps/playground-web` 里的聊天页运行时 UX 边界，不讨论整个平台的持久化领域建模。

目标很明确：

- 中间 chat 区按“聊天产品主链路”对待。
- 右侧 durable log 按“次级观察面”对待。
- durable 能力仍然保留，但不再反向拖慢或污染主聊天体验。

## 三条路径

### 1. Live UI Path

这一层只服务“用户正在对话”的即时体验：

- optimistic user message
- live assistant draft
- chat phase: `idle / thinking / streaming / transcript-final / failed`
- composer loading / textarea 可编辑性 / send-stop operator

这一层的完成信号不再依赖整个 stream session 彻底关闭，也不依赖右侧 durable hydrate 完成。
当前实现里，assistant transcript 的主完成 barrier 是 `text_end`。

### 2. Durable Projection Path

这一层是页面恢复与刷新后的 durable 读模型：

- thread messages
- recent runs
- selected run
- run timeline

这层仍然重要，但它的职责是：

- 页面恢复
- run / tool / event 的 durable 可见性
- 刷新后的稳定状态对齐

而不是驱动聊天主区的“何时停止 loading、何时恢复输入、何时显示 message actions”。

### 3. Background / Debug Path

这一层负责：

- route 中的 SSE transport
- runtime observer 回调
- 右侧 pane 的延迟 hydrate
- debug / observability 信息

这一层允许 eventual consistency，也允许 best-effort。
它不能继续卡住主聊天链路。

## 当前页面边界

`playground-web` 聊天页现在应理解成：

- 一个产品态 chat shell
- 一个 durable runtime 的 reference consumer
- 一个带 secondary inspector 的验证面

它不再应被理解成“一个以 durable log 为中心、聊天区只是附属展示”的控制台。

## 关键实现结论

### assistant transcript 的完成时机

- 主聊天 loading 只跟 `chatPhase === 'thinking' | 'streaming'` 绑定。
- `text_end` 到来后，chat phase 进入 `transcript-final`。
- durable 尾态补齐已下沉到独立的 `persistingTurn`，不再回流驱动主聊天 loading。
- 在 `transcript-final` 下：
  - composer loading 消失
  - textarea 恢复可编辑
  - stop/send operator 回到非运行态
  - live assistant item 的 actions 可见

### send 收尾与 thread hydration 已拆开

发送完成后不再调用整页式 `loadThreadMessages(...)` 做收口。

当前路径是：

1. stream 中按 `run.assistant` 更新 live draft
2. `text_end` 释放主聊天 UI
3. `sendMessage().finally` 只触发局部 reconcile
4. durable transcript / recent runs / timeline 的补齐在后台处理

### log inspector 已从主聊天路径下沉

当右侧 pane 关闭时：

- thread load 只 hydrate transcript
- send reconcile 只回读 transcript
- `/threads/:id/runs` 与 `/runs/:id/timeline` 不再进入聊天主链路

当右侧 pane 打开时：

- recent runs 与 timeline 才按需 lazy hydrate
- 右侧 run 切换只影响右侧 inspector，不再清掉 live assistant draft

## 代码路径验证结论

以下结论基于当前代码路径验证，不是浏览器 flamegraph 级别 benchmark。

### 1. `message_update` durable write 的尾延迟贡献已被移出热路径

现状：

- `packages/runtime-pi/src/runtime.ts` 中，assistant `message_update` 已不再生成 durable `runEvent`
- 因此每个 delta 不再触发：
  - `appendRunEvent(...)`
  - `emitPersistedUpdate(...)`
  - SSE route 对应的 `run.state` 发射

结论：

- 高分片 assistant delta 不再把 durable write 放在聊天收尾关键路径上
- 这条成本从“每个 delta 一次”收缩成“assistant 完成态/运行态的少量 durable 更新”

### 2. 整线程 `loadThreadMessages()` 重拉已不再位于发送收尾热路径

现状：

- `sendMessage().finally` 不再复用切 thread 的 hydration loader
- 发送完成使用 `reconcileCompletedTurn(...)`

结论：

- 发送收尾不再默认触发整线程 messages + runs + selected run + timeline 的统一重拉路径
- thread 切换 loader 与 send 收尾逻辑已经是两条不同路径

### 3. pane 开/关对 recent runs / timeline 成本的影响已被显式分离

现状：

- pane 关闭时：只 hydrate transcript
- pane 打开时：才会 lazy hydrate recent runs 与 timeline

结论：

- pane 开/关已经直接决定 `/threads/:id/runs` 与 `/runs/:id/timeline` 是否进入聊天主链路
- 这部分成本不再无条件进入每次 thread load / send reconcile

### 4. “空 assistant 壳”已在恢复主路径上被显式防御

现状：

- `assistantMessageHasVisibleContent(...)` 与 `messagePartHasVisibleContent(...)` 已用于：
  - transcript hydrate
  - send reconcile
  - assistant message 渲染

结论：

- 仅存在 assistant message row、但没有可见内容的壳，不会再被当成“assistant 已 durable 可见”
- 这避免了 refresh / reconnect / thread 切换时用空壳误清 live draft

## 当前不做的事

当前不把“恢复 `run.event` / `run.tool` 重新进聊天主链路”作为直接任务。

原因：

- 主方向是减少 chat 主链路上的高频事件和尾延迟
- 如果未来需要 live 展示更多 debug 事件，应优先走右侧 inspector / debug-only path
- 不应重新把重事件流塞回中心聊天热路径
