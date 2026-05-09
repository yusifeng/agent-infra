# Playground Thread Catalog Todo

## 完成状态

这轮工作已经完成，以下清单全部落地并验证通过。

## 0. 背景与边界

### 0.1 已确认事实
- [x] `pin` 继续作为宿主侧业务能力存在，没有提升到共享 `packages/core`、`packages/app`、`packages/db` 或 `packages/contracts`。
- [x] 之前的 checkpoint commit 已经把 `pin` 处理收口到 `apps/playground-fastify-server` 和 `apps/playground-vite-web`。
- [x] 宿主侧已经用 DB-backed 的 thread catalog 替换了 JSON-backed 的临时 `thread-pins.ts` 实现。
- [x] 前端继续消费 app-local thread DTO，没有要求共享 `ThreadDto` 增加 `pinned` 字段。
- [x] 这次任务保持了共享 durable primitives 不变，同时把宿主侧 thread catalog 模式正式化。
- [x] v1 的 current-user 策略采用固定的 `local-dev-user`。

### 0.2 目标
- [x] 用 DB-backed 的宿主自有 thread catalog 表替换了 `playground-fastify-server` 中 JSON-backed 的 `pin` 持久化。
- [x] 建立了清晰的宿主侧 thread catalog 模块边界，包括 repo、service、projection 和 current-user lookup。
- [x] 返回了宿主专用的 `PlaygroundThreadDto`，包含 `pinned` 和 `pinnedAt`。
- [x] 保持了 route handler 轻量，把宿主业务逻辑从 route-local helper 中移出。
- [x] 保持了当前平台边界：没有新增共享 pin repo、没有新增共享 `ThreadDto.pinned`、没有新增共享 pin app methods。

### 0.3 非目标
- [x] 不把 `pin` 提升到共享平台包。
- [x] 这次任务不引入通用 extension framework 或可复用 extension kit。
- [x] 这次任务不解决完整登录/认证系统。
- [x] 这次任务不加入 labels、favorites、hidden flags 或其它未来业务能力。
- [x] 这次任务不重新设计 `agent-infra` 里共享 durable thread ownership 语义。

## 1. 先定义，再实现

### 1.1 Source of Truth
- [x] 实现与 [`docs/architecture.md`](/Users/david/Documents/github/agent-infra/docs/architecture.md) 中已有的平台边界保持一致。
- [x] 判断后暂不新增长期 source-of-truth 文档；当前模式先保留在实现与这份完成清单中。
- [x] 在模式验证前，这份 todo 承担了工作真相记录的作用；完成后保留为收尾记录。

### 1.2 数据模型
- [x] 明确并实现了宿主自有表 `playground_thread_catalog` 的结构：
  - `thread_id`
  - `app_id`
  - `owner_user_id`
  - `pinned_at`
  - `created_at`
  - `updated_at`
- [x] 在 Fastify host 中实现了这张表的 SQL/Drizzle 结构，并且没有把它放进共享 `packages/db` schema。
- [x] 落实了所需索引：
  - `thread_id` 主键
  - `(app_id, owner_user_id)` 查询索引
  - `(app_id, owner_user_id, pinned_at)` 查询/排序索引
- [x] 落实了 invariant：每一个对用户可见的 playground thread 都有且只有一条 catalog row。
- [x] 落实了缺失 catalog row、孤儿 catalog row 在读取和迁移阶段的处理方式：
  - 启动时 backfill 旧 thread
  - list 只投影同时存在 durable thread 与 catalog row 的 active thread
  - access path 对缺失或不匹配的 catalog row 返回 not found

### 1.3 类型 / 接口
- [x] 定义了 app-local DTO：`PlaygroundThreadDto`
  - 以共享 `ThreadDto` 形状为基础
  - `pinned: boolean`
  - `pinnedAt: string | null`
- [x] 现有前端 app-local 类型已经从 `DurableThreadDto` 重命名为 `PlaygroundThreadDto`，边界更清晰。
- [x] 定义了宿主侧 projection contract：从 durable thread + catalog row 投影出 `PlaygroundThreadDto`。
- [x] 定义了临时 host identity contract，用来解析 `local-dev-user`。

## 2. 后端 / 宿主实现

### 2.1 Host DB 与 bootstrap
- [x] Fastify host 已在宿主侧 bootstrap `playground_thread_catalog` schema，没有把它推入共享 `packages/db`。
- [x] 宿主侧 schema 创建 / bootstrap 已覆盖本地 SQLite，并保留与其余 DB 模式兼容的执行路径。
- [x] prepared server startup flow 会一并 bootstrap 这张宿主表。

### 2.2 Host repo / service 结构
- [x] 已在以下目录下建立宿主侧 feature/module 边界：
  - `apps/playground-fastify-server/src/features/thread-catalog/`
- [x] 已新增 catalog repo，只负责 DB access。
- [x] 已新增 catalog service，负责：
  - 创建 catalog row
  - 校验 owner visibility
  - pin
  - unpin
  - archive 相关清理
  - 为当前用户列出 catalog rows
- [x] 已新增 current-user helper，在 v1 中返回 `local-dev-user`。
- [x] 已移除 JSON-backed 的临时实现 [`thread-pins.ts`](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/thread-pins.ts)。

### 2.3 Host route 组合
- [x] 创建 thread 的流程已经同时创建：
  - durable thread
  - 对应的 catalog row
- [x] thread list 流程已经以 catalog rows 作为用户可见 threads 的入口。
- [x] pin/unpin routes 已通过 catalog service 完成操作。
- [x] archive 流程会清理 `pinned_at`，并确保 archived threads 不再进入 active list projection。
- [x] route handlers 继续作为 composition roots，而不是承载内联业务逻辑。

### 2.4 Projection
- [x] 已新增专门的 projection helper，用于：
  - 单条 thread response
  - thread list response
- [x] projection 负责计算：
  - `pinned`
  - `pinnedAt`
- [x] list projection 已落实排序：
  - pinned 优先
  - `pinned_at desc`
  - 然后 `thread.updatedAt desc`

## 3. 前端边界

### 3.1 Schema 与 repo
- [x] 前端 app-local normalization 已支持 `pinnedAt`。
- [x] 共享 `durable-chat-client` contracts 保持不变。
- [x] `/api/threads` 和 pin/unpin response 已作为宿主 DTO payload 消费，而不是 shared contract payload。

### 3.2 Runtime 与 service
- [x] thread list presentation/runtime 逻辑已经优先使用显式 `pinnedAt` 语义，不再依赖隐式数组顺序。
- [x] 当前 sidebar 的 pinned-first 行为保持不变。
- [x] 当前 archive/pin/unpin 的交互行为保持不变，同时已经切换到 catalog-backed responses。

### 3.3 UI
- [x] 当前 sidebar / UI 行为保持稳定。
- [x] 这次任务没有扩展成视觉重设计。

## 4. 测试

### 4.1 后端测试
- [x] Fastify host 测试已经覆盖：
  - 创建 thread 会创建 catalog row
  - list 通过 catalog rows 读取当前用户可见 threads
  - pin 会设置 `pinned_at`
  - unpin 会清空 `pinned_at`
  - archive 会清空 `pinned_at`
  - archived threads 不会重新出现在 active list 中
  - foreign app 的访问会被正确拒绝
  - 旧 thread 在 bootstrap 后会被 backfill 进入 catalog

### 4.2 前端测试
- [x] app-local schema tests 已更新，覆盖 `pinnedAt`。
- [x] 排序逻辑切换到显式 `pinnedAt` 后，runtime/service tests 已同步通过。
- [x] sidebar 行为测试在新的 projected DTO 形状下继续通过。

### 4.3 验证
- [x] 运行 `pnpm --filter playground-fastify-server test`
- [x] 运行 `pnpm --filter playground-vite-web test`
- [x] 运行 `pnpm typecheck`
- [x] 运行 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`

## 5. 推荐执行顺序

### Loop 1
- [x] 在本地类型和代码中明确了 host table 结构与 invariants。
- [x] 实现了 host 侧 current-user 解析，固定为 `local-dev-user`。
- [x] 实现了 `playground_thread_catalog` 的宿主侧 schema / bootstrap。

### Loop 2
- [x] 实现了 host catalog repo 和 service。
- [x] 用 DB-backed 的 catalog 持久化替换了 JSON-backed 的 pin 持久化。
- [x] 测试重点覆盖了后端行为和 ownership/catalog invariants。

### Loop 3
- [x] route flows 已改为使用 catalog service 和专门的 DTO projection。
- [x] host response 已返回 `pinned` 和 `pinnedAt`。
- [x] 后端测试已完整验证 archive/pin/unpin/list/backfill 行为。

### Loop 4
- [x] 前端 app-local DTO normalization 和 runtime 排序逻辑已支持 `pinnedAt`。
- [x] 已运行定向前端测试和 typecheck。
- [x] 已运行 codex review，并清除了 review 暴露出的 legacy backfill 问题。
