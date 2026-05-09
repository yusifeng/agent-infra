# Playground Fastify/Vite Auth Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] 本次任务只覆盖 [`apps/playground-fastify-server`](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server) 和 [`apps/playground-vite-web`](/Users/david/Documents/github/agent-infra/apps/playground-vite-web)。
- [x] auth 是宿主侧能力，不引入到共享 `packages/*`，并保持与 [`docs/architecture.md`](/Users/david/Documents/github/agent-infra/docs/architecture.md) 的平台边界一致。
- [x] `threads.userId` 不作为真实 ownership 语义使用，当前实现也仍然写入 `null`。
- [x] thread ownership 继续只使用宿主表 `playground_thread_catalog.owner_user_id`。
- [x] 当前 `current-user` 仍然是固定 `local-dev-user`，需要替换为真实 session user。
- [x] 现有 Vite 客户端已经统一通过相对 `/api` 访问 Fastify host，适合同源 cookie session。
- [x] 认证方案已经确认采用“邮箱验证码注册 + 邮箱/密码登录”。
- [x] 密码不放进 `auth_users`，而是独立建模到 `auth_passwords`。
- [x] 表名不使用 `playground_` 前缀，但保留 `auth_` 命名空间。
- [x] 历史 `local-dev-user` 业务数据无关紧要，这次任务不为其保留兼容迁移逻辑。

### 0.2 Goals
- [x] 为 Fastify host 增加宿主侧 auth schema、repo、service、route 和 session 解析。
- [ ] 支持邮箱注册验证码发送、邮箱验证码注册、邮箱/密码登录、当前用户查询、登出。
- [x] 将 thread routes 从固定 `local-dev-user` 切换为 request-scoped 的真实 auth user。
- [x] 让未登录用户无法访问需要 ownership 的 thread API。
- [x] 让新建 thread 的 `playground_thread_catalog.owner_user_id` 写入真实 `auth_users.id`。
- [ ] 为 Vite consumer 增加 `/login`、`/register` 与 auth gate，接上新的 `/api/auth/*`。

### 0.3 Non-goals
- [x] 不把 auth user、identity、session、password 模型提升到 `packages/core`、`packages/contracts`、`packages/db` 或 `packages/app`。
- [x] 这次任务不改造 `threads.userId` 语义，也不把它接入 auth。
- [x] 这次任务不实现忘记密码、重置密码、修改密码。
- [x] 这次任务不实现短信登录、OAuth、magic link。
- [x] 这次任务不实现邀请码校验逻辑，也不要求邀请码 UI 继续保留。
- [x] 这次任务不引入 JWT 作为主登录态。
- [x] 这次任务不做设备管理、登录告警、异常风控等增强能力。

## 1. Definitions First

### 1.1 Source of Truth
- [x] 当前没有现成的 `docs/source-of-truth/*` 文档定义宿主 auth / identity / session 模型。
- [x] 本轮先把 evolving definitions 保留在这份 todo 中，不先创建新的 source-of-truth 文档。
- [ ] 实现过程中若 auth / identity / session / ownership 关系沉淀为稳定长期事实，再评估是否提炼到 `docs/source-of-truth/*`。
- [ ] 完工后将长期有效的概念事实转移到正式文档，并删除这份临时 todo。

### 1.2 Data model
- [x] 新增宿主表 `auth_users`：
  - `id`
  - `status`
  - `created_at`
  - `last_login_at`
- [x] 新增宿主表 `auth_identities`：
  - `id`
  - `user_id`
  - `identity_type`
  - `identity_value_normalized`
  - `verified_at`
  - `created_at`
- [x] 新增宿主表 `auth_passwords`：
  - `user_id`
  - `password_hash`
  - `password_algo`
  - `created_at`
  - `updated_at`
- [x] 新增宿主表 `auth_email_challenges`：
  - `id`
  - `email_normalized`
  - `purpose`
  - `code_hmac`
  - `expires_at`
  - `consumed_at`
  - `attempt_count`
  - `last_sent_at`
  - `created_at`
- [x] 新增宿主表 `auth_sessions`：
  - `id`
  - `user_id`
  - `token_hash`
  - `expires_at`
  - `revoked_at`
  - `created_at`
  - `updated_at`
  - 可选 `ip_address`
  - 可选 `user_agent`
- [x] 为 `auth_identities(identity_type, identity_value_normalized)` 建立唯一约束。
- [x] 为 `auth_passwords.user_id` 建立唯一约束。
- [x] 为 `auth_sessions.token_hash` 建立唯一约束。
- [x] 为 `auth_email_challenges` 建立按 `email_normalized / purpose / created_at` 的查询索引。
- [x] 明确邮箱规范化规则只做 `trim + lowercase`，不做 provider-specific 特判。

### 1.3 Types / Interfaces
- [ ] 定义 app-local auth DTO：
  - `AuthUserDto`
  - `AuthMeResponseDto`
  - `AuthRequestSignupCodeResponseDto`
  - `AuthSignUpResponseDto`
  - `AuthSignInResponseDto`
  - `AuthLogoutResponseDto`
- [ ] 定义 app-local auth request payload schema：
  - `request-signup-code`
  - `sign-up`
  - `sign-in`
  - `logout`
- [x] 定义统一 auth error code 集合：
  - `INVALID_EMAIL`
  - `EMAIL_ALREADY_REGISTERED`
  - `INVALID_CODE`
  - `CODE_EXPIRED`
  - `PASSWORD_TOO_SHORT`
  - `INVALID_CREDENTIALS`
  - `RATE_LIMITED`
  - `UNAUTHORIZED`
- [x] 定义 request-scoped `currentUser` 类型，并挂到 Fastify request 上。
- [x] 定义 auth email sender 接口，隔离供应商 SDK。
- [x] 定义 session token 服务接口：
  - 生成原始 token
  - 计算 `token_hash`
  - 校验 cookie token
- [x] 定义 email challenge HMAC 计算接口：
  - 使用服务端 secret
  - 输入包含 `challengeId + email + purpose + code`

## 2. Backend / Host

### 2.1 Host DB and Bootstrap
- [x] 在 Fastify host 侧为 `auth_*` 表补齐 SQLite / Turso / Postgres schema 和 bootstrap 逻辑。
- [x] 保持 auth schema 仅存在于 [`apps/playground-fastify-server`](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server) 宿主侧，不进入共享 `packages/db` schema。
- [x] 将 auth schema bootstrap 纳入现有 prepared startup 流程。

### 2.2 Host repo / service structure
- [x] 新增 `features/auth/identity/normalize-email.ts`。
- [x] 新增 `features/auth/repo/auth-user-repo.ts`。
- [x] 新增 `features/auth/repo/auth-identity-repo.ts`。
- [x] 新增 `features/auth/repo/auth-password-repo.ts`。
- [x] 新增 `features/auth/repo/auth-email-challenge-repo.ts`。
- [x] 新增 `features/auth/repo/auth-session-repo.ts`。
- [x] 新增 `features/auth/service/password-hasher.ts`，使用 `argon2id`。
- [x] 新增 `features/auth/service/session-token.ts`，负责生成原始 token 与 `token_hash`。
- [x] 新增 `features/auth/service/email-challenge-service.ts`，负责验证码生成、HMAC 校验、过期与 attempt 逻辑。
- [x] 新增 `features/auth/service/auth-service.ts`，负责注册、登录、登出、当前用户解析。
- [x] 新增 `features/auth/service/email-sender.ts` 抽象，首个实现默认接 `Resend`。
- [x] 新增 `features/auth/service/origin-check.ts`，对敏感写接口做 `Origin` 校验。

### 2.3 Host auth routes
- [x] 新增 [`apps/playground-fastify-server/src/routes/auth.ts`](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/routes/auth.ts)。
- [x] 实现 `POST /api/auth/email/request-signup-code`。
- [x] 实现 `POST /api/auth/sign-up`。
- [x] 实现 `POST /api/auth/sign-in`。
- [x] 实现 `GET /api/auth/me`。
- [x] 实现 `POST /api/auth/logout`。
- [x] 为 auth 写接口加 rate limit。
- [x] 为 auth 写接口加 `Origin` 校验。
- [x] 为登录错误统一返回 `INVALID_CREDENTIALS`，避免用户枚举。

### 2.4 Cookie and session handling
- [x] 注册 `@fastify/cookie`。
- [x] 开发环境使用 cookie 名 `sid`。
- [x] 生产环境使用 cookie 名 `__Host-sid`。
- [x] cookie 仅存原始 `sessionToken`，数据库仅存 `token_hash`。
- [x] cookie 属性固定为：
  - `HttpOnly`
  - `SameSite=Lax`
  - `Path=/`
  - production `Secure=true`
- [x] `GET /api/auth/me` 每次都从 cookie token -> hash -> `auth_sessions` -> `auth_users` 解析当前用户。
- [x] `logout` 撤销 session 并清 cookie。

### 2.5 Replace current-user and protect thread routes
- [x] 用 request-scoped session user 替换固定 `local-dev-user` 实现。
- [x] 在 thread routes 中读取 `request.currentUser.id`，不再使用进程级固定 helper。
- [x] 未登录访问 thread list/create/messages/pin/archive/run 等 ownership 相关 API 时返回 `401`。
- [x] 创建 thread 时保持 `thread.userId = null`。
- [x] 创建 thread 时写入 `playground_thread_catalog.owner_user_id = auth_users.id`。

## 3. Frontend Boundary

### 3.1 Schema and repo
- [ ] 新增 `features/auth/repo/auth-api.ts`。
- [ ] 为 `/api/auth/*` 建立 app-local schema normalization，不把 auth contract 推进共享 `packages/contracts`。
- [ ] 为 auth API 结果建立稳定错误码到前端文案的映射。

### 3.2 Runtime
- [ ] 新增 `features/auth/runtime/use-auth-state.ts`。
- [ ] 应用启动时先请求 `/api/auth/me`。
- [ ] 建立未登录 / 已登录 / 初始化中三态 auth runtime。
- [ ] 将现有 chat runtime 启动条件改为依赖 auth gate。

### 3.3 UI / route flow
- [ ] 新增 `/login` 页面或等价路由入口。
- [ ] 新增 `/register` 页面或等价路由入口。
- [ ] 注册页支持：
  - 邮箱输入
  - 发送验证码
  - 验证码输入
  - 密码输入
  - 提交注册
- [ ] 登录页支持：
  - 邮箱输入
  - 密码输入
  - 提交登录
- [ ] 未登录访问 chat 路由时重定向 `/login`。
- [ ] 注册成功后跳转 `/new`。
- [ ] 登录成功后跳转 `/new`。
- [ ] 第一阶段不展示邀请码输入 UI。

## 4. Tests

### 4.1 Backend tests
- [x] 覆盖请求注册验证码成功。
- [x] 覆盖已注册邮箱请求注册验证码失败。
- [x] 覆盖 resend cooldown 生效。
- [ ] 覆盖验证码过期失败。
- [ ] 覆盖验证码错误失败。
- [ ] 覆盖验证码 attempt 超限失败。
- [x] 覆盖注册成功会创建 `auth_users / auth_identities / auth_passwords / auth_sessions`。
- [x] 覆盖登录成功会创建 session。
- [x] 覆盖登录失败返回 `INVALID_CREDENTIALS`。
- [x] 覆盖 `/api/auth/me` 已登录返回 user。
- [x] 覆盖 `/api/auth/me` 未登录返回 `user: null`。
- [x] 覆盖登出会撤销 session 并清 cookie。
- [x] 覆盖未登录访问 thread API 返回 `401`。
- [x] 覆盖已登录创建 thread 后 `owner_user_id` 正确写入 auth user id。

### 4.2 Frontend tests
- [ ] 覆盖未登录时 auth gate 跳转 `/login`。
- [ ] 覆盖注册页发送验证码交互。
- [ ] 覆盖注册成功后进入 app。
- [ ] 覆盖登录成功后进入 app。
- [ ] 覆盖登出后回到登录页。

### 4.3 Verification
- [x] 运行 `pnpm --filter playground-fastify-server test`
- [x] 运行 `pnpm --filter playground-fastify-server typecheck`
- [ ] 运行 `pnpm --filter playground-vite-web test`
- [ ] 运行 `pnpm --filter playground-vite-web typecheck`
- [ ] 运行 `pnpm typecheck`
- [x] 运行 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`

## 5. Recommended Execution Order

### Loop 1
- [x] 锁定 auth 表结构、约束、HMAC/token hash 规则。
- [x] 实现 auth schema 与 bootstrap，不改前端。
- [x] 为 session token、验证码 HMAC、密码 hash 建立最小单元测试。

### Loop 2
- [x] 实现 auth repo / service / email sender 抽象。
- [x] 接入 `@fastify/cookie`、`Origin` 校验和 rate limit。
- [x] 实现 `/api/auth/*` 路由并完成后端主链路测试。

### Loop 3
- [x] 将 `current-user` 从固定值切到 request-scoped session user。
- [x] 为 thread routes 增加登录保护。
- [x] 验证已登录用户创建 thread 后 `owner_user_id` 正确写入。

### Loop 4
- [ ] 为 Vite 增加 `/login`、`/register` 和 auth gate。
- [ ] 将 chat 页面接入 `/api/auth/me` 与新的登录流转。
- [ ] 完成前端 auth 交互测试。

### Loop 5
- [ ] 跑完整定向验证与 typecheck。
- [ ] 运行 `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`。
- [ ] 将长期有效的 auth 概念事实整理进正式文档，并删除这份 `docs/todolist.md`。
