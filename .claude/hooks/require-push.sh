#!/usr/bin/env bash
# Stop-Hook: Claude darf erst aufhören, wenn alles committet und gepusht ist.
# So bekommt die andere Person die Änderungen beim nächsten Prompt automatisch.
input=$(cat)
# Schon einmal geblockt? Dann durchlassen, damit es keine Endlosschleife gibt.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

dirty=$(git status --porcelain)
ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
[ -z "$dirty" ] && [ "$ahead" -eq 0 ] && exit 0

reason="Bevor du aufhörst, teile deine Arbeit mit dem Team:"
[ -n "$dirty" ] && reason="$reason Es gibt uncommittete Änderungen."
[ "$ahead" -gt 0 ] && reason="$reason Es gibt $ahead ungepushte(n) Commit(s)."
reason="$reason 1) Bei Änderungen in web/: 'npm run lint' und 'npm run build' in web/ müssen durchlaufen; Fehler beheben. 2) Mit aussagekräftiger Nachricht committen (keine Secrets, kein .env.local). 3) 'git pull --rebase --autostash', Konflikte so lösen, dass beide Änderungen erhalten bleiben. 4) 'git push'. Wenn etwas davon nicht klappt, sag dem Nutzer kurz, was fehlt."
printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')"
exit 0
