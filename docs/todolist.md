# ContentNode 收敛待办

这份待办针对 `apps/playground-vite-web/src/features/durable-chat` 的
`ContentNode` 收敛。

目标是让 normal chat 与 replay 在“内容节点来源”这一层共享规则，而不是继续
各自重复解析 text / reasoning / search。

## 0. 背景与问题定义

### 0.1 当前已知事实

- [x] `AnswerContainer` 已经作为 operation host 在 normal chat 与 replay 中共享。
- [x] `TranscriptBlock` 是前端渲染概念，不等于后端 `run`。
- [x] `ReplayStep` 是播放控制概念，不应被内容模型替代。
- [x] 当前 normal chat 与 replay 仍然各自解析搜索相关内容。
- [x] 当前 normal chat 与 replay 还没有共享“原始内容 -> 可见节点”的单一事实层。

### 0.2 本次改造想解决的问题

- [x] 在前端显式补出 `ContentNode` 概念。
- [x] 把 text / reasoning / search-loading / search-summary 的原子内容语义统一到一层。
- [x] 让 normal chat 和 replay 共享节点来源，而不是共享 runtime。
- [x] 保持 `AnswerContainer`、`TranscriptBlock`、`ReplayStep` 的职责分离。

### 0.3 非目标

- [x] 保持不统一 live runtime 和 replay runtime。
- [x] 保持不把 `run` 和 `AnswerContainer` 合并。
- [x] 保持不取消 `ReplayStep`。
- [x] 保持不要求 replay 和 normal chat 使用完全相同的 block grouping。
- [x] 保持不在第一轮改变 operation 的具体 copy / regenerate 语义。

## 1. 概念模型

### 1.1 目标术语

- [x] `ContentNode`
  - 前端共享内容节点
  - 位于 `Message/Part` 与 `TranscriptBlock/ReplayStep` 之间
- [x] `ContentNodeProjector`
  - 从 `ContentNode[]` 投影成更高层 UI 结构的纯逻辑
- [x] `NormalTranscriptProjector`
  - 从 `ContentNode[]` 产出 normal chat 的 `TranscriptBlock[]`
- [x] `ReplayStepProjector`
  - 从 `ContentNode[]` 产出 replay 的 `ReplayStep[]`

### 1.2 关系约束

- [x] `ContentNode` 是内容事实，不直接承担播放时序。
- [x] `ContentNode` 不直接承担 operation host 语义。
- [x] normal chat 与 replay 共享 `ContentNode` 来源，但可以有不同 projector。
- [x] `AnswerContainer` 继续作为最终共享的回答宿主层。

## 2. 类型优先

### 2.1 新增 types

- [x] 新增 `types/content-nodes.ts`
- [x] 定义 `ContentNodeKind`
- [x] 定义 `BaseContentNode`
- [x] 定义 `UserTextNode`
- [x] 定义 `UserReasoningNode`
- [x] 定义 `AssistantTextNode`
- [x] 定义 `AssistantReasoningNode`
- [x] 定义 `AssistantSearchLoadingNode`
- [x] 定义 `AssistantSearchSummaryNode`
- [x] 定义 `AssistantToolPartNode`

### 2.2 第一版建议字段

- [x] 通用字段：
  - `id`
  - `threadId`
  - `runId`
  - `messageId`
  - `sourcePartId`
  - `blockHintId`
  - `kind`
- [x] text / reasoning 节点：
  - `text`
- [x] search-loading 节点：
  - `toolCallId`
  - `query`
- [x] search-summary 节点：
  - `toolCallId`
  - `query`
  - `resultCount`
  - `sourceNames`
  - `sources`

### 2.3 类型约束

- [x] `ContentNode` 不直接依赖 React 组件类型。
- [x] `ContentNode` 不直接暴露操作条可见性字段。
- [x] `ReplayStep` 不反向嵌入 `TranscriptBlock`。

## 3. 共享解析层

### 3.1 抽共享 search 解析

- [x] 新建 `service/content-node-search.ts`
- [x] 抽出 search tool-call 解析
- [x] 抽出 search tool-result 解析
- [x] 让 normal chat 和 replay 复用这层解析

### 3.2 构建 `ContentNode[]`

- [x] 新建 `service/build-content-nodes.ts`
- [x] 输入先支持现有 `MessageDto[]`
- [x] 输出共享 `ContentNode[]`
- [x] 第一版保证能覆盖：
  - user text
  - assistant text
  - assistant reasoning
  - assistant search loading
  - assistant search summary
  - assistant tool-part

## 4. normal chat projector

### 4.1 projector 纯逻辑

- [x] 新建 `service/project-normal-transcript-blocks.ts`
- [x] 从 `ContentNode[]` 产出 `TranscriptBlock[]`
- [x] 保留当前 normal chat 的阅读语义：
  - assistant message 边界
  - 连续 tool/search 的合理聚合

### 4.2 接入 normal chat

- [x] 让 `chat-view-state.ts` 改从 `ContentNode[]` 走 projector
- [x] 保持 `AnswerContainer` 构建逻辑继续复用
- [x] 保持不动 live draft / recover / reconcile

## 5. replay projector

### 5.1 projector 纯逻辑

- [x] 让 `build-replay-steps.ts` 从 `ContentNode[]` 构建，而不是重新解析 `TranscriptBlock`
- [x] 保留 replay 的 fake loading / timing 行为
- [x] 不要求 replay block grouping 等于 normal chat

### 5.2 presentation

- [x] 让 replay presentation 尽量消费共享节点来源
- [x] 保持 replay 继续复用 `AnswerContainer`
- [x] 保持不要求第一轮消除所有 synthetic message/part

## 6. 测试计划

### 6.1 type / service tests

- [x] 为 `build-content-nodes.ts` 写纯函数测试
- [x] 覆盖：
  - text / reasoning 提取
  - search-loading 提取
  - search-summary 提取
  - tool-part 保留
- [x] 为共享 search 解析层写纯函数测试

### 6.2 normal chat tests

- [x] projector 测试覆盖当前 normal chat 的 block 语义
- [x] `AnswerContainer` 相关 UI 测试继续保持通过

### 6.3 replay tests

- [x] replay step 构建改为基于 `ContentNode[]` 后，保持现有 replay 测试通过
- [x] container-level replay tests 继续通过

## 7. 推荐执行顺序

### 第一轮：只做定义和类型

- [x] 新增 `docs/source-of-truth/content-node-model.md`
- [x] 新增 `types/content-nodes.ts`
- [x] 不改行为

### 第二轮：补共享解析与 `build-content-nodes.ts`

- [x] 抽共享 search 解析
- [x] 抽 `build-content-nodes.ts`
- [x] 补 service tests

### 第三轮：接 normal chat projector

- [x] 接 `project-normal-transcript-blocks.ts`
- [x] 保持 normal chat 行为不变
- [x] 跑 Vite targeted tests / typecheck / review

### 第四轮：接 replay projector

- [x] 让 replay steps 改从 `ContentNode[]` 构建
- [x] 跑 replay focused tests / typecheck / review
