#!/usr/bin/env bash
# 推送闸门。
#
# 守的是这个游戏唯一不能坏的不变式：
#   屏幕上显示的秒数 === 玩家实际被扣的秒数
# 外加竞速模式的地基：同一个 seed 必须跑出同一局。
#
# 用法:  bash tests/run.sh
# 退出码 0 = 全通过（auto-push.sh 靠这个决定推不推）

cd "$(dirname "$0")/.." || exit 1

FAIL=0

step() {
  local name="$1"; shift
  if OUT=$("$@" 2>&1); then
    echo "  PASS  $name"
  else
    echo "  FAIL  $name"
    echo "$OUT" | tail -40 | sed 's/^/        /'
    FAIL=1
  fi
}

echo "推送闸门"

if [ ! -d node_modules ]; then
  echo "  SKIP  未安装依赖，先跑 npm install"
  exit 1
fi

step "类型检查" npx tsc --noEmit
step "测试套件" npx vitest run
step "生产构建" npx vite build

if [ $FAIL -eq 0 ]; then
  echo "全部通过：显示价 = 实扣价，seed 可复现，构建产物可用"
else
  echo "有检查未通过"
fi
exit $FAIL
