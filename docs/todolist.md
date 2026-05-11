# Playground Fastify Env / DB Mode 收敛 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] 当前 `playground-fastify-server` 会默认读取：
  - `apps/playground-fastify-server/.env*`
  - repo root `.env*`
  - `apps/playground-next-web/.env*`
- [x] 这种跨 app fallback 已经导致实际 DB 来源和用户预期混乱。
- [x] `packages/db` 里的 `createDbConfigFromEnv()` 才是真实 DB 选择器。
- [x] `apps/playground-fastify-server/src/playground-meta.ts` 里的 `getPlaygroundDbInfo()` 当前会自己猜 `dbMode/dbConnection`，和真实 DB 选择有分叉。
- [x] 已确认的新边界是：
  - `playground-fastify-server` **禁止默认跨项目读取** `apps/playground-next-web/.env*`

### 0.2 Goals
- [ ] 让 `playground-fastify-server` 默认只读取自己的 `.env*`，不再默认 fallback 到 `apps/playground-next-web/.env*`
- [ ] 保持 DB 选择规则清晰且可预测，避免 sqlite / turso / postgres 串线
- [ ] 让 `/api/meta` 报告的 `dbMode/dbConnection` 与真实运行中的 `DbConfig` 一致
- [ ] 让 prepared scripts 成为明确、可靠的推荐启动入口
- [ ] 为开发和生产切换补一份稳定文档，描述 env 加载边界和 DB mode 选择规则

### 0.3 Non-goals
- [x] 不做 auth 逻辑改造
- [x] 不做 sqlite / turso 数据迁移
- [x] 不重做 `playground-next-web` 自身的 env 体系
- [x] 不引入通用配置中心或 secret 平台
- [x] 不在这次任务里扩展到所有 app 的统一 env 框架

## 1. Definitions First

### 1.1 Source of truth
- [ ] 新增一份稳定文档，定义：
  - `playground-fastify-server` 的 env 搜索边界
  - DB mode 强制规则
  - `/api/meta` 的 `dbInfo` 语义
- [ ] 不把这次规则只留在 README 或临时执行说明里

### 1.2 Env loading rules
- [x] 明确 `playground-fastify-server` 默认 env 来源应为：
  - `apps/playground-fastify-server/.env*`
  - 可选 repo root `.env*`
- [x] 明确 `apps/playground-next-web/.env*` 不再作为 Fastify 默认 fallback
- [ ] 决定 repo root `.env*` 是否继续保留为默认来源
  - 当前建议：保留，但优先级低于 Fastify app 自身 `.env*`

### 1.3 DB selection rules
- [x] 明确 `PLAYGROUND_DB_MODE` 一旦存在，就是绝对强制
- [x] 当 `PLAYGROUND_DB_MODE=sqlite` 时，即使存在 Turso / Postgres 变量，也必须走 sqlite
- [x] 当 `PLAYGROUND_DB_MODE=turso|postgres` 时，同理必须严格走指定模式
- [ ] 明确 prepared scripts 是推荐入口，裸 `dev` / `start` 仅保留给高级调试

### 1.4 Meta/reporting rules
- [x] `/api/meta` 的 `dbMode/dbConnection` 必须来自真实 `DbConfig`
- [x] 禁止 `playground-meta.ts` 再自己按 env 猜测数据库模式

## 2. Implementation Slices

### 2.1 Env loader boundary
- [x] 修改 [env.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/env.ts)
- [x] 从默认搜索路径里移除 `apps/playground-next-web`
- [x] 当前不保留默认兼容开关，先以禁止隐式 fallback 为新边界
- [x] 为 env loader 补 focused tests，证明默认不会跨 app 读取

### 2.2 DB mode and reporting consistency
- [x] 保持 [packages/db/src/client.ts](/Users/david/Documents/github/agent-infra/packages/db/src/client.ts) 为唯一 DB 选择事实源
- [x] 修改 [playground-meta.ts](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/playground-meta.ts)，让 `dbInfo` 复用真实 `DbConfig`
- [x] 为 `/api/meta` 补 focused tests，验证报告结果与真实 DB 选择一致

### 2.3 Startup clarity
- [ ] 在 Fastify 启动 / bootstrap 时输出明确的 resolved summary：
  - loaded env files
  - db mode
  - db connection string/path
  - whether mode was forced
- [ ] 确保开发期不必靠猜或手查 `/api/meta` 才知道当前连的是谁

### 2.4 Scripts and docs
- [ ] 复核 [package.json](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/package.json) 中 dev/start 脚本的推荐路径说明
- [ ] 更新 [README.md](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/README.md)
- [ ] 更新相关 runbook / source-of-truth

## 3. Tests

### 3.1 Env / DB selection
- [x] `PLAYGROUND_DB_MODE=sqlite` + Turso env 共存时，仍然选择 sqlite
- [x] `PLAYGROUND_DB_MODE=turso` + sqlite env 共存时，仍然选择 turso
- [x] `PLAYGROUND_DB_MODE=postgres` 同理

### 3.2 Env loader
- [x] 默认不再读取 `apps/playground-next-web/.env*`
- [ ] 如果保留显式兼容开关，验证只有开启时才读取

### 3.3 Meta consistency
- [x] `/api/meta` 返回的 `dbMode/dbConnection` 与真实 `DbConfig` 一致
- [x] 不再出现“实际 sqlite 但 meta 显示 turso”这种误报

## 4. Recommended Execution Order

### Loop 1
- [x] 收紧 env loader 边界，移除默认 next-web fallback
- [x] 补 env loader focused tests
- [x] 跑 targeted verification
- [x] 运行 `codex review`

### Loop 2
- [x] 收敛 `/api/meta` 的 `dbInfo` 到真实 `DbConfig`
- [x] 补 DB mode / meta consistency tests
- [x] 跑 targeted verification
- [x] 运行 `codex review`

### Loop 3
- [ ] 增加启动期 resolved summary / 可观测性
- [ ] 更新 README / source-of-truth
- [ ] 删除本 todo
