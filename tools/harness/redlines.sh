#!/bin/sh
# Deterministic red-line check (CLAUDE.md). Fails the build; agents run it before saying "done".
#  1. secrets   2. names that must never appear (content, file names, branch, commit messages; list kept OUTSIDE the repo)
#  3. purchase/dealer/margin identifiers in code, data and migrations   4. files that must not be committed
# Names to block: env REDLINE_TERMS (comma separated; in CI the GitHub secret of the same name) and/or the git-ignored
# file .redlines.local (one name per line, spaces allowed). Matching is plain text, case-insensitive.
# Without a list the check cannot see names: it says so loudly (CI: ::warning::); REDLINE_REQUIRE_TERMS=1 makes it a failure.
# Commit messages are checked from $REDLINE_BASE (default origin/main) to HEAD. REDLINE_HISTORY=1 also scans the whole history (hashes only).
cd "$(dirname "$0")/../.." || exit 1
fail=0
say() { echo "REDLINE: $1"; fail=1; }
G="git grep -I -n --untracked"        # NUL-safe, handles spaces in paths, skips ignored files
SELF=':(exclude)tools/harness/redlines.sh'
loc() { cut -d: -f1,2 | sort -u | tr '\n' ' '; }   # file:line only, never the matching text (it may be a secret)

# 1. secrets. The publishable "sb_publishable_" key is public by design; localhost test URLs are fine.
# -o prints only the match, so the localhost exception cannot hide a real secret sitting on the same line
hits=$($G -o -E -e 'sb_secret_|sbp_[A-Za-z0-9]{20,}|phx_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|service_role[^a-z_]*[:=] *["'\'']eyJ|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|postgres(ql)?://[^ :/@]+:[^ @$]{4,}@[^ /:"'\'']*' -- . "$SELF" | grep -Ev '@(localhost|127\.0\.0\.1)$' | loc)
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
  branch="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
  found=$(printf '%s\n' "$terms" | while IFS= read -r t; do
    h=$($G -i -F -e "$t" -- . "$SELF" | loc);                    [ -n "$h" ] && echo "REDLINE: запрещённое имя в содержимом: $h"
    f=$(git ls-files -co --exclude-standard | grep -iF -e "$t" | head -3 | tr '\n' ' '); [ -n "$f" ] && echo "REDLINE: запрещённое имя в имени файла: $f"
    printf '%s' "$branch" | grep -qiF -e "$t" &&                 echo "REDLINE: запрещённое имя в названии ветки"
    [ "$have_base" = 1 ] && git log --format=%B "$base"..HEAD 2>/dev/null | grep -qiF -e "$t" && echo "REDLINE: запрещённое имя в сообщении коммита"
  done)
  [ -n "$found" ] && { echo "$found" | sort -u; fail=1; }
fi

# 3. purchase prices / dealer discounts / margins / markups as identifiers (not the CSS word "margin")
hits=$($G -i -E -e 'purchase_|purchaseprice|cost_?price|dealer_?(discount|price)|einkaufspreis|ek_?preis|marge_|markup_|margin_(pct|percent|eur)|"(purchase|margin|marge|markup|dealer_?price)[a-z_]*"[[:space:]]*:|(^|[[:space:],(])"?(purchase|margin|marge|markup)[a-z_]*"?[[:space:]]+(numeric|integer|int|real|decimal)\b' -- data db supabase packages apps tools/import prototype ':(exclude)prototype/vendor' "$SELF" | loc)
[ -n "$hits" ] && say "закупочные данные/маржа в коде, данных или схеме: $hits"

# 3b. the outside view (/founder) may leave only NON-financial material in docs/external-view
hits=$($G -i -E -e 'margin|marge|маржа|маржи|маржу|break-?even|безубыточ|закупк|закупоч|комисси|commission|unit economics|ebitda|payback|окупаемост' -- docs/external-view "$SELF" | loc)
[ -n "$hits" ] && say "финансы в docs/external-view (им место только в личном документе): $hits"

# 4. files that must never be committed (the transferred HANDOFF with the economics, price lists, env files)
bad=$(git ls-files -co --exclude-standard | grep -Ei '(^|/)handoff[^/]*\.md$|\.(pdf|xlsx|xls)$|(^|/)\.env($|\.)|^founder/|(^|/)numbers\.json$' | grep -v '\.env\.example$' | tr '\n' ' ')
[ -n "$bad" ] && say "нельзя коммитить: $bad"

# 5. history (REDLINE_HISTORY=1): the repository is public, so old commits count too. Prints commit hashes only.
if [ "${REDLINE_HISTORY:-}" = 1 ]; then
  h=$(git log --all -E -G'sb_secret_|sbp_[A-Za-z0-9]{20,}|phx_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}' --format=%h -- . ':(exclude)tools/harness/redlines.sh' | tr '\n' ' ')
  [ -n "$h" ] && say "возможный секрет в истории, коммиты: $h"
  if [ -n "$terms" ]; then
    f=$(printf '%s\n' "$terms" | while IFS= read -r t; do git log --all -i -F -S"$t" --format=%h -- . ':(exclude)tools/harness/redlines.sh' | tr '\n' ' '; done)
    [ -n "$(echo $f)" ] && say "запрещённое имя в истории, коммиты: $f"
    m=$(printf '%s\n' "$terms" | while IFS= read -r t; do git log --all -i -F --grep="$t" --format=%h | tr '\n' ' '; done)
    [ -n "$(echo $m)" ] && say "запрещённое имя в сообщениях коммитов: $m"
  fi
fi

[ "$fail" = 0 ] && echo "redlines: ok"
exit $fail
