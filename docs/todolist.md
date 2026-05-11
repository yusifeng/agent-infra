# Search Planner + openUrl Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] 当前 `playground` 的搜索能力只有 `searchWeb`，没有“读取具体页面正文”的配套工具。
- [x] 当前模型可以连续提出多个近义 `searchWeb` tool call，而 host/runtime 侧没有业务预算和阶段约束。
- [x] 这会导致一个简单人物介绍问题在单个 run 内触发多次近义搜索，成本高且交互噪音大。
- [x] 这条能力属于 `playground-fastify-server + playground-vite-web` 的业务编排层，不应作为 shared infra 默认行为。
- [x] shared infra 只需要继续提供已有的 tool execution / thread / run 基础能力，不需要默认内置“自动搜索规划”策略。
- [x] 第一版不考虑更重的 Playwright / browser fallback，只做 `searchWeb` 预算控制和轻量 `openUrl`。

### 0.2 Goals
- [ ] 为每个 run 增加 host-level search planner / policy gate，控制 `searchWeb` 与 `openUrl` 的执行预算。
- [ ] 将“模型提出 tool call”和“工具真正执行”分离：工具执行前必须经过 host/runtime policy 检查。
- [ ] 在不扩展复杂浏览器能力的前提下，新增轻量 `openUrl` 工具，用于读取具体页面正文。
- [ ] 让 planner 的 phase 由 controller 根据 run state 自动派生，而不是让模型自己决定是否继续 search / browse / answer。
- [ ] 当 policy 阻止工具调用时，返回结构化 policy result，而不是普通 error。
- [ ] 前端聚合展示搜索与浏览过程，避免一长串重复的“已搜索 / 已阅读 10 个网页”块。

### 0.3 Non-goals
- [x] 不做 Playwright / headless browser fallback。
- [x] 不做 `searchWeb({ queries: string[] })` 这类批量 query 接口；第一版保持单 query。
- [x] 不做复杂 query rewrite；第一版先支持 `allow / block / redirect`。
- [x] 不把 search planner 作为 shared packages 的默认通用能力。
- [x] 不做新的流式事件协议来逐步推送 planner 状态。
- [x] 不做通用网页点击、截图、表单交互等 browser-agent 行为。

## 1. Definitions First

### 1.1 Source of Truth
- [x] 对齐现有 [playground-chat-mode-model.md](/Users/david/Documents/github/agent-infra/docs/source-of-truth/playground-chat-mode-model.md)，确认快速/专家模式是第一版 budget 的唯一来源。
- [x] 对齐现有 [answer-container-model.md](/Users/david/Documents/github/agent-infra/docs/source-of-truth/answer-container-model.md) 和 [content-node-model.md](/Users/david/Documents/github/agent-infra/docs/source-of-truth/content-node-model.md)，避免前端工具聚合展示再造并行概念。
- [ ] 这轮先把 planner / `openUrl` 规则写在 todo 里；如果行为稳定，再提升为新的 source-of-truth 文档。

### 1.2 Data model
- [x] 定义 `SearchPhase = 'search' | 'browse' | 'answer'`。
- [x] 定义 `RunSearchPlannerState`，至少包含：
  - `phase`
  - `mode: 'quick' | 'expert'`
  - `searchCalls`
  - `openUrlCalls`
  - `normalizedQueries`
  - `openedUrls`
  - `openedDomains`
  - `latestSearchResults`
  - `consecutivePolicyBlocks`
- [x] 定义 `SearchCandidate`，至少包含：
  - `url`
  - `title`
  - `snippet`
  - `domain`
- [x] 定义 `RemainingBudget`，用于返回给模型和 UI：
  - `searchWeb`
  - `openUrl`

### 1.3 Types / Interfaces
- [x] 定义 `PolicyDecision`，第一版只支持：
  - `allow`
  - `block`
  - `redirect`
- [x] 定义结构化 `PolicyToolResult`，显式区分：
  - `blocked_by_policy`
  - `redirected_by_policy`
- [x] 明确 `blocked_by_policy` 不使用普通 `error` 字段，而是包含：
  - `reason`
  - `message`
  - `allowedNextTools`
  - `remainingBudget`
- [x] 明确 `redirected_by_policy` 包含：
  - `message`
  - `suggestedToolCall`
  - `remainingBudget`
- [x] 定义 `OpenUrlInput`：
  - `url`
  - `maxChars?`
- [x] 定义 `OpenUrlResult`：
  - `url`
  - `finalUrl`
  - `title`
  - `siteName?`
  - `contentText`
  - `contentQuality`
- [x] 明确第一版 budget：
  - `quick`: `maxSearchCalls = 1`, `maxOpenUrlCalls = 2`
  - `expert`: `maxSearchCalls = 2`, `maxOpenUrlCalls = 3`
- [x] 明确第一版 query 仍为单字符串 `query: string`，不做多 query 批量搜索。

## 2. Backend / Platform

### 2.1 Planner / Policy Gate
- [x] 在 host/runtime 执行层增加 tool execution gate，不允许模型直接执行裸 `searchWeb`。
- [x] 在每个 run 内维护 `RunSearchPlannerState`。
- [x] 实现 `derivePhase(runState)`，由 controller 自动派生 `search / browse / answer`。
- [x] 在执行 `searchWeb` 前检查：
  - budget 是否超限
  - query 是否和历史 query 高度重复
  - 当前 phase 是否仍允许 search
- [ ] 在执行 `openUrl` 前检查：
  - budget 是否超限
  - url/domain 是否重复
  - 当前 phase 是否允许 browse
- [x] 连续 policy block 达到阈值后，强制进入 `answer` 倾向，避免死循环重试。

### 2.2 searchWeb 收敛策略
- [ ] 增加 query normalize / dedupe 逻辑，先用规则法，不上 embedding。
- [ ] 定义“近义 query”第一版规则，至少覆盖：
  - 引号清理
  - 多空格折叠
  - 弱修饰词清理（如“人物介绍 / 详细 / 故事 / 登场 / 角色”）
- [ ] 对重复/近重复 query 返回 `blocked_by_policy`，而不是继续真正搜索。

### 2.3 openUrl 工具
- [ ] 新增轻量 `openUrl` 工具能力。
- [ ] 第一版使用 HTTP fetch + 正文抽取，不引入 Playwright。
- [ ] 从页面中提取：
  - 标题
  - 站点名（如果容易拿到）
  - 正文文本
  - 质量标记
- [ ] 对明显失败或正文过短的页面返回 `contentQuality = 'failed' | 'partial'`。

### 2.4 Search Result Aggregation
- [ ] 对 `searchWeb` 返回结果做 URL normalize / 去重。
- [ ] 限制同域名候选数量，避免百科镜像/重复域名挤满结果。
- [ ] 生成推荐 `openUrl` 候选列表，供 policy redirect 或模型下一步使用。
- [ ] 第一版使用 rule-based 排序，不做额外 reranker 模型。

### 2.5 Contracts / Routes / Integration Points
- [ ] 确认这些 planner / policy 结构是否仅停留在 host/runtime 内部，避免不必要地抬升到 shared `contracts`。
- [ ] 只有在前端确实需要读到结构化聚合结果时，才补最小 contract surface。
- [ ] 明确 `searchWeb` 与 `openUrl` 的 tool result 如何回喂模型，不新增流式事件协议。

## 3. Frontend Boundary

### 3.1 Schema / Repo
- [ ] 明确前端需要消费的是“聚合后的搜索/浏览展示模型”，不是原始海量 tool call 平铺。
- [ ] 如果后端需要新增最小响应字段，先在 repo 层做类型收敛，不让 UI 直接碰裸 payload。

### 3.2 Service / Runtime
- [ ] 定义搜索/浏览聚合展示的前端 view model。
- [ ] 明确一个 run 内如何把多次 `searchWeb` 和 `openUrl` 折叠成：
  - `已搜索 N 个网页`
  - `已浏览 M 个页面`
- [ ] 保留展开查看细项的能力，但默认只展示聚合摘要。
- [ ] 避免再次把一长串重复 `已思考 / 已阅读 10 个网页` 直接平铺。

### 3.3 UI
- [ ] 调整 transcript 中 search / browse 的展示结构，尽量贴近“先搜索、再浏览、再回答”的编排感。
- [ ] 搜索摘要里支持展示 query 列表，但默认折叠。
- [ ] 浏览摘要里支持展示已打开页面标题 / 站点，但默认折叠。

## 4. Tests

### 4.1 Backend / Runtime Tests
- [x] `derivePhase()` 在不同 run state 下能正确返回 `search / browse / answer`。
- [x] `searchWeb` 超预算时返回 `blocked_by_policy`。
- [x] 近重复 query 会被拦截，不执行真实搜索。
- [x] 搜索后如果已有候选结果，再次 search 会触发 `redirect` 或 `block`，而不是继续无条件搜索。
- [ ] `openUrl` 超预算时返回 `blocked_by_policy`。
- [ ] 连续 policy block 达阈值后会进入 `answer` 倾向。
- [ ] `openUrl` 能正确返回正文文本和质量标记。

### 4.2 Frontend Tests
- [ ] 聚合展示模型能把多个 search / browse tool 结果收敛成摘要块。
- [ ] 默认展示不再平铺大量重复搜索块。
- [ ] 展开细项后能看到 query / 页面标题等明细。
- [ ] 不因聚合展示破坏现有 transcript / answer container 行为。

## 5. Recommended Execution Order

### Loop 1
- [x] 定义 `SearchPhase`、`RunSearchPlannerState`、`PolicyDecision`、`PolicyToolResult`、`OpenUrlInput/Result`。
- [x] 写 focused tests，先把 phase / budget / policy 结构定死。

### Loop 2
- [x] 在 host/runtime 落 tool execution gate。
- [x] 接入 `searchWeb` budget、query dedupe、phase 派生。
- [x] 让 `searchWeb` 先支持 `allow / block / redirect`。

### Loop 3
- [ ] 实现轻量 `openUrl`。
- [ ] 接上搜索结果聚合、候选 URL 选择和浏览预算控制。
- [ ] 跑 targeted tests、review、提交。

### Loop 4
- [ ] 做前端聚合展示，而不是平铺原始工具调用。
- [ ] 跑 targeted tests、review、提交。

### Loop 5
- [ ] 把稳定事实提升到 `docs/source-of-truth/*`。
- [ ] 删除 `docs/todolist.md`，避免留下平行定义。
