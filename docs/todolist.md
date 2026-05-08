# Share 功能待办（v1）

这份待办定义 **thread-level snapshot share** 的第一版实现范围。

目标不是公开一个 live thread，也不是复刻原始 runtime，而是：

- 为一个已完成的 thread 创建一个**独立 public id** 的分享对象
- 冻结并持久化一份 **snapshot**
- 通过 `/share/:shareId` 提供一个**只读分享页**
- 复用现有的前端内容投影链，而不是再造一套分享版聊天模型

## 0. 背景与产品边界

### 0.1 已确认的产品事实

- [x] 分享链接不能直接暴露原始 `threadId`
- [x] 分享的是 **snapshot**，不是 live thread
- [x] 第一版只做 **thread-level share**
- [x] 第一版不做 **segment-level share**
- [x] 分享页是**只读页面**
- [x] 分享页应复用现有 transcript / answer container 渲染能力

### 0.2 第一版目标

- [ ] 创建 thread-level share
- [ ] 生成独立 `shareId`
- [ ] 持久化 immutable snapshot
- [ ] 提供 public read API
- [ ] 提供 revoke share API
- [ ] Vite 中实现分享弹窗
- [ ] Vite 中实现 `/share/:shareId` 只读页
- [ ] 分享页可打开搜索结果侧栏

### 0.3 非目标

- [ ] 不公开原始 `threadId`
- [ ] 不公开 live run / live thread 状态
- [ ] 不做 segment-level share
- [ ] 不做 replay share
- [ ] 不做“继续聊”真实 fork 能力
- [ ] 不把 `TranscriptBlock` / `AnswerContainer` 直接持久化到 infra
- [ ] 不要求分享页与 normal chat 的 runtime 完全统一

## 1. 数据模型优先

### 1.1 持久化实体

- [x] 新增 `ChatShare`
- [x] 新增 `ChatShareSnapshot`

### 1.2 `ChatShare` 字段

- [x] `id`
- [x] `publicId`
- [x] `sourceThreadId`
- [x] `scopeType`
- [x] `status`
- [x] `snapshotId`
- [x] `createdAt`
- [x] `revokedAt`

### 1.3 `ChatShareSnapshot` 字段

- [x] `id`
- [x] `shareId`
- [x] `payloadFormat`
- [x] `payloadVersion`
- [x] `payloadJson`
- [x] `messageCount`
- [x] `startSeq`
- [x] `endSeq`
- [x] `createdAt`

### 1.4 第一版状态和范围约束

- [x] `ChatShare.status` 仅支持 `active | revoked`
- [x] `ChatShare.scopeType` 第一版固定 `thread`
- [x] 第一版每个 thread 最多一个 active share
- [x] 第一版仅允许对 **没有 active run** 的 thread 创建 share

### 1.5 为未来预留的扩展点

- [x] 保留 `scopeType` 以支持未来 `segment-level share`
- [x] `payloadFormat/payloadVersion` 支持未来 payload 演进
- [x] `startSeq/endSeq` 为未来 message-range / segment-range 预留

## 2. Snapshot Payload 设计

### 2.1 payload 形态选择

- [x] 明确第一版存 **share-safe raw message snapshot**
- [x] 不直接存 `TranscriptBlock[]`
- [x] 不直接存 `AnswerContainer[]`

### 2.2 public payload 要求

- [x] 不暴露原始 `threadId`
- [x] 不暴露原始 `runId/messageId/partId/toolCallId`
- [x] 使用 share-local synthetic ids 或 share-safe ids
- [x] 过滤不应公开的 metadata / jsonValue
- [x] 保留分享页真正需要的 `text / reasoning / tool-call / tool-result` 信息

### 2.3 搜索数据

- [x] snapshot payload 中包含分享页打开 search panel 所需的数据
- [x] 分享页 search panel 不依赖 live thread timeline

## 3. Core / Contracts / DB / App

### 3.1 core types / repo

- [x] 在 `packages/core` 新增 `ChatShare` type
- [x] 在 `packages/core` 新增 `ChatShareSnapshot` type
- [x] 新增 `ChatShareRepository`
- [x] 新增 `ChatShareSnapshotRepository`

### 3.2 db

- [x] 在 `packages/db` 新增 share 相关 schema
- [x] 支持按 `publicId` 查询 share
- [x] 支持按 `threadId` 查询 active share
- [x] snapshot row 保持 immutable

### 3.3 contracts

- [x] 新增 `ChatShareDto`
- [x] 新增 `ChatShareSnapshotDto`
- [x] 新增 public share read DTO
- [x] 新增 create share response DTO
- [x] 新增 revoke share response DTO
- [x] 新增 thread current share state DTO

### 3.4 app use-cases

- [x] 新增 `createThreadSnapshotShare(...)`
- [x] 新增 `getPublicShare(...)`
- [x] 新增 `revokeShare(...)`
- [x] 新增 `getCurrentThreadShare(...)`

### 3.5 app 规则

- [x] create share 时检查 thread 是否存在
- [x] create share 时检查 thread 没有 active run
- [x] create share 时构建 snapshot
- [x] revoke 后 public read 返回明确错误语义

## 4. HTTP / Route Interface

### 4.1 内部管理接口

- [ ] `POST /api/threads/:threadId/shares`
- [ ] `GET /api/threads/:threadId/shares/current`

### 4.2 public 接口

- [ ] `GET /api/shares/:publicId`
- [ ] `POST /api/shares/:publicId/revoke`

### 4.3 路由要求

- [ ] public read 只接受 `publicId`
- [ ] 不存在 share 返回 404
- [ ] revoked share 返回明确错误（例如 410）
- [ ] active run 场景创建 share 返回 409

## 5. Vite 前端分层

### 5.1 schema

- [ ] 新增 `schema/share-snapshot.ts`
- [ ] 解析 public share payload
- [ ] 校验 share-local ids / search bundle / snapshot meta

### 5.2 repo

- [ ] 新增 `repo/share-api.ts`
- [ ] `createThreadSnapshotShare(threadId)`
- [ ] `fetchThreadSnapshotShare(publicId)`
- [ ] 如第一版需要，再补 `revokeThreadSnapshotShare(publicId)`
- [ ] 如第一版需要，再补 `fetchCurrentThreadShare(threadId)`

### 5.3 service

- [ ] 定义 share 页专用 view-model build 逻辑
- [ ] 从 shared snapshot 构建 `ContentNode[]` 或 share-safe equivalent
- [ ] 复用 normal projector 生成 `TranscriptBlock[]`
- [ ] 复用 `buildAnswerContainers(...)`
- [ ] 组装 share-local search panel bundle

### 5.4 runtime

- [ ] 新增 `use-share-dialog-state.ts`
- [ ] 新增 `use-shared-snapshot-runtime.ts`
- [ ] 分享弹窗状态机：`idle -> creating -> success | error`
- [ ] 只读分享页加载态 / 错误态 / 成功态

### 5.5 ui

- [ ] `ChatHeader` 增加分享入口承载位
- [ ] 新增 `ShareDialog`
- [ ] 新增 `SharedSnapshotConsole`
- [ ] 新增 `/share/:publicId` 路由
- [ ] 分享页复用 `ChatMessageList`
- [ ] 分享页复用 `SearchResultsPanel`
- [ ] 分享页不显示 sidebar / composer / replay control bar

## 6. 模型复用规则

### 6.1 应复用

- [ ] `ContentNode` 作为共享内容来源概念
- [ ] `TranscriptBlock`
- [ ] `AnswerContainer`
- [ ] `ChatMessageList`
- [ ] `SearchResultsPanel`

### 6.2 不应直接复用

- [ ] `ReplayStep`
- [ ] `ReplaySession`
- [ ] `LiveAssistantDraft`
- [ ] `useDurableChatRuntime`
- [ ] 直接面向 live thread 的 `chat-api.fetchThreadMessages`

## 7. “继续聊” 边界

### 7.1 第一版默认策略

- [ ] 第一版分享页先只读
- [ ] 不实现真实“继续聊”

### 7.2 若必须保留 CTA

- [ ] 只允许定义为 future fork 能力
- [ ] 不允许回到原 thread 继续写
- [ ] 不允许前端本地伪造 live thread 恢复

## 8. 测试计划

### 8.1 db / app / contracts

- [ ] db：`publicId` 唯一性
- [ ] db：active share by thread 查询
- [ ] db：snapshot immutable
- [ ] app：active run 时创建 share 失败
- [ ] app：revoke 后 public read 失败
- [ ] contracts：public DTO 不泄露内部 ids

### 8.2 Vite schema / repo

- [ ] schema：share payload 解析测试
- [ ] repo：create share 成功/失败/abort
- [ ] repo：fetch public share 成功/404/revoked

### 8.3 Vite service / runtime / ui

- [ ] service：shared snapshot -> transcript blocks
- [ ] service：shared snapshot -> answer containers
- [ ] service：search panel bundle build
- [ ] runtime：share dialog create flow
- [ ] runtime：shared page load / error / retry
- [ ] ui：只读分享页渲染
- [ ] ui：点击 search label 打开右侧 panel

## 9. 推荐执行顺序

### 第一轮：先定数据库与 contracts

- [x] core types
- [ ] db schema
- [x] contracts DTO
- [ ] app use-cases
- [ ] server routes

### 第二轮：前端边界层

- [ ] share schema
- [ ] share repo api
- [ ] shared snapshot service

### 第三轮：分享页

- [ ] `/share/:publicId`
- [ ] `SharedSnapshotConsole`
- [ ] 只读 transcript
- [ ] search panel

### 第四轮：分享弹窗

- [ ] header 入口
- [ ] `ShareDialog`
- [ ] create + copy
- [ ] current share state / revoke（若第一版要做）
