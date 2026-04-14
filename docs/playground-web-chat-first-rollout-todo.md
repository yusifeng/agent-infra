# Playground Web Chat-First Rollout TODO

本清单用于执行“chat-first / durable-secondary”改造。

目标不是继续围绕单个 loading 文案或单次 reconcile 打补丁，而是把 `apps/playground-web` 的聊天页收敛成两条边界清晰的链路：

- 主聊天链路：即时、乐观、以 `text_end` 为 transcript 完成信号
- durable 观察链路：最终持久化、右侧 inspector、允许异步补齐

## 设计原则

- 主聊天区不等待 durable 全部收尾才宣告“回复完成”。
- 主聊天区不再依赖整线程 `messages` 全量 reload 才进入最终态。
- 右侧 durable log 继续保留，但只能作为 secondary path。
- 全量 hydrate 只用于线程恢复、刷新、异常兜底，不作为每轮发送后的标准流程。

## Phase 1: 聊天状态机与完成信号分层

- [x] 把当前运行态拆成三个明确语义：
  - `isSending`
  - `isStreamingText`
  - `isPersisting`
- [x] 主聊天区的 loading 只由 `isSending || isStreamingText` 驱动
- [x] `text_end` 到达后立即：
  - 关闭底部唯一 loading 文案
  - 恢复 textarea 可编辑
  - 让 assistant message actions 可见
- [x] `isPersisting` 只服务 durable 补齐与 inspector，不再影响主聊天区
- [ ] 明确 stop 的主聊天语义：
  - 只停止当前页面继续接收流
  - 不伪装成服务端真正 cancel

## Phase 2: 去掉发送收尾的整线程 reconcile

- [ ] 移除发送完成后对整线程 `/messages` 的默认全量回读依赖
- [ ] live assistant draft 作为会话内主真相，避免结束时整块 transcript 抖动
- [ ] 如需 reconcile，只允许窄校正：
  - 当前 run
  - 当前 assistant message
  - recent runs 的静默刷新
- [ ] 把全量 `loadThreadMessages()` 退化为：
  - 线程切换恢复
  - 浏览器刷新恢复
  - reconnect / fallback recovery

## Phase 3: 主聊天事件与 durable 事件分层

- [ ] 为聊天 UI 明确主事件集合：
  - assistant start
  - text delta
  - text end
  - failed
- [ ] 右侧 inspector 继续消费 run / tool / timeline 事件
- [ ] 页面层 reducer 不再混用“聊天完成态”和“durable 完成态”

## Phase 4: 持久化热路径继续收缩

- [ ] 继续审视是否还有高频 durable 写入留在热路径
- [ ] assistant 文本落库尽量走最终态写入，而不是 per-delta durable write
- [ ] run / tool / event 保持结构化持久化，但不阻塞主聊天完成态

## 验收标准

- [ ] assistant 文本停止增长后，底部 loading 立即消失
- [ ] assistant 文本停止增长后，operator 立即可见
- [ ] assistant 文本停止增长后，输入框立即恢复可编辑
- [ ] 发送结束后不再默认触发整线程 transcript 全量替换
- [ ] 右侧 durable log 的慢刷新不再影响主聊天区完成态
- [ ] thread 切换、刷新恢复、右侧 inspector 仍可正常工作
