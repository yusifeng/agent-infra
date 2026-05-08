# Share 模型说明

这份说明定义 **thread-level snapshot share** 的第一版模型边界。

第一版目标不是公开 live thread，也不是公开一个可持续增长的对话对象，而是：

- 为一个已完成的 thread 创建一个独立 public id 的 share
- 冻结并持久化一份 immutable snapshot
- 通过 `/share/:shareId` 暴露一个只读分享页

## 目标

在当前 durable chat 结构里，已经有：

- `Thread`：内部会话对象
- `Run`：后端执行边界
- `Message / MessagePart`：durable 内容事实
- `TranscriptBlock / AnswerContainer`：前端投影模型

share 第一版要补的是：

- 一套 **public id** 体系
- 一套 **snapshot lifecycle** 体系
- 一套 **share-safe public payload** 体系

## 核心原则

### 1. 分享的是 snapshot，不是 live thread

share 一旦创建：

- 它代表当时那一刻的对话快照
- 原 thread 之后继续增长，不会污染已分享内容

### 2. share 使用独立 public id

对外 URL 不暴露原始 `threadId`。

第一版推荐：

```text
/share/:shareId
```

其中 `shareId` 是独立 public 标识，不等于内部 thread 主键。

### 3. 第一版只做 thread-level share

v1 只支持：

- 一个 share 对应整个 thread 的快照

不支持：

- segment-level share
- message-range share
- replay share

### 4. 前端不直接持久化 `TranscriptBlock` / `AnswerContainer`

第一版 snapshot payload 应该存：

- share-safe 的 message / part 快照

而不是直接存：

- `TranscriptBlock[]`
- `AnswerContainer[]`

原因是：

- `TranscriptBlock` / `AnswerContainer` 属于前端投影层
- 前端已经能从内容事实派生这些结构

### 5. 分享页复用现有前端投影链

分享页应复用现有：

- `ContentNode`
- `TranscriptBlock`
- `AnswerContainer`
- `ChatMessageList`
- `SearchResultsPanel`

它是新的只读数据源，不是新的聊天渲染体系。

## 持久化实体

### `ChatShare`

用于管理 share lifecycle：

- `id`
- `publicId`
- `sourceThreadId`
- `scopeType`
- `status`
- `snapshotId`
- `createdAt`
- `revokedAt`

其中：

- `scopeType` 第一版固定 `thread`
- `status` 第一版仅支持 `active | revoked`

### `ChatShareSnapshot`

用于管理 immutable snapshot：

- `id`
- `shareId`
- `payloadFormat`
- `payloadVersion`
- `payloadJson`
- `messageCount`
- `startSeq`
- `endSeq`
- `createdAt`

## payload 形态

第一版推荐 `payloadFormat = messages_v1`。

它表示：

- payload 是 share-safe 的 message snapshot
- 不是前端 `TranscriptBlock`
- 不是前端 `AnswerContainer`

### public payload 约束

public payload 不应暴露：

- 原始 `threadId`
- 原始 `runId`
- 原始 `messageId`
- 原始 `partId`
- 原始 `toolCallId`

它应使用 share-local id，或者 share-safe 的重新编码 id。

## internal / public 边界

### internal

内部管理接口可以知道：

- `sourceThreadId`
- `snapshotId`
- `status`

### public

public read 接口只需要暴露：

- `shareId`
- snapshot meta
- share-safe 的 message payload

不应暴露内部 durable 主键。

## 路由边界

第一版建议至少有：

### 内部管理

- `POST /api/threads/:threadId/shares`
- `GET /api/threads/:threadId/shares/current`

### public

- `GET /api/shares/:shareId`
- `POST /api/shares/:shareId/revoke`

## 前端边界

### 正常 chat

需要：

- 创建分享入口
- 分享状态查询
- 分享弹窗

### 分享页

需要：

- 独立 route：`/share/:shareId`
- 只读 runtime
- 复用现有 transcript / answer container 渲染

## 第一版限制

第一版建议保持这些限制：

- 仅允许对 **没有 active run** 的 thread 创建 share
- 每个 thread 最多一个 active share
- 分享页先只读
- 不做真正的“继续聊 / fork new thread”能力

## 后续扩展点

第一版完成后，未来可以沿这些方向扩展：

- `scopeType` 扩展到 `segment-level share`
- `payloadFormat/payloadVersion` 允许 payload 演进
- 从 share 派生新的私有 thread
- 允许每个 thread 管理多条历史 share
