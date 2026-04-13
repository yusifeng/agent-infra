你拿到的是 **repomix 打包代码 + 描述材料**，不是可执行仓库。
请先做静态分析，不要假设你能运行任何本地命令。

## Inputs
- 代码包：`repomix-chat-runtime-ux-core.txt`
- 文件清单：`repomix-chat-runtime-ux-files.md`
- 说明：路径统一使用仓库相对路径（repo-relative）

## 背景
这个仓库的 `apps/playground-web` 是 `agent-infra` 的第一个 consumer，但当前讨论的页面本质上是一个 **聊天产品页面**，不是纯调试台。

现在的实现混合了三类目标：
- 聊天主体验
- durable run / message / tool / event 的可观测性
- 页面刷新后依赖 durable 数据恢复

我们怀疑当前实现把这三件事缠在一起了，导致：
- UI 体验越来越像调试控制台，而不是聊天产品
- 一轮消息结束后的状态收口很重
- 很多地方靠 reconcile / reload / patch 在兜底

请你从“聊天产品优先、durable log 次要但保留”的角度，重新审视这套设计。

## Hard Constraints
1. 不要建议运行任何命令（包括测试、构建、lint）。
2. 不要依赖仓库外文件。
3. 不要把回答停留在局部 patch；请优先给结构性分析。
4. 右侧 durable log 可以降权，但不是删除目标。
5. 不要假设可以改变产品目标。目标就是：**中间 chat 区必须像真正聊天产品**。

## 我们已经观察到的已知问题
请先验证这些问题是否真实存在，并判断它们是“局部实现问题”还是“结构性问题”。

1. assistant 文本看起来已经结束，但页面还要等一会儿才彻底“稳定”下来。
   - 例如底部 loading、input operator、消息底部 action 的出现/恢复会晚一拍。

2. `sendMessage()` 结束后仍依赖一次较重的 reconcile。
   - 当前实现里发送收尾仍会调用 `loadThreadMessages(...)`，而这个函数并不只是“拉消息”，还会顺带处理 runs、selected run、timeline、optimistic state、live draft 等。

3. `loadThreadMessages()` 职责明显过载。
   - 它同时承担：
     - thread hydration
     - recent runs 加载
     - selected run 推导
     - timeline reload
     - optimistic/live state 清理
   - 请判断这是不是当前复杂度失控的核心原因之一。

4. assistant 当前存在 “live card” 和 “persisted message card” 两套渲染模型。
   - 这会造成某些 UI 元素只能等持久化刷新后才出现。
   - 请判断这是不是导致 operator / action 区晚出现的重要原因。

5. loading / sending / streaming 语义不够干净。
   - 之前一度在多个位置重复显示 loading / streaming。
   - 现在已经收敛到一个底部 loading 文案，但其状态判定是否合理仍不确定。
   - 请判断：
     - loading 应该跟 `sending` 走？
     - 跟 `text_end` 走？
     - 跟 `run.completed` 走？
     - 是否应该拆成 `thinking` / `streaming` / `finalizing`？

6. durable log 的刷新路径可能污染了聊天主链路。
   - recent runs / selected run / timeline 这些状态，是否不应该继续影响 chat 主区域的最终收口？

7. 数据库写入/持久化节奏可能不合理。
   - 从代码看，`packages/runtime-pi/src/runtime.ts` 当前对 `message_update` 仍会追加 `run_event`。
   - 我们怀疑这会导致高频写库和 assistant 文本结束后的 durable tail。
   - 请判断：
     - 这是否是不合理的写入策略？
     - 最佳实践是不是不应在每次 `message_update` 都做 durable write？
     - live path / durable path / background-debug path 是否应该彻底拆开？

8. 数据库更新时间 / durable reconcile 时间可能过重。
   - 请从代码静态分析判断：
     - 哪些步骤最可能导致 assistant 结束后仍有明显尾延迟？
     - DB 写入频率、timeline 拉取、run 状态补齐、最终 reload，各自可能贡献多大问题？

9. 当前页面虽然叫 playground，但这不是理由。
   - 请明确判断：当前设计是否仍然把这个页面当成“runtime 验证台 / 调试面板”，而不是“聊天产品页面”？
   - 如果是，这个偏差主要体现在哪些代码结构上？

## 你需要重点回答的问题
1. 当前这套聊天链路，最核心的 1 个主因和 2~4 个次因分别是什么？
2. 当前代码里，哪些地方是“补丁式状态拼接”，哪些地方是“真正应该保留的 durable 能力”？
3. 对一个带 durable log 的聊天产品，最合理的状态分层应该是什么？
   - 例如是否应该拆成：
     - live UI path
     - durable projection path
     - background/debug path
4. assistant 文本结束后，哪些 UI 应该立刻恢复？
   - loading
   - input 可编辑状态
   - send/operator
   - message actions
   - recent runs / timeline
5. `sendMessage()` 的结束路径应该怎么改，才能不再依赖“整页式 reload/reconcile”？
6. `loadThreadMessages()` 应该如何拆分？
7. `message_update` 的 durable 策略最佳实践应该是什么？
8. 从静态代码看，是否还有我们没有明确指出、但你认为也很不合理的设计点？

## Required Output
请按以下结构输出，不要跳步：

1. Root Cause Model
   - 1 个主因
   - 2~4 个次因
   - 每个点都要带证据链（引用 bundle 中的 repo-relative 文件路径）

2. Unreasonable Inventory
   - 请列一个清单，按严重程度排序
   - 每项说明：
     - 现象
     - 结构原因
     - 是否会继续制造新 patch

3. Option Comparison
   - Option A：最小改动止血
   - Option B：中等重构，收敛聊天主链路
   - Option C：按聊天产品重新分层
   - 比较每个方案的收益、代价、风险、落地顺序

4. Recommended Target Design
   - 请给出你推荐的目标架构
   - 特别说明：
     - live assistant 应如何建模
     - persisted assistant 应如何落地
     - `text_end`、`run.completed`、timeline refresh 分别应该控制什么
     - input / loading / operator / message actions 应该由哪些状态驱动

5. Migration Plan
   - 按提交粒度给一个渐进式迁移计划
   - 每一步尽量说明：
     - 改哪些文件
     - 消除哪个不合理点
     - 验收时应该观察到什么变化

6. Assertion Matrix
   - 请给出可观察验收标准，例如：
     - assistant 文本停止增长后，底部 loading 应立即消失
     - assistant 文本结束后，message actions 不应再等待一次全量 reconcile
     - 切 thread 的加载逻辑不应再被发送收尾复用
     - durable log 的补齐不应阻塞 chat 主区域恢复

7. Additional Risks / Hidden Problems
   - 请主动指出你认为当前 bundle 里还隐藏着哪些我们尚未明确说出的不合理之处

## 特别提醒
- 这是给 WebGPT 的静态分析任务，不是让你直接输出 patch。
- 我们更关心：**这套聊天链路应该怎么重构才像真正聊天产品**。
- 如果你认为某些 durable 设计本身没有错，但被错误地接到了 chat 主链路上，也请明确指出。
