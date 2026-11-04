#!/bin/sh
# Deterministic red-line check (CLAUDE.md). Fails the build; agents run it before saying "done".
#  1. secrets   2. names that must never appear (content, file names, branch, commit messages; list kept OUTSIDE the repo)
#  3. purchase/dealer/margin identifiers in code, data and migrations   4. files that must not be committed
# Names to block: env REDLINE_TERMS (comma separated; in CI the GitHub secret of the same name) and/or the git-ignored
# file .redlines.local (one name per line, spaces allowed). Matching is plain text, case-insensitive.
# Without a list the check cannot see names: it says so loudly (CI: ::warning::); REDLINE_REQUIRE_TERMS=1 makes it a failure.
# Commit messages are checked from $REDLINE_BASE (default origin/main) to HEAD.
cd "$(dirname "$0")/../.." || exit 1
fail=0
say() { echo "REDLINE: $1"; fail=1; }
G="git grep -I -n --untracked"        # NUL-safe, handles spaces in paths, skips ignored files
SELF=':(exclude)tools/harness/redlines.sh'
loc() { cut -d: -f1,2 | sort -u | tr '\n' ' '; }   # file:line only, never the matching text (it may be a secret)

# 1. secrets. The publishable "sb_publishable_" key is public by design; localhost test URLs are fine.
hits=$($G -E -e 'sb_secret_|service_role[^a-z_]*[:=] *["'\'']eyJ|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|postgres(ql)?://[^ :/@]+:[^ @$]{4,}@' -- . "$SELF" | grep -v '@localhost' | loc)
[ -n "$hits" ] && say "возможный секрет в: $hits"

# 2. forbidden names
terms=$( { printf '%s\n' "${REDLINE_TERMS:-}" | tr ',' '\n'; [ -f .redlines.local ] && cat .redlines.local; } | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d')
if [ -z "$terms" ]; then
  if [ -n "${CI:-}" ]; then echo "::warning::REDLINE_TERMS не задан: запрещённые имена НЕ проверяются"
  else echo "note: список запрещённых имён не задан (REDLINE_TERMS или .redlines.local) — имена НЕ проверяются"; fi
  [ "${REDLINE_REQUIRE_TERMS:-}" = 1 ] && say "список запрещённых имён обязателен, но не задан"
else
  base="${REDLINE_BASE:-origin/main}"
  git rev-parse -q --verify "$base" >/dev/null 2>&1 && have_base=1 || have_base=0
  [ "$have_base" = 0 ] && echo "note: нет базы $base — сообщения коммитов не проверены"
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  found=$(printf '%s\n' "$terms" | while IFS= read -r t; do
    h=$($G -i -F -e "$t" -- . "$SELF" | loc);                    [ -n "$h" ] && echo "REDLINE: запрещённое имя в содержимом: $h"
    git ls-files -co --exclude-standard | grep -qiF -e "$t" &&   echo "REDLINE: запрещённое имя в имени файла"
    printf '%s' "$branch" | grep -qiF -e "$t" &&                 echo "REDLINE: запрещённое имя в названии ветки"
    [ "$have_base" = 1 ] && git log --format=%B "$base"..HEAD 2>/dev/null | grep -qiF -e "$t" && echo "REDLINE: запрещённое имя в сообщении коммита"
  done)
  [ -n "$found" ] && { echo "$found" | sort -u; fail=1; }
fi

# 3. purchase prices / dealer discounts / margins as identifiers (not the CSS word "margin")
hits=$($G -i -E -e 'purchase_|purchaseprice|cost_?price|dealer_?discount|einkaufspreis|ek_?preis|marge_|margin_(pct|percent|eur)|"(purchase|margin|marge)[a-z_]*"[[:space:]]*:|(^|[[:space:],(])(purchase|margin|marge)[a-z_]*[[:space:]]+(numeric|integer|int|real|decimal)\b' -- data db packages apps tools/import 'prototype/*.js' 'prototype/*.sh' "$SELF" | loc)
[ -n "$hits" ] && say "закупочные данные/маржа в коде, данных или схеме: $hits"

# 4. files that must never be committed (the transferred HANDOFF with the economics, price lists, env files)
bad=$(git ls-files -co --exclude-standard | grep -Ei '(^|/)handoff[^/]*\.md$|\.(pdf|xlsx|xls)$|(^|/)\.env($|\.)' | grep -v '\.env\.example$' | tr '\n' ' ')
[ -n "$bad" ] && say "нельзя коммитить: $bad"

[ "$fail" = 0 ] && echo "redlines: ok"
exit $fail
