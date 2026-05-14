# 唯一事实源（Source of Truth）

这个目录用于存放需要长期维护、并且应被视为**唯一事实源**的文档。

适合放在这里的文档通常具有这些特点：

- 定义稳定的概念模型、术语或关系约束
- 为多个实现层共享，而不只是某一次任务的临时说明
- 会被后续功能、重构或 review 反复引用
- 如果事实发生变化，应优先修改这里，而不是在多个零散文档里重复改写

当前放在这里的内容包括：

- `answer-container-model.md`
  - durable chat 前端中 `run`、`TranscriptBlock`、`AnswerContainer`、
    `OperationHost`、`ActionPayloadScope` 的关系定义
- `content-node-model.md`
  - durable chat 前端中 `ContentNode` 作为 normal chat 与 replay 共享内容来源的定义，
    以及它与 `TranscriptBlock`、`AnswerContainer`、`ReplayStep` 的职责边界
- `share-model.md`
  - thread-level snapshot share 的持久化实体、public id、snapshot payload、
    internal/public contracts，以及 Vite 只读分享页应复用的内容边界
- `playground-host-auth-model.md`
  - playground Fastify/Vite 宿主侧 auth 的边界、ownership 规则、
    session/cookie 模型、受保护路由语义，以及为什么它不进入 shared packages
- `playground-chat-mode-model.md`
  - playground Fastify/Vite 在 `/new` centered landing 上采用的
    DeepSeek 双模式语义、host meta 暴露规则、模式到真实模型的映射，
    以及非 DeepSeek fallback 的降级边界
- `playground-fastify-env-db-mode.md`
  - playground Fastify host 的 env 加载边界、`PLAYGROUND_DB_MODE`
    作为唯一 DB 类型选择器的规则、prepared scripts 约束，
    以及 `/api/meta` 的 DB 报告必须与真实 `DbConfig` 一致
- `playground-thread-auto-title-model.md`
  - playground Fastify/Vite 的 thread auto-title 业务边界、
    run 完成后的触发规则、默认标题态判断、
    event-primary / refresh-fallback 更新链路，以及 `header + sidebar active item`
    的共享打字机表现规则
- `playground-search-browse-policy-model.md`
  - playground Fastify/Vite 的 search planner / openUrl 业务边界、
    host-level tool execution gate、`search/browse/answer` phase、
    `quick/expert` 搜索预算，以及前端聚合搜索/浏览摘要的展示规则
- `run-attach-stream-model.md`
  - active assistant run 的 attach-stream 语义、snapshot-first 恢复模型、
    transient stream state 与 durable transcript state 的边界、
    version / live draft identity / unavailable fallback 规则，
    以及刷新页面和切换 thread 后重新订阅运行中 run 的用户可见行为
- `run-trace-usage-contract.md`
  - Run Trace & Usage Contract v1 的 durable raw trace、typed timeline projection、
    versioned usage summary、`message_update` live-only 边界、app/thread/run
    attribution 规则，以及 usage records、cancel、replay/eval 的后续进入条件

## 不适合放在这里的内容

下面这些内容不应进入这个目录：

- 一次性待办清单
- 已完成任务的执行过程记录
- 仅服务于某个临时实现 loop 的计划
- 只对单个页面或一次性实验有效的短期说明

## 维护规则

如果某个概念已经进入这个目录：

1. 后续新增实现应优先对齐这里的定义
2. 若实现发现定义不准确，应优先更新这里
3. 其它文档可以引用这里，但不应复制出另一份并行事实
