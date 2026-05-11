# Playground Search / Browse Policy 模型说明

这份说明定义 `apps/playground-fastify-server` 与 `apps/playground-vite-web`
当前采用的 **search planner + openUrl 业务规则**。

它记录长期事实和边界，不是某一次任务的执行说明。

## 当前状态

playground 当前支持对启用了网页搜索的 run 增加一层 host-level search planner。

它的目标不是让模型“少搜一点”，而是把：

- 模型提出工具调用
- 工具真正执行

明确分开，并在真正执行前通过业务层 policy gate 做预算、阶段和去重控制。

当前流程已经从“连续近义 `searchWeb` 重搜”收敛为：

- 搜索候选来源
- 浏览少量具体页面
- 基于现有证据回答

## 核心边界

### 1. 这是一项 host / consumer 业务能力，不是 shared infra 默认行为

shared infra 继续只提供：

- tool execution 基础能力
- run / thread 生命周期能力
- transcript / tool-part 基础承载

它不默认规定：

- 搜索预算
- 搜索后何时转入浏览
- 是否启用 `openUrl`

这些规则属于：

- `apps/playground-fastify-server`
- `apps/playground-vite-web`

的业务层决策。

### 2. 模型可以请求工具，但工具是否真正执行由 policy gate 决定

当前 playground 不允许模型直接执行裸 `searchWeb`。

模型仍然可以提出 tool call，但 host/runtime 会在执行前根据 run state 判断：

- 当前 phase
- 剩余预算
- query / url 是否重复

然后决定：

- `allow`
- `block`
- `redirect`

### 3. phase 由 controller 派生，不由模型自己决定

当前 search planner 固定使用：

- `search`
- `browse`
- `answer`

三种 phase。

phase 不是模型口头声明出来的，而是由 controller 根据当前 run state 自动派生。

## Planner State

当前每个 run 至少维护这些 planner state：

- `phase`
- `mode`
- `searchCalls`
- `openUrlCalls`
- `normalizedQueries`
- `openedUrls`
- `openedDomains`
- `latestSearchResults`
- `consecutivePolicyBlocks`

这些 state 只属于 host/runtime 内部策略，不会作为新的 durable contract 向外暴露。

## 模式与预算

当前第一版预算只来自 `/new` 双模式：

- `快速模式` -> `quick`
- `专家模式` -> `expert`

固定预算为：

- `quick`
  - `maxSearchCalls = 1`
  - `maxOpenUrlCalls = 2`
- `expert`
  - `maxSearchCalls = 2`
  - `maxOpenUrlCalls = 3`

当前不支持：

- 批量 queries
- 让模型自行提升预算

## `searchWeb` 规则

### 1. 第一版仍然是单 query

当前 `searchWeb` 仍然只接受：

- `query: string`

不支持：

- `queries: string[]`

### 2. query 会先做 normalize / dedupe

当前第一版至少会处理：

- 引号清理
- 多空格折叠
- 弱修饰词清理

弱修饰词包括这类词：

- `人物介绍`
- `详细`
- `故事`
- `登场`
- `角色`

如果新的 query 与历史 query 高度重复，则不会继续执行真实搜索。

### 3. 搜索结果会先做候选聚合

当前 `searchWeb` 结果在进入下一步前会先做：

- URL normalize
- 去重
- 同域名限制
- rule-based 候选排序

其目的是生成少量高价值候选页面，供后续 `openUrl` 使用。

## `openUrl` 规则

### 1. 第一版只做轻量页面读取

当前 `openUrl` 的目标是：

- 打开一个具体 URL
- 提取页面标题
- 提取站点名
- 提取正文文本
- 返回内容质量标记

### 2. 第一版不做重浏览器 fallback

当前明确不包含：

- Playwright fallback
- 点击、截图、滚动、表单交互

也就是说，`openUrl` 当前是一个轻量网页读取工具，而不是 browser agent。

### 3. `openUrl` 也受 budget 和重复控制

当前会检查：

- `openUrl` budget 是否超限
- URL 是否重复
- domain 是否重复
- 当前 phase 是否允许 browse

## 结构化 Policy Result

当前当 policy 阻止工具执行时，不返回普通 `error`，而返回结构化 policy result。

当前显式区分：

- `blocked_by_policy`
- `redirected_by_policy`

其中：

- `blocked_by_policy`
  - 包含 `reason`
  - 包含 `message`
  - 包含 `allowedNextTools`
  - 包含 `remainingBudget`
- `redirected_by_policy`
  - 包含 `message`
  - 包含 `suggestedToolCall`
  - 包含 `remainingBudget`

它们的语义不是“工具坏了”，而是：

- runtime 策略不允许这样执行
- 或当前应该进入下一阶段

## 前端展示边界

### 1. 前端默认展示聚合摘要，而不是平铺每一次工具调用

当前 transcript 默认收敛成：

- `搜索到 N 个网页`
- `浏览 M 个页面`

必要时可展开查看：

- query 明细
- 页面标题 / 站点明细
- policy 收敛提示

### 2. 前端不会为了这件事扩新的流式事件协议

当前前端继续消费现有 transcript / tool-part 数据形态，并在 consumer 层完成聚合展示。

它不引入新的：

- tool progress event stream
- planner-specific durable schema

### 3. live 搜索状态与完成摘要必须分离

当前前端区分：

- live 进行中的搜索/浏览状态
- 已完成的搜索/浏览摘要

完成态不会继续残留“正在搜索”提示。

## 非目标

当前这套模型明确不包含：

- shared infra 默认 search planner
- Playwright / browser fallback
- 批量 multi-query `searchWeb`
- 复杂 query rewrite
- 逐字/逐步推送 planner 阶段事件
- 通用 browser-agent 能力
