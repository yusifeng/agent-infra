# Playground Web Chat Runtime UX TODO

本清单基于 `chatgpt-response/3.txt` 的静态分析结论转写，并结合当前仓库代码做了本地校正。

目标不是继续补丁式修边角，而是把 `apps/playground-web` 的中间 chat 区真正收敛成“聊天产品主链路优先”，同时保留右侧 durable log 作为次级观察面。

## 转写原则

- 尽量不遗漏 WebGPT 提到的问题和建议。
- 如果某条建议与当前优化方向冲突，保留“问题本身”，但改写成更合理的待办表述。
- 对于仍需验证的问题，用“调查 / 验证”任务明确标注，而不是伪装成已证实结论。

## P0: 先把聊天主链路从 durable 收尾里拆出来

- [x] 引入明确的 chat phase 状态机，至少覆盖 `idle / thinking / streaming / transcript-final / failed`
  - 现状问题：
    - `loading`、textarea disabled、operator、message actions 目前分别被 `sending`、`text_end`、stream close 等不同状态驱动。
    - assistant 文本已经结束后，输入区和操作区仍可能晚一拍恢复。
  - 目标：
    - 聊天主区只由 transcript completion 相关状态驱动。
    - 不再让 `sending` 这种粗粒度状态同时控制所有 UI。

- [x] assistant 文本停止增长后，立即释放聊天主链路 UI
  - 要求：
    - 底部 loading 消失
    - textarea 恢复可编辑
    - send/operator 恢复到非运行态
    - assistant message actions 可见
  - 明确说明：
    - 上述恢复时机不应再等待 `run.completed`
    - 更不应等待整条 stream close 或后续 durable reconcile

- [x] 从 `sendMessage().finally` 中移除整页式 thread reconcile 依赖
  - 现状问题：
    - 当前发送完成后仍会调用 `loadThreadMessages(threadId, ...)`
    - 这会触发 messages / runs / selected run / timeline 的整套恢复逻辑
  - 目标：
    - 发送完成只做 chat 局部收口
    - durable log 的补齐改为后台异步，不再阻塞 chat 主区恢复

- [x] 设计并实现“聊天局部收口”路径，替代 `loadThreadMessages(...)`
  - 应至少覆盖：
    - optimistic user 清理
    - live assistant 最终落位
    - 当前 run 的最终状态对齐
    - 必要时的静默 recent runs 更新
  - 不应覆盖：
    - 整线程 messages 全量重拉
    - thread 初始化恢复
    - 右侧 pane 的完整 timeline hydrate

## P0: 拆掉 `loadThreadMessages()` 的职责过载

- [x] 把 `loadThreadMessages()` 拆分成更小的职责函数
  - 建议至少拆为：
    - `hydrateTranscript(threadId)`
    - `hydrateRecentRuns(threadId)`
    - `resolveSelectedRun(threadId, preferredRunId, runs, messages)`
    - `hydrateRunTimeline(runId)`
  - 目标：
    - “切 thread 的恢复逻辑”与“发送完成后的局部收口逻辑”彻底分开

- [x] 禁止 thread hydrate 逻辑继续承担发送收尾职责
  - 当前风险：
    - 一个 loader 同时处理 transcript、recent runs、preferred run、selected run、timeline、optimistic/live state、error/loading
  - 验收：
    - 切 thread 仍可恢复 durable 视图
    - 发送完成不再复用线程级 loader

## P0: 统一 assistant 渲染模型

- [x] 把 `LiveAssistantCard` 与 persisted `MessageCard` 合并为同一套 assistant transcript item
  - 现状问题：
    - 当前是两张不同来源的卡在切换
    - message actions、最终样式、状态收口容易晚一拍
  - 目标：
    - 同一张 assistant item 支持 `source: pending | persisted`
    - UI 不再依赖“切卡”来进入最终态

- [x] 明确 assistant transcript item 的 final barrier
  - 当前候选信号：
    - `text_end`
    - `run.completed`
    - persisted message commit
  - 需要做的事：
    - 明确哪个信号表示“聊天主区可以完成收口”
    - 这个信号必须只服务 transcript，不再混入右侧 durable log 语义

- [x] 验证并修正“空 assistant 壳”风险
  - 风险来源：
    - runtime 在 `message_start` 就会创建 assistant shell
    - 若恢复逻辑只按“是否存在 assistant message”判断，可能清掉 live draft，却只剩空壳
  - 要求：
    - 明确使用“是否已有 assistant 可见内容 / final part”来判断，而不是仅看 message 行存在

## P0: 重做 `message_update` 的 durable 策略

- [x] 停止把每次 assistant `message_update` 都放在聊天收口的关键路径上
  - 当前问题：
    - `packages/runtime-pi/src/runtime.ts` 对每个 `message_update` 都 `appendRunEvent(...)`
    - 同时 observer 与 SSE 写入又是 `await` 串行的
  - 目标：
    - chat 主链路不再被高频 durable event 拖住

- [x] 为 `message_update` 重新定义 durable 策略
  - 可选方向：
    - 完全不做 per-delta durable write
    - batch / coalesce / sampled checkpoint
    - 移到 debug-only / background sink
  - 验收：
    - assistant 文本结束后的 durable tail 明显缩短
    - timeline 事件量更可控

- [x] 审视 `message_update` payload 的实际价值
  - 现状问题：
    - 当前 durable payload 更像摘要（如 `deltaLength`），不能直接恢复 transcript
    - 但却付出了高频写入成本
  - 目标：
    - 明确这条链路到底是为恢复、为审计，还是仅为调试
    - 与其目标不匹配的 payload / 写入策略需要收缩

## P0: observer / transport 不能继续卡住 runtime 完成

- [x] 评估并修正“best-effort observer 实际在关键路径上”的问题
  - 当前风险：
    - `emitLiveAssistantUpdate()`、`emitPersistedUpdate()` 都被 `await`
    - route 中 `queueSseEvent()` 也被串行 `await writer.write()`
    - 慢客户端 / 背压会拖长 `runTurn()` 收尾
  - 本轮收口策略：
    - stream route 的 observer 回调只负责“同步入队 SSE payload”
    - `writer.write()` 继续串行，但只留在 route 自己的 `writeChain`
    - runtime 仍按原顺序触发 observer，但不再直接等待底层 socket flush
  - 目标：
    - chat 完成不再被 transport 背压拖住

## P0: stop 语义必须和真实行为一致

- [x] 明确当前 stop 是“真正取消服务端生成”还是“只断开本地流”
  - 当前怀疑：
    - 客户端只 abort fetch
    - runtime / route 未必真正 cancel `runTurn()`
  - 验收：
    - 文案、按钮语义、后端行为三者一致

- [x] 如果暂时做不到 server-side cancel，就修改 UI 文案与行为定义
  - 例如显式区分：
    - `Stop generating`
    - `Stop viewing stream`
  - 不允许继续“看起来像 stop，实际上只是断流”
  - 当前结论：
    - 现有实现只能停止当前页面继续接收流，不会真正取消服务端 `runTurn()`
    - 本轮先把 composer 按钮语义收敛到“停止接收响应”

## P1: 把右侧 durable log 降级为真正的 secondary path

- [ ] 把 transcript controller 与 run inspector controller 拆开
  - 右侧 durable log 相关状态至少应从 chat 主链路剥离：
    - `recentRuns`
    - `selectedRunId`
    - `timeline`
    - `runEvents`
    - `toolInvocations`

- [ ] 禁止右侧 run 选择继续影响中间 chat live state
  - 当前风险：
    - `loadRunTimeline(runId)` 会改写 `liveAssistantDraft`
  - 验收：
    - 切换右侧 run 不再清掉当前 live assistant

- [ ] pane 关闭时减少或停止不必要的 durable log 主动刷新
  - 当前怀疑：
    - pane 关闭后 recent runs / timeline 的成本仍可能进入 chat 主链路
  - 目标：
    - 右侧 pane 关闭时，聊天主区尽量只维护 chat 所需最小状态

- [ ] background durable refresh 失败不再默认抬升为 chat 主区错误
  - 目标：
    - transcript 自己加载失败才影响主区 banner
    - 右侧 pane 的恢复失败只在右侧 pane 自己显示

## P1: 收缩前端 dead path / 不一致 contract

- [x] 处理 `run.event` / `run.tool` contract 与实际 stream route 行为不一致的问题
  - 当前现状：
    - DTO / reducer 仍支持 `run.event`、`run.tool`
    - 但当前 stream route 主链路并不实际发送这些事件
  - 注意：
    - 这里不是要求恢复它们进入 chat 主链路
    - 而是要求做出明确决策：
      - 删除 dead path
      - 或迁移到 debug-only/live log path

- [x] 收缩 `applyRunStreamEvent()` 与实际事件源之间的错位
  - 目标：
    - 页面层不再保留“理论上支持、实际上从不出现”的 reducer 分支

## P1: 收紧恢复与持久化边界

- [ ] 让“页面恢复能力”与“聊天运行态”彻底解耦
  - durable 恢复仍要保留：
    - thread messages
    - recent runs
    - run timeline
  - 但不能继续反向污染 live transcript controller

- [ ] 把 selected run 的本地持久化从全局 key 改成 thread-scoped
  - 当前风险：
    - `SELECTED_RUN_STORAGE_KEY` 是全局 key
    - 跨 thread 解析会引入无谓的 preferred run 解析与状态污染

## P2: 文档与架构心智模型对齐

- [ ] 补一份“聊天主链路 vs durable 观察链路”的架构说明
  - 建议落到：
    - `docs/runtime-observability.md`
    - 或新增 chat runtime UX 文档
  - 目标：
    - 明确三层：
      - live UI path
      - durable projection path
      - background/debug path

- [ ] 校正文档里容易把页面继续理解成“durable runtime console”的表述
  - 说明：
    - 不是否定 durable 能力
    - 而是明确：对当前这个页面来说，中间 chat 区必须按聊天产品对待

## 需要验证但暂不直接下结论的点

- [ ] 验证 `message_update` durable write 对尾延迟的具体贡献占比
- [ ] 验证整线程 `loadThreadMessages()` 重拉对发送收尾延迟的具体贡献占比
- [ ] 验证 recent runs / timeline refresh 在 pane 开/关状态下的实际成本差异
- [ ] 验证“空 assistant 壳”在 refresh / reconnect / thread 切换场景下是否稳定复现

## 明确不直接照搬 WebGPT 原文的部分

- [ ] 不把“恢复 `run.event` / `run.tool` 重新进聊天主链路”作为直接任务
  - 理由：
    - 当前主方向是减少 chat 主链路上的重事件与 tail latency
    - 这类事件如果需要 live 展示，更适合迁移到 debug-only path，而不是重新塞回 chat 热路径

## 验收标准

- [ ] assistant 文本停止增长后，中心 chat 的 loading 应立即消失
- [ ] assistant transcript final 之后，textarea 应立即恢复可编辑
- [ ] stop/send operator 的切换不再绑定整个 stream session 的关闭时刻
- [ ] message actions 不再等待一次全量 reconcile 或 persisted card 切换
- [ ] `sendMessage()` 收尾不再复用切 thread 的 hydration 逻辑
- [ ] thread 切换的 loader 与发送完成的收口逻辑是两条不同路径
- [ ] durable log 的 recent runs / timeline 补齐不再阻塞 chat 主区域恢复
- [ ] 右侧 run 选择不再清掉当前 live assistant
- [ ] pane 关闭时，不再让 recent runs / timeline 刷新成本进入 chat 主链路
- [ ] background durable refresh 失败不再默认污染 chat 主区
- [ ] 若保留 `message_update` durable event，它也不再位于聊天收口关键路径上
- [ ] stop 的行为与文案完全一致
