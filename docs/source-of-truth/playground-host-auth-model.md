# Playground Host Auth 模型说明

这份说明定义 playground host / consumer 当前采用的 **宿主侧 auth 模型**。

它记录的是长期事实和边界，不是某一次任务的执行步骤。

## 当前状态

playground host auth 当前已经落地，范围固定为：

- playground host 本地 auth schema
- 邮箱验证码注册
- 邮箱 + 密码登录
- 邮箱验证码重置密码
- HttpOnly cookie session
- request-scoped current user
- thread catalog ownership 绑定到宿主 auth user
- playground consumer `/login` / `/register` / `/forgot-password` / auth gate

## 核心边界

### 1. auth 只属于 host，不属于 shared packages

auth user、identity、password、session、email challenge 都只存在于：

- `apps/playground-fastify-server`
- `apps/playground-next-web`
- `apps/playground-vite-web`

它们不会进入：

- `packages/core`
- `packages/contracts`
- `packages/db`
- `packages/app`

这条边界意味着：

- shared infra 不引入通用 `User` 模型
- auth 规则不成为 durable runtime 的一部分
- consumer host 可以继续独立演化自己的登录方式

### 2. durable `threads.userId` 不是 playground auth 的 ownership 来源

当前 playground auth 不使用 `threads.userId` 表达真实 owner。

durable thread 创建时仍然保持：

- `threads.userId = null`

### 3. thread ownership 继续只使用 host catalog

playground 的真实 ownership 由宿主表维护：

- `playground_thread_catalog.owner_user_id`

当已登录用户创建 thread 时：

- `owner_user_id = auth_users.id`

这意味着：

- thread 可见性是 host-local 规则
- ownership 不回写到 shared durable thread schema

### 4. 历史 `local-dev-user` 数据不是兼容目标

接入真实登录后，旧的 `local-dev-user` catalog 数据不再视为需要迁移或兼容的主线数据。

这是一个显式非目标，不应为了这批历史数据污染新的 auth / ownership 规则。

## 登录模型

### 1. 注册

注册流程固定为：

1. 用户输入邮箱
2. 请求注册验证码
3. 服务端生成 `auth_email_challenges`
4. 邮件发送验证码
5. 用户提交邮箱、验证码、密码
6. 服务端创建：
   - `auth_users`
   - `auth_identities`
   - `auth_passwords`
   - `auth_sessions`
7. 注册成功后立即建立登录态

### 2. 登录

登录流程固定为：

1. 用户输入邮箱和密码
2. 服务端按规范化邮箱查找 `auth_identities`
3. 读取 `auth_passwords`
4. 校验密码 hash
5. 创建新的 `auth_sessions`
6. 返回当前用户并写入 cookie

### 3. 第一阶段明确不支持

当前模型明确不支持：

- 短信登录
- OAuth
- magic link
- 修改密码
- 邀请码校验

### 4. 忘记密码 / 重置密码

忘记密码流程固定为：

1. 用户在 `/forgot-password` 输入邮箱
2. 服务端按 `purpose = reset_password` 生成 challenge
3. 邮件发送 6 位重置验证码
4. 用户提交邮箱、验证码、新密码
5. 服务端更新 `auth_passwords`
6. 服务端撤销该用户所有 active session
7. 前端返回 `/login`，用户使用新密码重新登录

请求重置码时：

- 不暴露邮箱是否存在
- 对已注册邮箱和未注册邮箱都返回统一成功响应

重置成功后：

- 不自动登录
- 旧 session 应全部失效

## 持久化模型

当前 auth 使用以下宿主表：

- `auth_users`
- `auth_identities`
- `auth_passwords`
- `auth_email_challenges`
- `auth_sessions`

### `auth_users`

表示宿主侧用户主体。

### `auth_identities`

表示用户身份标识。

当前第一阶段只使用：

- `identity_type = email`

邮箱规范化规则固定为：

- `trim`
- 全部转小写

不做 provider-specific 规则，例如：

- Gmail 去点
- Gmail 去 plus

### `auth_passwords`

密码不保存在 `auth_users`。

当前模型固定：

- 一个 user 对应一条 password record
- 只保存 password hash
- 不保存明文密码

### `auth_email_challenges`

当前 challenge purpose 固定支持：

- `purpose = sign_up`
- `purpose = reset_password`

当前行为：

- 6 位数字验证码
- 服务端只存 `code_hmac`
- 不存明文 code
- challenge 有过期时间
- challenge 有 attempt count
- challenge 成功消费后不可复用
- 不同 purpose 之间不能复用 challenge

### `auth_sessions`

当前 session 模型固定为：

- cookie 中保存原始 `sessionToken`
- 数据库中只保存 `token_hash`

session 不是 JWT，也不是 stateless cookie session。

## Cookie / Session 模型

### 1. session 载体

当前登录态使用：

- `HttpOnly` cookie
- 服务端 `auth_sessions`

而不是：

- localStorage token
- JWT 作为主登录态

### 2. cookie 命名

当前命名规则：

- 开发环境：`sid`
- 生产环境：`__Host-sid`

### 3. cookie 属性

当前固定为：

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- 生产环境 `Secure=true`

### 4. 当前用户解析

host request 在进入受保护路由前，会按下面顺序解析当前用户：

1. 从 cookie 读取 session token
2. 计算 `token_hash`
3. 查询 `auth_sessions`
4. 验证未过期、未撤销
5. 查询 `auth_users` 与 `auth_identities`
6. 写入 request-scoped `currentUser` 或等价的 host-local 当前用户上下文

## 路由边界

当前 auth host routes 为：

- `POST /api/auth/email/request-signup-code`
- `POST /api/auth/email/request-password-reset-code`
- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### `GET /api/auth/me`

未登录时返回：

```json
{ "user": null }
```

这不是 401。

这样做是为了让前端 auth gate 初始化逻辑保持简单稳定。

### 受保护 chat routes

需要 ownership 的 thread/chat routes 都要求：

- `request.currentUser != null`

未登录时返回：

- `401 UNAUTHORIZED`

public share route 不依赖当前用户，保持可匿名访问。

## 前端边界

### 1. auth gate 属于 playground consumer 本地能力

playground consumer 使用 app-local auth runtime：

- 启动先请求 `/api/auth/me`
- 未登录进入 `/login` / `/register` / `/forgot-password`
- 已登录进入 `/new` / `/chat/:threadId` / `/replay/:threadId`

### 2. redirect 语义区分主动退出和被动拦截

当前前端将两种情况区分开：

- 被动拦截到登录页时，保留 `next`
- 主动点击退出登录时，不保留 `next`

原因是主动退出后下一次登录的用户未必还是同一个用户，不应该把旧 thread 路径继续保存在登录 URL 里。

### 3. public share route 继续匿名可读

`/share/:publicId` 当前不受 auth gate 保护。

它是只读 public surface，不要求登录态。

## 安全基线

当前模型默认包含以下安全约束：

- password 使用 `argon2id`
- session 只存 `token_hash`
- 验证码只存 `code_hmac`
- auth 写接口做 rate limit
- auth 写接口做 `Origin` 校验
- 登录失败统一返回 `INVALID_CREDENTIALS`
- 密码重置成功后撤销该用户全部 active session

## 后续演化约束

如果后续要扩展 auth，优先遵守下面这些不变条件：

1. 不把 playground host auth 反向抽进 shared packages
2. 不把 `threads.userId` 重新当成当前 playground 的 owner 事实源
3. 继续把 host auth 与 public share、durable thread schema 分开
4. 新增能力优先在现有 host-local auth 表和 route 语义上演化
