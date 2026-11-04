#!/bin/sh
# SessionStart hook: every new session, and every session after a context compaction, gets ONE page
# (docs/STATE.md) instead of the whole archive. If the page is missing the session must say so and stop.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true
if [ ! -f docs/STATE.md ]; then
  echo "!!! ХАРНЕСС НЕ ЗАГРУЖЕН: нет docs/STATE.md. Сообщи об этом владельцу первой строкой и не продолжай работу без него."
  exit 0
fi
echo "=== ХАРНЕСС ЗАГРУЖЕН. Это единственная страница старта (docs/STATE.md). Архив не читай: журнал решений docs/decisions.md и видение docs/vision.md открывай только по необходимости. ==="
cat docs/STATE.md
upd=$(sed -n 's/^\*\*Обновлено:\*\* *\([0-9-]*\).*/\1/p' docs/STATE.md | head -1)
if [ -n "$upd" ]; then
  age=$(( ( $(date +%s) - $(date -d "$upd" +%s 2>/dev/null || echo 0) ) / 86400 ))
  [ "$age" -gt 3 ] 2>/dev/null && echo "!!! STATE.md обновлялся $age дн. назад: сверь его с git log и состоянием проекта, прежде чем верить."
fi
echo "=== Роли и протокол: docs/harness/README.md · цикл задачи: навык /task ==="
