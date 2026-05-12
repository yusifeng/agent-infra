# Playground Chat Mode 模型说明

这份说明定义 `apps/playground-fastify-server` 与 `apps/playground-vite-web` 当前采用的
**playground chat 模式与 `/new` landing 语义**。

它记录长期事实和边界，不是某一次 UI 调整的执行说明。

## 当前状态

playground chat 当前固定支持一组面向 DeepSeek 的双模式入口：

- `快速模式`
- `专家模式`

这组模式只用于：

- `playground-fastify-server` 暴露的 host meta
- `playground-vite-web` 的 `/new` centered landing shell

它不是 shared package 的通用 provider 模式系统。

## 核心边界

### 1. 产品模式只属于 playground host / consumer

`快速模式` / `专家模式` 是 playground 产品层语义，不进入：

- `packages/core`
- `packages/contracts`
- `packages/durable-chat-client`
- `packages/runtime-pi`

shared 层继续只认识：

- `modelOptions`
- `selectedModelKey`
- `provider`
- `model`

### 2. thread 级绑定只存在于 playground host catalog

当前 thread 的持久化运行绑定只存在于：

- `apps/playground-fastify-server`
- `playground_thread_catalog.runtime_provider`
- `playground_thread_catalog.runtime_model`

它不是 durable chat shared `Thread` 的字段，也不会进入 shared contract。

### 3. `selectedModelKey` 与 thread binding 不是同一层状态

现在需要明确区分两种事实：

- `selectedModelKey`
  - 这是 composer 在 `/new` 状态下的发送意图
  - 用于 centered landing 的模式切换
  - 不再代表“当前 active thread 的固定模式”
- `playground_thread_catalog.runtime_provider/runtime_model`
  - 这是已有 thread 的持久化运行绑定
  - header 模式展示读取这里
  - 已有 thread 的 send flow 也优先读取这里

### 4. 首次成功发送后，thread runtime 被固定

当 thread 还没有 binding 时：

1. 前端仍可通过 `/new` 模式切换更新 `selectedModelKey`
2. 首次发送时，runtime 最终采用的 `provider/model` 会写入 `playground_thread_catalog`
3. 此后该 thread 进入“已绑定”状态

当 thread 已绑定时：

- header 模式读取 thread binding
- 发送消息时优先沿用 thread binding
- 即使全局 `selectedModelKey` 改变，也不会改变这个 thread 的 header 模式

### 5. 历史 `NULL` binding thread 的处理

第一阶段不做历史 thread 的全量回填。

因此历史 thread 允许出现：

- `runtime_provider = NULL`
- `runtime_model = NULL`

这类 thread 的规则是：

- header 不显示模式
- 后续第一次成功发送后，再建立 thread binding

## Host meta 语义

### 1. DeepSeek 可用时优先暴露 DeepSeek 选项

`playground-fastify-server` 当前 host meta 行为固定为：

- 如果环境里存在 DeepSeek 可用模型，则 playground 只向前端暴露 DeepSeek 相关 `modelOptions`
- 当前预期的双模型为：
  - `deepseek-v4-flash`
  - `deepseek-v4-pro`

### 2. 非 DeepSeek 只是 fallback，不参与产品模式命名

如果 DeepSeek 不可用而其他 provider 可用：

- host meta 仍可返回其他 provider 的 `modelOptions`
- 但前端不再显示 DeepSeek 专属的模式按钮和文案

这意味着：

- 模式命名不会错误套在非 DeepSeek 模型上
- centered composer 仍然可用，但会退化为通用新对话入口

## `/new` landing 语义

### 1. centered landing 只在没有 active thread 时显示

当前 centered landing 只用于：

- `/new`
- 或无 active thread 的同等状态

已有 thread 页面继续保持聊天态布局，不应被 landing shell 覆盖。

### 2. `/new` 仍然使用 `selectedModelKey`

`/new` 没有 active thread，因此也没有 thread binding。

这个状态下：

- 模式按钮更新 `selectedModelKey`
- centered landing 文案也跟随 `selectedModelKey`
- 真正创建 thread 后，首次成功发送再把最终 runtime 绑定写入 catalog

### 3. 模式与真实模型映射固定为

- `快速模式` -> `deepseek-v4-flash`
- `专家模式` -> `deepseek-v4-pro`

这是显式映射，不依赖文案猜测，也不应退化为“两个看起来像模式的假按钮”。

### 4. centered landing 的降级规则

当 DeepSeek 双模型不可用时：

- 不显示 DeepSeek logo 标题
- 不显示 `快速模式` / `专家模式` 切换
- placeholder 与 centered shell 退化为通用新对话入口

## 非目标

当前模型说明明确不包含：

- OpenAI / 多 provider 的统一产品模式系统
- 三个以上模式
- shared contract 的模式字段扩展
- 根据数组顺序猜测模式语义

## 实现约束

长期实现应保持这些约束：

1. host meta 与前端模式文案不能漂移
2. `/new` 的 `selectedModelKey` 与已有 thread 的 binding 不能混用成一个状态
3. 已绑定 thread 的 header 模式必须跟随 thread DTO，而不是全局选择
4. 已绑定 thread 的发送模型必须与 thread binding 收敛
5. `/new` landing 和已有 thread 聊天页不能混成同一套壳
6. 非 DeepSeek fallback 不得显示误导性的 DeepSeek 模式 UI
