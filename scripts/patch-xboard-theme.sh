#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/www/wwwroot/xb-hkaliyun.vv22rei.me"
THEME_FILE="${BASE_DIR}/theme/Xboard/dashboard.blade.php"

MARK_BEGIN="<!-- vvcloud:inject:begin -->"
MARK_END="<!-- vvcloud:inject:end -->"

INJECT_BLOCK="$(cat <<'EOF'
<!-- vvcloud:inject:begin -->
<link rel="stylesheet" href="/vvcloud-custom/vvcloud-nmessage.css">
<script defer src="/vvcloud-custom/vvcloud-crisp.js"></script>
<!-- vvcloud:inject:end -->
EOF
)"

if [[ ! -f "$THEME_FILE" ]]; then
  echo "[ERR] theme file not found: $THEME_FILE" >&2
  exit 1
fi

# 已经注入过则直接退出（幂等）
if grep -qF "$MARK_BEGIN" "$THEME_FILE"; then
  echo "[OK] vvcloud inject already present in: $THEME_FILE"
  exit 0
fi

# 必须存在 </head>
if ! grep -qi '</head>' "$THEME_FILE"; then
  echo "[ERR] </head> not found in: $THEME_FILE" >&2
  exit 2
fi

# 备份
BACKUP="${THEME_FILE}.bak_$(date +%F_%H%M%S)"
cp -a "$THEME_FILE" "$BACKUP"
echo "[OK] backup: $BACKUP"

# 在 </head> 前插入（不依赖 perl/jq，使用 awk 更稳）
tmp="$(mktemp)"
awk -v inject="$INJECT_BLOCK" '
  BEGIN{IGNORECASE=1}
  {
    if ($0 ~ /<\/head>/ && !done) {
      print inject
      done=1
    }
    print
  }
  END{
    if (!done) exit 3
  }
' "$THEME_FILE" > "$tmp"

mv "$tmp" "$THEME_FILE"
echo "[OK] injected vvcloud block into: $THEME_FILE"