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

### 2. `selectedModelKey` 仍然是真实发送事实源

当前模式切换不会引入第二份“当前模型”状态。

模式按钮最终只做一件事：

- 更新 `selectedModelKey`

真正发送消息时，仍然由当前 `selectedModelKey` 解析出 `selectedModelOption`，
再把对应的 `provider/model` 带入 send flow。

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

### 2. 模式与真实模型映射固定为

- `快速模式` -> `deepseek-v4-flash`
- `专家模式` -> `deepseek-v4-pro`

这是显式映射，不依赖文案猜测，也不应退化为“两个看起来像模式的假按钮”。

### 3. centered landing 的降级规则

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
2. 模式切换必须真正影响发送模型
3. `/new` landing 和已有 thread 聊天页不能混成同一套壳
4. 非 DeepSeek fallback 不得显示误导性的 DeepSeek 模式 UI
