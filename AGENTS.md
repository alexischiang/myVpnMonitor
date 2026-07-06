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
