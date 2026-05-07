# Replay 功能待办

这份待办只针对 **Vite consumer** 的 replay 功能。

目标不是精确复刻历史 SSE delta，而是基于已有 durable 数据，重新演出一个**节点驱动的拟态流式重放**：

- 文本节点出现
- 搜索开始时出现 fake loading
- 搜索完成后切成搜索标签
- 再继续后续文本

## 0. PRD / 范围定义

### 0.1 功能目标

- [x] 提供一个独立的 replay 路由，用于重放一条已有历史对话
- [x] 页面主体尽量复用 chat 布局与 transcript 渲染风格
- [ ] 底部不再使用 `ComposerDock`，改为 replay 控制面板
- [x] replay 强调**过程节点**，不强调逐字或真实 token 流式复刻

### 0.2 第一版明确目标

- [x] 第一版采用**节点驱动 replay**
- [x] 第一版按现有 transcript item / block 粒度播放，不做逐字机
- [x] 第一版支持搜索 fake loading：`text -> search-loading -> search-label -> text`
- [x] 第一版支持 `播放 / 暂停 / 继续 / 重播`
- [x] 第一版不要求真实还原当时的 SSE 节奏

### 0.3 明确非目标

- [x] 不做 deterministic rerun
- [x] 不做 token 级 replay
- [x] 不先要求 infra 增加 replay engine
- [x] 不做复杂 scrubber / 任意拖动进度条
- [x] 不把 replay 和 chat 挤进同一个 route mode

## 1. 路由与页面骨架

### 1.1 路由命名

- [x] 新增 replay route：`/replay/:threadId`
- [x] 保持 replay 为独立页面，不做 `/chat/:threadId?mode=replay`

### 1.2 页面结构

- [x] 新增 replay 页面入口组件
- [x] 复用 chat 主布局的 transcript 区域
- [x] 底部改为 `ReplayControlBar`
- [x] 评估 replay 页面是否沿用现有 sidebar / thread list
- [x] 评估 replay 页面是否沿用现有 search side panel

### 1.3 页面状态边界

- [x] replay 页面和 chat 页面状态显式分离
- [x] replay 页面不复用 `draft` / `send` / `activeResponseRun` 语义
- [x] replay 页面不依赖 live SSE

## 2. 数据结构与接口优先

### 2.1 类型层（types）

- [x] 新建 replay feature-local `types/`
- [x] 定义 `ReplayRouteParams`
- [x] 定义 `ReplayMode`
- [x] 定义 `ReplayStatus`
- [x] 定义 `ReplayStep`
- [x] 定义 `ReplaySession`
- [x] 定义 `ReplayCursor`
- [x] 定义 `ReplayControlState`
- [x] 定义 `ReplayViewState`

### 2.2 建议的核心类型

- [x] 定义 `ReplayStepKind`
  - `text`
  - `search-loading`
  - `search-summary`
  - `done`
- [x] `ReplayStep` 至少包含：
  - `id`
  - `kind`
  - `threadId`
  - `runId?`
  - `messageId?`
  - `delayMs`
- [x] `text` step 至少包含：
  - `content`
  - `sourceMessageIds`
  - `blockId?`
- [x] `search-loading` step 至少包含：
  - `toolCallIds`
  - `query?`
  - `sourceNames?`
- [x] `search-summary` step 至少包含：
  - `toolCallIds`
  - `query`
  - `resultCount`
  - `sourceNames`
  - `runId`
- [x] `ReplaySession` 至少包含：
  - `threadId`
  - `steps`
  - `initialTranscriptBlocks`
  - `startedAt?`
- [x] `ReplayCursor` 至少包含：
  - `stepIndex`
  - `status`
  - `startedAt`
  - `lastAdvancedAt`

### 2.3 设计原则

- [x] replay 类型优先表达**节点**，不是 token
- [x] replay 类型优先和现有 `TranscriptBlock` / `AssistantTurnItem` 对齐
- [x] 搜索节点显式区分 `loading` 和 `summary`
- [x] 让 replay state 能直接喂给现有 `ChatMessageList` 或其轻微扩展版本

## 3. 数据来源与边界

### 3.1 MVP 数据来源

- [x] MVP 仅依赖现有 durable 数据：
  - `messages`
  - `toolInvocations`
  - 必要时 `run timeline`
- [x] 明确：MVP 不依赖历史 `assistant_delta`
- [x] 明确：MVP 不依赖历史 live draft

### 3.2 Repo 层

- [x] 为 replay 新增 feature-local repo facade
- [x] 复用现有 thread messages fetch
- [x] 复用现有 search panel timeline/toolInvocation fetch
- [x] 评估是否新增 `repo/replay-api.ts`
- [x] 如果新增 `repo/replay-api.ts`，由它组合：
  - thread messages
  - timeline
  - tool invocations

### 3.3 是否需要后端新接口

- [x] 第一版先不新增后端 replay 专用接口
- [x] 先验证现有：
  - `/api/threads/:threadId/messages`
  - `/api/runs/:runId/timeline`
  是否足够
- [ ] 如果 thread 太长或 run 聚合太复杂，再评估是否需要 replay-basis API

## 4. 纯逻辑：从 durable 数据生成 replay steps

### 4.1 Schema / parsing

- [x] 明确 replay 需要消费哪些现有 shape
- [x] 如果 search artifact 还需解析，复用现有 `schema/search-panel.ts`
- [x] 不在 UI 中直接解析未知 payload

### 4.2 Service：step 构建

- [x] 新建 `service/build-replay-steps.ts`
- [x] 从历史 transcript / source messages 生成 replay steps
- [x] 文本节点按现有 item/block 粒度切分
- [x] 遇到历史 `search-summary` 时，合成为：
  - `search-loading`
  - `search-summary`
- [x] 为 fake loading 设默认时长策略
- [x] 允许以后按 step kind 调整 delay

### 4.3 Service：播放策略

- [x] 新建 `service/replay-timing.ts`
- [x] 定义默认 `delayMs` 规则
- [x] 文本块 delay 和搜索 loading delay 分开
- [ ] 后续可扩展成速度倍率，但第一版先不做

### 4.4 Service：回放中的展示派生

- [ ] 新建 `service/replay-presentation.ts`
- [x] 从 `ReplaySession + ReplayCursor` 派生当前可见 transcript
- [x] 派生当前可见 search label / loading
- [x] 派生当前控制条状态

## 5. Runtime：播放控制与状态推进

### 5.1 Replay runtime

- [x] 新建 `runtime/use-replay-runtime.ts`
- [x] runtime 只做：
  - 播放循环
  - step 推进
  - pause/resume
  - restart
- [x] runtime 不直接解析 raw durable payload

### 5.2 Replay state machine

- [x] 定义最小状态：
  - `idle`
  - `playing`
  - `paused`
  - `completed`
- [x] 明确 `restart` 会回到 step `0`
- [x] 明确 route 切换时会清理定时器
- [x] 明确 thread 变更时会重建 replay session

### 5.3 Search panel 联动

- [ ] 明确 replay 时 search panel 的行为
- [ ] MVP 可先保持“点击搜索标签才打开”
- [ ] 评估是否需要“播放到 search-summary 时自动高亮 panel data”

## 6. UI：页面与控制面板

### 6.1 Replay 页面组件

- [x] 新建 replay 页面组件
- [x] 复用 chat transcript 容器
- [x] 区分 replay 页和 chat 页的底部区域

### 6.2 Replay transcript 渲染

- [x] 评估是复用 `ChatMessageList` 还是包一层 replay adapter
- [x] 优先复用 `TranscriptBlock` 渲染
- [x] 优先复用现有 search label 组件
- [x] 优先复用现有 search side panel

### 6.3 Replay control bar

- [x] 新建 `ReplayControlBar`
- [x] 第一版提供：
  - `播放`
  - `暂停`
  - `继续`
  - `重播`
- [x] 显示当前 replay 状态
- [x] 显示当前节点进度（如 `2 / 7`）

## 7. 测试计划

### 7.1 Service tests

- [x] 为 `build-replay-steps.ts` 写纯函数测试
- [x] 覆盖：
  - `text -> search-summary -> text`
  - 多次搜索
  - 无搜索的纯文本回答
- [x] 验证 search-summary 会被合成为 `loading + summary`
- [x] 验证 block/item 粒度切分正确

### 7.2 Runtime tests

- [x] 为 `use-replay-runtime.ts` 写 hook 测试
- [x] 覆盖：
  - 播放推进
  - 暂停
  - 继续
  - 重播
- [x] 验证 route/thread 切换时定时器清理

### 7.3 UI tests

- [x] 为 replay 页面写最小组件测试
- [ ] 覆盖：
  - replay control bar 状态切换
  - search loading -> search label 过渡
  - replay transcript 节点顺序显示

### 7.4 手工验收

- [ ] 用一个包含 2 次以上搜索的 thread 做 replay 验收
- [ ] 验证：
  - 先出现前置文本
  - 再出现 fake searching
  - 再出现 search label
  - 再出现后续文本
- [ ] 验证 replay 结束后状态稳定

## 8. 进阶项（先不做）

- [ ] 真实 assistant delta 历史 replay
- [ ] replay 速度调节
- [ ] 下一步 / 上一步 step-through
- [ ] 拖动进度条 scrubber
- [ ] 与 run inspector 完整联动
- [ ] replay-basis 后端接口

## 9. 推荐实现顺序

### 第 1 轮

- [x] 先定 `types`
- [x] 先做 `build-replay-steps.ts`
- [x] 先补 service tests

### 第 2 轮

- [x] 做 `use-replay-runtime.ts`
- [x] 补 runtime tests

### 第 3 轮

- [x] 接 replay route
- [x] 做 `ReplayControlBar`
- [x] 接 transcript 渲染

### 第 4 轮

- [ ] 接 search panel 联动
- [ ] 做手工验收和细节调节

## 10. 备注

- [x] replay 第一版是**业务层能力**
- [x] 不要求 infra 先提供 replay engine
- [ ] 如果后面要求更真实的 replay，再回头评估 infra 最小增量能力：
  - replay-basis 读模型
  - 更强关联 run event payload
  - coarse checkpoint / assistant delta durable 化
