# ContentNode 模型说明

这份说明定义 durable chat 前端里位于 `TranscriptBlock` 之下、位于
`ReplayStep` 之上的共享内容节点层：`ContentNode`。

它的目标不是替代 `TranscriptBlock`、`AnswerContainer` 或 `ReplayStep`，而是为
normal chat 与 replay 提供一套共同的“内容事实来源”。

## 目标

在当前前端结构里，已经有：

- `run`：后端执行边界
- `TranscriptBlock`：前端渲染块
- `AnswerContainer`：前端回答宿主
- `ReplayStep`：replay 的播放控制节点

目前尚未统一的是：

- assistant / user 内容如何被解析成前端可见节点
- search loading / search summary 的原子语义提取
- normal chat 与 replay 的上游内容投影规则

`ContentNode` 用于解决这一层问题。

## 分层位置

```text
Run / Message / MessagePart / Tool data
        ↓
     ContentNode
        ↓
  ┌───────────────┬────────────────┐
  ↓               ↓
TranscriptBlock   ReplayStep
        ↓               ↓
   AnswerContainer   Replay runtime
```

## 设计原则

### 1. `ContentNode` 是内容模型，不是播放模型

`ReplayStep` 仍然负责：

- timing
- cursor
- play / pause / resume
- fake loading 的推进顺序

`ContentNode` 不承担这些职责。

### 2. `ContentNode` 比 `TranscriptBlock` 更细

它至少要细到能区分：

- 一段 `text`
- 一段 `reasoning`
- 一次 `search-loading`
- 一次 `search-summary`

这样 replay 才不需要重新解析 `sourceMessages`。

### 3. `ContentNode` 不直接承担 operation host 语义

operation host 继续属于：

- `AnswerContainer`

`ContentNode` 只负责提供内容事实。

### 4. normal chat 与 replay 共享节点来源，但不必共享投影粒度

normal chat 可以继续把多个节点聚成更阅读友好的 `TranscriptBlock`。

replay 可以继续把节点按播放顺序逐步显露。

统一的是：

- 节点来源
- 节点类型
- 基本搜索解析规则

不强求统一的是：

- normal chat 的 block 边界
- replay 的播放粒度

## 第一版建议节点类型

- `user-text`
- `assistant-text`
- `assistant-reasoning`
- `assistant-search-loading`
- `assistant-search-summary`
- `assistant-tool-part`

第一版先覆盖 durable chat 目前已经真实展示的这些内容类型。

## 第一版建议字段

所有 `ContentNode` 至少带：

- `id`
- `threadId`
- `runId`
- `messageId`
- `sourcePartId`
- `blockHintId`
- `kind`

其中：

- `blockHintId` 是对现有 `TranscriptBlock` 来源边界的提示
- 它不是最终 block id
- 但可以帮助 normal chat projector 维持现有阅读语义

## projector 职责

### normal chat

从 `ContentNode[]` 投影成：

- `TranscriptBlock[]`
- 再到 `AnswerContainer[]`

它可以继续做：

- assistant message 边界分组
- search item 聚合
- 阅读友好的 block 组织

### replay

从 `ContentNode[]` 投影成：

- `ReplayStep[]`
- 或可见 replay `TranscriptBlock[]`

它可以继续做：

- fake loading
- 逐节点显露
- 节奏控制

## 非目标

这轮不做：

- 统一 live runtime 和 replay runtime
- 把 `run` 和 `AnswerContainer` 合并
- 把 `OperationHost` 和 `ActionPayloadScope` 合并
- 为了统一而删除 `ReplayStep`
- 强行让 replay 的 block grouping 完全等于 normal chat
