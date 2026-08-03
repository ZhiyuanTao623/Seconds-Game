#!/usr/bin/env bash
# 每轮改动结束时：先跑闸门（类型检查 + 测试 + 构建），再决定要不要推 GitHub。
# 由 .claude/settings.local.json 里的 Stop hook 调用。
#
# 设计取舍：
#   本地存档和推送是两件事。存档是给你回滚用的，所以【无论测试过不过都存】——
#   测试挂了反而更需要一个可回退的点。推送是对外发布，所以【测试不过就不推】。
#   结果：坏状态留在本地随时可回滚，GitHub 上永远是通过测试的版本。

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

# ---------- 闸门：类型检查 + 报价一致性测试 + 构建 ----------
TESTS_OK=1
NFAIL=0
if [ -f tests/run.sh ]; then
  if TEST_OUT=$(bash tests/run.sh 2>&1); then
    TESTS_OK=1
  else
    TESTS_OK=0
    NFAIL=$(printf '%s' "$TEST_OUT" | grep -c '^  FAIL')
  fi
fi

# ---------- 本地存档（不受测试结果影响） ----------
git add -A
if ! git diff --cached --quiet; then
  if [ "$TESTS_OK" = "1" ]; then
    git commit -q -m "checkpoint $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1
  else
    git commit -q -m "WIP 测试未通过 $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1
  fi
fi

# ---------- 测试没过就到此为止 ----------
if [ "$TESTS_OK" = "0" ]; then
  echo "{\"systemMessage\":\"⛔ 闸门 ${NFAIL} 项未通过，已拦下推送。改动存为本地 WIP 提交，可回滚。跑 bash tests/run.sh 看详情\"}"
  exit 0
fi

# ---------- 推送 ----------
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
[ "$AHEAD" = "0" ] && exit 0

if git push -q origin HEAD 2>/dev/null; then
  echo "{\"systemMessage\":\"✓ 测试通过，已推送 ${AHEAD} 个提交（$(git rev-parse --short HEAD)）\"}"
else
  echo "{\"systemMessage\":\"⚠ 测试通过但推送失败，${AHEAD} 个提交已安全存档在本地\"}"
fi
