#!/bin/sh
# Преддеплой-чек юридических страниц портфолио.
# Использование: sh scripts/check-legal-placeholders.sh (из корня репозитория).
# Выход 0 = чисто, можно деплоить. Выход 1 = остались плейсхолдеры, деплой запрещён.
set -eu
cd "$(dirname "$0")/.."
fail=0
for f in privacy.html offer.html index.html; do
  if [ ! -f "$f" ]; then echo "MISSING: $f"; fail=1; continue; fi
  if grep -n "TODO\|{{" "$f"; then echo "PLACEHOLDERS in $f"; fail=1; fi
done
for p in privacy offer; do
  if ! grep -q "\"/$p" vercel.json && ! grep -q "/$p" vercel.json; then echo "NO REWRITE for /$p/ in vercel.json"; fail=1; fi
done
if [ "$fail" -eq 0 ]; then echo "LEGAL PAGES OK"; fi
exit "$fail"
