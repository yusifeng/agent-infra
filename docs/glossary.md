# 术语表

这份术语表用于统一 durable chat 与网页搜索链路里的运行时、持久化和 UI
概念，避免在讨论 bug、流式状态和渲染逻辑时混淆“底层数据”和“页面投影”。

## 运行时与持久化

### 原始消息（Raw message）

后端持久化后的 `MessageDto`。原始消息是 transcript 历史的 durable 真相源，
但在 Vite UI 中**不会**按 1:1 的方式直接渲染。

### 消息片段（Message part）

属于某条原始消息的持久化 `MessagePartDto`，例如：

- `text`
- `reasoning`
- `tool-call`
- `tool-result`

消息片段是 durable 层的细粒度单元，之后会在 UI 侧重新组合成更高层的展示块。

### 工具调用（Tool invocation）

独立于 transcript 渲染的 durable 工具执行记录。搜索侧边栏和 run 级检查视图
主要依赖 tool invocation 数据。

### 当前活动响应运行（Active response run）

当前线程中处于 `queued` 或 `running` 状态的 `RunDto`。它是驱动 live
streaming 状态的运行时单元。

### 已水合 transcript（Hydrated transcript）

线程在加载或刷新后，根据 durable 后端数据重新构建出来的 transcript 状态。

## Live UI 状态

### Live assistant 草稿（Live assistant draft）

当某个 run 仍在 streaming 时，客户端内存中的 assistant 临时表示。它对应的
是 durable messages 接管之前页面上那张临时 live 卡片。

### 恢复草稿（Restored draft）

刷新页面后，从浏览器存储中恢复出来的 live assistant draft，且对应的 run
仍然处于活动状态。它是一个临时恢复态，用来避免刷新时页面直接空白。

### Live 分段（Live segment）

live assistant draft 内部的子单元，用于按 tool 边界拆分 assistant 的多段输出。
一个 run 在实践中可能会依次出现：

- 文本
- 搜索或其他工具活动
- 更多文本

这些不同的文本阶段会分别映射成不同的 live segment。

## Transcript 渲染

### Transcript 块（Transcript block）

Vite 页面上的顶层渲染单元。页面渲染消费的是 `TranscriptBlock[]`，而不是原始
消息数组。

当前的 block 类型有：

- `user-message`
- `assistant-turn`

### Assistant turn

Vite UI 中用于表示一段 assistant 展示单元的 persisted transcript block。
一个 assistant turn 内部可能包含多个 item，它**不等价于**一条原始消息。

### Assistant turn item

assistant turn 内部的子项。当前 item 类型包括：

- `text`
- `reasoning`
- `search-status`
- `search-summary`
- `tool-part`

assistant turn item 是渲染层概念，不是后端 durable 记录本身。

### 回答容器（AnswerContainer）

前端新的“回答宿主”概念，用来承载一整条 assistant 回答及其操作条。它是
比 `TranscriptBlock` 更高一层的前端概念，通常绑定一个 `runId`，但不等于
后端 run 的所有事实原样投影。

### 操作宿主（OperationHost）

操作条在 UI 中挂载的宿主层级。`OperationHost` 解决的是“按钮显示在谁下面”，
不直接决定某个按钮实际操作哪些内容。

### 操作内容范围（ActionPayloadScope）

某个 action 实际作用的内容范围，例如是否包含：

- `text`
- `reasoning`
- `search`
- `tool`

它和 `OperationHost` 分开定义，避免出现“按钮挂在回答容器下面，就必须作用于
整个容器所有内容”的隐式耦合。

## 搜索相关 UI

### 搜索状态标签（Search status label）

搜索尚未完成时，transcript 内显示的临时标签，例如 `正在搜索网页...`。它属于
live 状态投影，不是 durable 搜索结果。

### 搜索摘要标签（Search summary label）

搜索完成后，transcript 内显示的持久化标签，例如 `已阅读 10 个网页`。它是
打开搜索侧边栏的可点击入口。

### 搜索侧边栏（Search side panel）

右侧展示结构化搜索结果的面板。它不是从 transcript 内联标签本身重建的，而是
根据 durable tool invocation 输出重建的。

## 操作按钮放置

### Transcript 级操作（Transcript-level operation）

像 copy / regenerate / delete 这类 UI 操作，应该在 `TranscriptBlock` 层级上
定义语义，而不是继续按原始消息层级理解。

### 可复制正文（Terminal content）

一个 transcript block 内部真正应该参与 copy 的 assistant 正文内容。搜索标签
属于辅助信息，不应被当成操作按钮的视觉锚点或复制内容。
