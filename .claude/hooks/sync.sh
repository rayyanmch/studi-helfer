#!/usr/bin/env bash
# Holt vor jeder Session und jedem Prompt den neuesten Stand von GitHub.
# Ausgabe landet als Kontext bei Claude; ohne Neuigkeiten bleibt es still.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# Mitten in einem Rebase/Merge nichts anfassen, Claude soll das erst lösen.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ]; then
  echo "[sync] Achtung: Ein Rebase/Merge ist noch nicht abgeschlossen. Prüfe 'git status', löse die Konflikte und schließe ab, bevor du weiterarbeitest."
  exit 0
fi

git fetch --quiet origin 2>/dev/null || exit 0  # offline: einfach weitermachen

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || exit 0
behind=$(git rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)
[ "$behind" -eq 0 ] && exit 0

new_commits=$(git log --oneline --no-decorate "HEAD..$upstream")
if git pull --rebase --autostash --quiet >/dev/null 2>&1; then
  echo "[sync] $behind neue(r) Commit(s) von GitHub übernommen (vermutlich von der anderen Person):"
  echo "$new_commits"
  echo "Beachte die Änderungen und lies NOTIZEN.md erneut, falls sie geändert wurde."
else
  echo "[sync] Konflikt beim Übernehmen der neuen Commits von GitHub:"
  echo "$new_commits"
  echo "Prüfe 'git status', löse die Konflikte so, dass beide Änderungen erhalten bleiben, und schließe den Rebase ab ('git rebase --continue'; bei hängendem Autostash danach 'git stash pop'). Erst dann mit der Aufgabe weitermachen."
fi
exit 0
