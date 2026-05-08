# AnswerContainer 模型说明

这份说明只定义 durable chat 前端的概念关系，不直接指定具体 UI 样式。

## 目标

在 `run` 和 `TranscriptBlock` 之间，显式补出一个更稳定的前端“回答宿主”
概念：`AnswerContainer`。

这样可以把下面三件事拆开：

1. 后端执行边界
2. 前端内容渲染边界
3. 前端操作条挂载边界

## 概念分层

### `run`

后端 / runtime 的执行概念。

- 一次 run 可能包含多段 assistant 文本
- 一次 run 可能包含多次 tool 调用
- 一次 run 可以被 durable 持久化为多条 messages 与 tool invocations

### `TranscriptBlock`

前端 transcript 的顶层渲染单元。

当前包括：

- `user-message`
- `assistant-turn`

它负责承载可见内容结构，但不要求直接承担最终的 operation host 语义。

### `AnswerContainer`

前端“回答宿主”概念。

- 通常绑定一个 `runId`
- 可以包含一个或多个 `TranscriptBlock`
- 用于承载一整条用户感知上的 assistant 回答
- operation 挂在这个层级，而不是直接挂在单个 `TranscriptBlock`

## 关系

```text
Thread
├─ User message block
├─ AnswerContainer (run-1)
│  ├─ TranscriptBlock
│  │  ├─ text
│  │  ├─ reasoning
│  │  ├─ search-summary
│  │  └─ text
│  └─ Operation Bar
└─ AnswerContainer (run-2)
   ├─ TranscriptBlock
   │  ├─ text
   │  └─ search-summary
   └─ Operation Bar
```

## 关键约束

### `OperationHost` 不等于 `ActionPayloadScope`

`OperationHost` 解决的是：

- 这套按钮显示在谁下面

`ActionPayloadScope` 解决的是：

- 某个按钮实际作用于哪些内容

例如：

- operation 可以挂在 `AnswerContainer`
- `copy` 仍然可以只复制 `text`
- `copy` 可以选择不复制 `reasoning`
- `copy` 不应自动包含 `search-summary`

## 改造顺序

1. 先补术语和 types
2. 再补 `AnswerContainer` 的纯 service 构建逻辑
3. 先在 normal chat 中接 operation host
4. 最后让 replay 对齐这套模型
