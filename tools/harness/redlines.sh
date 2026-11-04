#!/bin/sh
# Deterministic red-line check (CLAUDE.md). Fails the build; agents run it before saying "done".
#  1. secrets in tracked files   2. names that must never appear (list kept OUTSIDE the repo)
#  3. purchase/dealer/margin keys in data and migrations   4. files that must not be committed
# Names to block: env REDLINE_TERMS (comma separated; in CI the GitHub secret of the same name),
# or the git-ignored file .redlines.local (one term per line). Without a list the check says so and goes on.
cd "$(dirname "$0")/../.." || exit 1
fail=0; files=$(git ls-files --cached --others --exclude-standard)
say() { echo "REDLINE: $1"; fail=1; }

# 1. secrets (the publishable "sb_publishable_" key is public by design and allowed)
hits=$(echo "$files" | grep -Ev '^(\.github/workflows/|tools/harness/redlines\.sh$)' | xargs grep -IlE 'sb_secret_|service_role[^a-z_]*[:=] *["'\'']eyJ|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|postgres(ql)?://[^ :/@]+:[^ @$]{4,}@' 2>/dev/null)
[ -n "$hits" ] && say "возможный секрет в: $(echo $hits)"

# 2. forbidden names
terms=$(printf '%s' "${REDLINE_TERMS:-}" | tr ',' '\n'; [ -f .redlines.local ] && cat .redlines.local)
terms=$(printf '%s\n' "$terms" | sed '/^[[:space:]]*$/d')
if [ -z "$terms" ]; then
  echo "note: список запрещённых имён не задан (REDLINE_TERMS или .redlines.local) — проверка имён пропущена"
else
  for t in $terms; do
    hits=$(echo "$files" | xargs grep -Iil -- "$t" 2>/dev/null)
    [ -n "$hits" ] && say "запрещённое имя найдено в: $(echo $hits)"
    # commit messages of this branch too
    git log --format=%B origin/main..HEAD 2>/dev/null | grep -qi -- "$t" && say "запрещённое имя в сообщении коммита"
  done
fi

# 3. purchase prices / dealer discounts / margins as data keys
hits=$(echo "$files" | grep -E '^(data/|db/migrations/).*\.(json|sql)$' | xargs grep -IlEi '"(purchase|margin|dealer_discount|cost_price|ek_preis|einkauf)[a-z_]*"[[:space:]]*:|^[[:space:]]*(purchase|margin|dealer_discount|cost_price)[a-z_]*[[:space:]]+(numeric|integer|text|real)' 2>/dev/null)
[ -n "$hits" ] && say "закупочные данные/маржа в данных или схеме: $(echo $hits)"

# 4. files that must never be committed
bad=$(echo "$files" | grep -Ei '(^|/)handoff[^/]*\.md$|\.(pdf|xlsx|xls)$|(^|/)\.env($|\.)' | grep -v '\.env\.example$')
[ -n "$bad" ] && say "нельзя коммитить: $(echo $bad)"

[ "$fail" = 0 ] && echo "redlines: ok"
exit $fail
