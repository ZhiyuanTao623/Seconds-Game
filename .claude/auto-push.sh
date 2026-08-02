#!/usr/bin/env bash
# 每轮改动结束时自动存档 + 推送到 GitHub。
# 由 .claude/settings.local.json 里的 Stop hook 调用。
#
# 行为：
#   - 有未提交改动 → 自动 commit 一个 checkpoint
#   - 已经手动 commit 过 → 不重复提交，只负责推送
#   - 本地没领先远程 → 完全静默，不做任何事
#   - 推送失败（离线 / 远程有新提交）→ 报警，但改动已安全存在本地

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "checkpoint $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1
fi

AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
[ "$AHEAD" = "0" ] && exit 0

if git push -q origin HEAD 2>/dev/null; then
  echo "{\"systemMessage\":\"✓ 已推送 ${AHEAD} 个提交到 GitHub（$(git rev-parse --short HEAD)）\"}"
else
  echo "{\"systemMessage\":\"⚠ 推送 GitHub 失败，但 ${AHEAD} 个提交已安全存档在本地，可稍后 git push\"}"
fi