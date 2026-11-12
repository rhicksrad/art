#!/usr/bin/env bash
# Registers a self-hosted GitHub Actions runner for a public web repo (default rhicksrad/art)
# on a Linux PC, following Pharaoh's docs/CI_RUNNERS.md Part 2:
#   * runs as the unprivileged user `ghrunner` (no gh login, no SSH keys, no sudo, no access
#     to /home/ryan), in a systemd user service inside a CPU/memory-capped slice
#   * a job-started hook refuses fork PRs, pull_request_target, and low-disk jobs
#   * shared tool cache and pnpm store; a weekly timer prunes caches and old logs
# Run it as Ryan (it uses sudo for the user setup and Ryan's `gh` login for the token).
# Re-runnable: an already-registered runner is left alone, the files around it are refreshed.
#
#   bash ci/runner/setup_web_runner.sh [owner/repo]
set -euo pipefail

REPO=${1:-rhicksrad/art}
RUNNER_VERSION=${RUNNER_VERSION:-2.338.2}
RUSER=ghrunner
HOST=$(hostname | tr 'A-Z' 'a-z')
NAME="$HOST-${REPO#*/}"
LABELS="web,web-trusted,$HOST"
PLAYWRIGHT_VERSION=${PLAYWRIGHT_VERSION:-1.63.0}

sudo true
if ! id "$RUSER" >/dev/null 2>&1; then
  sudo adduser --disabled-password --gecos '' "$RUSER"
fi
sudo loginctl enable-linger "$RUSER"
# The runner user must not be able to read Ryan's home (gh token, SSH keys, clones).
sudo chmod o-rwx "$HOME"
RHOME=$(getent passwd "$RUSER" | cut -d: -f6)
RUID=$(id -u "$RUSER")
BASE=$RHOME/actions-runners
DIR=$BASE/${REPO#*/}

as_runner() { sudo -u "$RUSER" -H env XDG_RUNTIME_DIR=/run/user/$RUID "$@"; }

# Chromium's system libraries, so jobs can `playwright install chromium` without sudo.
if command -v npx >/dev/null 2>&1; then
  sudo env "PATH=$PATH" npx --yes "playwright@$PLAYWRIGHT_VERSION" install-deps chromium \
    && LABELS="$LABELS,playwright" || echo "warning: playwright install-deps failed; no playwright label"
fi

# Registration token comes from Ryan's gh login, before anything runs as ghrunner.
TOKEN=""
if [ ! -f "$DIR/.runner" ]; then
  TOKEN=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
fi

as_runner bash -s -- "$BASE" "$DIR" "$REPO" "$NAME" "$LABELS" "$RUNNER_VERSION" "$TOKEN" <<'INNER'
set -euo pipefail
BASE=$1 DIR=$2 REPO=$3 NAME=$4 LABELS=$5 VER=$6 TOKEN=$7
mkdir -p "$BASE/_toolcache" "$DIR" ~/.config/systemd/user

cat > "$BASE/refuse_untrusted.sh" <<'HOOK'
#!/usr/bin/env bash
# Job-started hook: a failing hook fails the job before any workflow step runs.
set -eu
case "${GITHUB_EVENT_NAME:-}" in
  pull_request_target) echo "refused: pull_request_target on a self-hosted runner"; exit 1 ;;
  pull_request|pull_request_review|pull_request_review_comment)
    head=$(python3 -c 'import json,os;e=json.load(open(os.environ["GITHUB_EVENT_PATH"]));print(e["pull_request"]["head"]["repo"]["full_name"])')
    [ "$head" = "$GITHUB_REPOSITORY" ] || { echo "refused: PR from fork $head"; exit 1; } ;;
esac
free_gb=$(df -Pk "$HOME" | awk 'NR==2 {print int($4/1048576)}')
[ "$free_gb" -ge "${RUNNER_MIN_FREE_GB:-10}" ] || { echo "refused: only ${free_gb} GB free"; exit 1; }
HOOK
chmod 755 "$BASE/refuse_untrusted.sh"

cat > "$BASE/cleanup.sh" <<'CLEAN'
#!/usr/bin/env bash
# Weekly: prune the shared pnpm store, old runner temp files and diagnostic logs.
set -u
for p in "$HOME"/setup-pnpm/node_modules/.bin/pnpm "$(command -v pnpm 2>/dev/null)"; do
  [ -x "$p" ] && { "$p" store prune || true; break; }
done
find "$HOME"/actions-runners/*/_work/_temp -mindepth 1 -mtime +1 -delete 2>/dev/null || true
find "$HOME"/actions-runners/ms-playwright -mindepth 1 -maxdepth 1 -atime +30 -exec rm -rf {} + 2>/dev/null || true
find "$HOME"/actions-runners/*/_diag -name '*.log' -mtime +14 -delete 2>/dev/null || true
CLEAN
chmod 755 "$BASE/cleanup.sh"

cd "$DIR"
if [ ! -x ./config.sh ]; then
  curl -fsSL "https://github.com/actions/runner/releases/download/v$VER/actions-runner-linux-x64-$VER.tar.gz" | tar xz
fi
if [ ! -f .runner ]; then
  ./config.sh --unattended --url "https://github.com/$REPO" --token "$TOKEN" \
    --name "$NAME" --labels "$LABELS" --work _work --replace
fi
cat > .env <<ENV
PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
RUNNER_TOOL_CACHE=$BASE/_toolcache
PLAYWRIGHT_BROWSERS_PATH=$BASE/ms-playwright
ACTIONS_RUNNER_HOOK_JOB_STARTED=$BASE/refuse_untrusted.sh
ENV

U=~/.config/systemd/user
cat > $U/web-runners.slice <<'EOF2'
[Slice]
CPUQuota=400%
MemoryMax=8G
EOF2
SVC=runner-${REPO#*/}
cat > $U/$SVC.service <<EOF2
[Unit]
Description=GitHub Actions runner $NAME ($REPO)
After=network-online.target
[Service]
WorkingDirectory=$DIR
ExecStart=$DIR/run.sh
Restart=always
RestartSec=10
Nice=15
Slice=web-runners.slice
[Install]
WantedBy=default.target
EOF2
cat > $U/runner-cleanup.service <<EOF2
[Service]
Type=oneshot
ExecStart=$BASE/cleanup.sh
EOF2
cat > $U/runner-cleanup.timer <<'EOF2'
[Timer]
OnCalendar=weekly
Persistent=true
[Install]
WantedBy=timers.target
EOF2
systemctl --user daemon-reload
systemctl --user enable --now "$SVC" runner-cleanup.timer
systemctl --user restart "$SVC"
sleep 5
systemctl --user --no-pager status "$SVC" | head -5
INNER
echo "Registered $NAME for $REPO with labels $LABELS"
