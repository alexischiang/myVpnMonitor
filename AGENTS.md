# Agent Instructions

## Branch Rules

- Only make code or documentation changes while on the `main` branch.
- Do not make changes directly on the `production` branch.
- If the current branch is `production`, switch back to `main` before editing files.

## Deployment Rules

- Do not merge or push to `production` for every change.
- Only merge `main` into `production` and push `production` when the user explicitly asks to deploy or go online.

## Git Operation Rules

- Do not stage, commit, or push changes after every edit by default.
- Only run git actions such as `git add`, `git commit`, `git push`, branch merges, or production deployments when the user explicitly asks for that git operation.
- Normal development work should remain as local working tree changes until the user asks to commit or push.

# shadcn/ui Usage Rules

## 核心原则

本项目 UI 必须严格基于 shadcn/ui 官方组件。

禁止自行通过 div + Tailwind class 创建已有 shadcn 组件可以表达的 UI。

无随意固定宽高

所有页面响应式+弹性布局

---

# Component First Rule

在创建任何 UI 前：

必须优先检查：

src/components/ui

是否存在对应 shadcn 组件。

如果存在：

必须使用该组件。

禁止重新实现。

例如：

❌ 禁止：

<div className="rounded-md border p-4 shadow-sm">
  content
</div>

✅ 必须：

<Card>
  <CardContent>
    content
  </CardContent>
</Card>

---

# Layout Rule

允许使用 div 的情况：

只有以下情况：

1. 页面布局容器

例如：

<div className="flex">

<div className="grid">

2. shadcn 组件内部需要 wrapper

除此之外：

禁止创建无意义 div。

---

# Styling Rule

禁止：

自行设计组件视觉。

禁止：

大量 Tailwind 样式组合替代 shadcn。

禁止：

以下形式：

rounded-xl

shadow-xl

bg-gradient

custom color

除非 shadcn 默认组件没有提供。

---

# Component API Rule

使用 shadcn 时：

必须按照官方 API。

例如：

Button:

<Button variant="outline">
 Save
</Button>

禁止：

<Button className="border rounded-lg">
 Save
</Button>

Card:

<Card>

<CardHeader>

<CardTitle />

</CardHeader>

<CardContent />

</Card>

Dialog:

<Dialog>

<DialogTrigger />

<DialogContent>

<DialogHeader />

</DialogContent>

</Dialog>

---

# No Custom UI Components

禁止创建：

components/Button.tsx

components/Card.tsx

components/Modal.tsx

替代 shadcn。

---

# Business Component Exception

允许创建业务组件。

例如：

NodeStatusBadge

UserTable

TrafficChart

但是内部：

必须组合 shadcn。

例如：

NodeStatusBadge:

<Card>
<Badge>
</Card>

而不是：

<div className="status-box">

---

# Before Writing JSX

生成 UI 前：

必须先回答：

1. 是否存在对应 shadcn component？
2. 是否可以通过 shadcn component props 完成？
3. 是否需要新增业务组件？

如果答案：

1 = yes

必须使用 shadcn。

---

# Final Check

每次 UI 修改后：

检查：

- 是否新增无意义 div？
- 是否重复实现 shadcn？
- 是否绕过 component API？
- 是否存在可以替换的 Tailwind 样式？
- 必须打开受影响页面并检查浏览器控制台是否存在报错，尤其是可能导致白屏的未捕获异常；如有报错必须修复后才能完成任务，不能仅以构建通过作为验证。
