# AnswerContainer 改造待办

这份待办针对 `apps/playground-vite-web/src/features/durable-chat` 的
`AnswerContainer` 改造。

目标不是立刻改 UI 细节，而是先把 **后端执行概念**、**前端渲染概念** 和
**前端操作宿主概念** 拆清楚，再按最小 loop 逐步改 normal chat，最后再把
同一套模型移植到 replay。

## 0. 背景与问题定义

### 0.1 当前已知事实

- [x] `run` 是后端 / runtime 的执行概念。
- [x] `TranscriptBlock` 是前端 transcript 的顶层展示概念，不只是 operation 宿主。
- [x] 当前 normal chat 的 `TranscriptBlock` 不是严格按整个 `run` 分组。
- [x] 当前 replay 的主要问题之一，是把 `ReplayStep` 直接映射成 `TranscriptBlock`。
- [x] 当前 operation 的宿主和具体 action 的内容作用范围，还没有被清晰分层表达。

### 0.2 本次改造想解决的问题

- [ ] 在前端显式补出 `AnswerContainer` 概念。
- [ ] 让 operation 的宿主从“当前实现切出来的 block”提升到更稳定的回答宿主层。
- [ ] 让 `action host` 和 `action payload scope` 解耦。
- [ ] 先在 normal chat 中收正概念，再让 replay 复用，而不是各自发明规则。

### 0.3 非目标

- [ ] 不重写后端 `run` / `message` / `tool invocation` 的 durable 结构。
- [ ] 不在第一轮改 operation 的具体行为细节，例如 copy 是否包含 reasoning。
- [ ] 不在第一轮重做 replay 整体动画或 fake loading 策略。
- [ ] 不为了这一轮引入新的状态管理库。

## 1. 概念模型

### 1.1 目标术语

- [ ] `Run`
  - 后端执行边界。
  - 一次 run 可能包含多段 assistant 文本与多次 tool 调用。
- [ ] `TranscriptBlock`
  - 前端现有渲染单元。
  - 继续保留为前端概念。
- [ ] `AnswerContainer`
  - 前端新的“回答宿主”概念。
  - 通常绑定一个 `runId`，但不等于“后端 run 的所有事实原样投影”。
- [ ] `OperationHost`
  - 操作条挂载的宿主。
  - 第一版目标是：`AnswerContainer` 作为 operation host。
- [ ] `ActionPayloadScope`
  - 某个 action 实际作用的内容范围。
  - 不由 host 自动决定。

### 1.2 关系约束

- [ ] 一个 `AnswerContainer` 至少对应一个 `runId`。
- [ ] 一个 `AnswerContainer` 可以包含一个或多个 `TranscriptBlock`。
- [ ] `TranscriptBlock` 继续承载 `text / reasoning / search-status / search-summary / tool-part`。
- [ ] operation 挂在 `AnswerContainer`，而不是直接挂在单个 `TranscriptBlock`。
- [ ] 具体 action scope 由独立的派生逻辑决定，而不是默认取整个 container 全量内容。

### 1.3 推荐的前端层次

- [ ] Thread
  - `User message block`
  - `AnswerContainer`
    - `TranscriptBlock`
      - `AssistantTurnItem`
    - `OperationBar`

## 2. 类型优先

### 2.1 新增 types

- [ ] 新增 `types/answer-containers.ts`
- [ ] 定义 `AnswerContainer`
- [ ] 定义 `AnswerContainerKind`
- [ ] 定义 `AnswerContainerItemRef`
- [ ] 定义 `AnswerContainerActionContext`
- [ ] 定义 `ActionPayloadScope`

### 2.2 第一版建议字段

- [ ] `AnswerContainer`
  - `id`
  - `runId`
  - `transcriptBlockIds`
  - `blocks`
  - `actionHostId`
- [ ] `AnswerContainerActionContext`
  - `hostId`
  - `copyableTextParts`
  - `copyableReasoningParts`
  - `hasVisibleOperation`
- [ ] `ActionPayloadScope`
  - `text`
  - `reasoning`
  - `search`
  - `tool`

### 2.3 类型约束

- [ ] `TranscriptBlock` 不直接知道 operation host 的 UI 细节。
- [ ] `AnswerContainer` 不直接暴露组件级表现属性。
- [ ] `ActionPayloadScope` 保持纯数据定义，不混入浏览器行为。

## 3. Service 设计

### 3.1 新建纯逻辑

- [ ] 新建 `service/build-answer-containers.ts`
- [ ] 输入为现有 `TranscriptBlock[]`
- [ ] 输出为 `AnswerContainer[]`
- [ ] 第一版只做 normal chat 的 container 构建

### 3.2 normal chat 的 grouping 原则

- [ ] 明确第一版 normal chat 的 `AnswerContainer` 如何从现有 `TranscriptBlock[]` 生成。
- [ ] 避免直接把“整个 run 的所有 block”无条件聚成一个 container，除非规则先被定义清楚。
- [ ] 明确与当前 `buildTranscriptBlocks()` 的关系：
  - `buildTranscriptBlocks()` 继续负责 block 级投影
  - `buildAnswerContainers()` 在其之上再组织回答宿主

### 3.3 action context 纯逻辑

- [ ] 新建 `service/build-answer-container-actions.ts`
- [ ] 从 `AnswerContainer` 派生 operation visibility
- [ ] 从 `AnswerContainer` 派生 copyable 内容集合
- [ ] 明确：这里先只定义数据范围，不定义最终 copy 行为

## 4. Runtime / UI 接入（normal chat 优先）

### 4.1 runtime

- [ ] 在 normal chat 的 view-state 构建链路中，加入 `AnswerContainer[]`
- [ ] 保持 `TranscriptBlock[]` 继续可用，避免第一轮大面积替换
- [ ] 不在第一轮改变 live draft / SSE / run 恢复逻辑

### 4.2 UI

- [ ] 让 normal chat 的 operation 从 `TranscriptBlock` 迁移到 `AnswerContainer`
- [ ] 第一版允许 `TranscriptBlock` 仍负责渲染内容，但由 `AnswerContainer` 决定 operation 出现位置
- [ ] 先不改具体按钮内容，只改宿主边界

### 4.3 验收目标

- [ ] normal chat 中，一个用户感知上的回答只出现一套 operation
- [ ] operation 不再被中间 search label “截断”
- [ ] `TranscriptBlock` 仍然保留为前端显示概念，不被推翻

## 5. Replay 迁移（在 normal chat 收正之后）

### 5.1 replay 的前提

- [ ] replay 不单独定义另一套 operation host 语义
- [ ] replay 尽量复用 normal chat 的 `AnswerContainer` 概念

### 5.2 replay 改造目标

- [ ] replay 不再简单执行 `ReplayStep -> TranscriptBlock`
- [ ] replay 最终应产出可映射到 `AnswerContainer[]` 的展示结构
- [ ] replay 中 operation 的宿主与 normal chat 保持一致

### 5.3 replay 非目标

- [ ] 不要求 replay 第一轮就彻底重写 step 模型
- [ ] 不在这一轮同时优化 fake loading 的所有细节

## 6. 测试计划

### 6.1 service tests

- [ ] 为 `build-answer-containers.ts` 写纯函数测试
- [ ] 覆盖：
  - 单个 assistant block -> 单个 container
  - 多个相关 block -> 一个 container
  - search-only block 不单独成为操作宿主
- [ ] 为 `build-answer-container-actions.ts` 写纯函数测试
- [ ] 验证 operation visibility 和 action payload scope 派生正确

### 6.2 UI tests

- [ ] normal chat 页面中 operation 挂在 `AnswerContainer` 下，而不是中间 block 下
- [ ] `text | search-label | text` 结构只出现一套 operation
- [ ] search-only container 不显示 operation

### 6.3 replay tests

- [ ] 在 normal chat 收正后，为 replay 增加 container-level 测试
- [ ] 验证 replay 中间节点不会各自冒出一套 operation

## 7. 推荐执行顺序

### 第一轮：只做定义和类型

- [x] 补术语和设计说明
- [x] 新增 `AnswerContainer` 相关 types
- [x] 不改 UI 行为

### 第二轮：补纯逻辑

- [x] 新建 `build-answer-containers.ts`
- [x] 新建 `build-answer-container-actions.ts`
- [x] 补 service tests

### 第三轮：接 normal chat

- [ ] 在 normal chat view-state 中接入 `AnswerContainer[]`
- [ ] 调整 operation host
- [ ] 跑 Vite targeted tests / typecheck / review

### 第四轮：迁 replay

- [ ] 让 replay 复用 `AnswerContainer` 概念
- [ ] 调整 replay operation host
- [ ] 跑 replay focused tests / typecheck / review
