# CI on Ryan's self-hosted runners

This repo follows the plan in `rhicksrad/Pharaoh` `docs/CI_RUNNERS.md` (Part 2, "art").

## Workflows

| Workflow         | Trigger                                   | Where it runs                                                                                        |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ci.yml` `gate`  | PRs (not drafts), push to main, manual    | local, hosted fallback. Lint, typecheck, Vitest, route check                                         |
| `ci.yml` `build` | same                                      | local, hosted fallback. `tsc` + Vite build + smoke check of `dist/`                                  |
| `pages.yml`      | push to main, manual                      | build local, **deploy hosted** (keeps the Pages OIDC token off the PCs). `cancel-in-progress: false` |
| `live.yml`       | nightly 07:23 UTC, manual                 | local. Hits the real Worker and site; fails on a core route or any unredacted credential             |
| `worker.yml`     | push to main touching `worker/**`, manual | hosted (uses the Cloudflare secret)                                                                  |

PR and CI workflows use `concurrency: ${{ github.workflow }}-${{ github.ref }}` with
`cancel-in-progress: true`, so a new push cancels the old run.

## Routing

```yaml
runs-on: ${{ vars.CI_RUNNER == 'local'
  && (github.event_name != 'pull_request'
  || github.event.pull_request.head.repo.full_name == github.repository)
  && fromJSON('["self-hosted","web-trusted"]') || 'ubuntu-latest' }}
```

- Repo variable `CI_RUNNER=local` turns the PCs on. **Delete it** to send everything to
  `ubuntu-latest` (a job whose labels match no online runner queues silently for 24 h).
- Fork PRs always go hosted.

## Safety (the repo is public)

1. Settings > Actions > General: fork PR workflows from outside collaborators need approval
   (`approval_policy=all_external_contributors`).
2. Every runner has a job-started hook (`refuse_untrusted.sh`) that fails fork PRs,
   `pull_request_target` and jobs when under 10 GB is free, whatever the workflow says.
3. Runners run as the unprivileged user `ghrunner`: no gh login, no SSH keys, no sudo, and
   Ryan's home is not readable to it.
4. `permissions: contents: read` by default; secrets are only used by push/manual jobs.

## Caching and cleanup

- Self-hosted: the pnpm store and Node tool cache live on the PC (`~ghrunner`), so
  `setup-node`'s GitHub cache is only used on hosted runners.
- Checkout cleans the workspace (`git clean -ffdx`); each job also removes `node_modules`
  and `dist` at the end. A weekly `runner-cleanup.timer` prunes the pnpm store, old
  `_temp` files, old Playwright browsers and runner logs.

## Runners

Registered with `bash ci/runner/setup_web_runner.sh` (run once per PC, as Ryan; it needs
sudo once). Name `<host>-art`, labels `web, web-trusted, <host>` (+ `playwright` when
Chromium's system libraries are installed). Web jobs go on PresidentScroob and
MajorAsshole; DarkHelmet is the perf-timing box and takes none; ROI-IT-RHICKS is optional
once its WSL keeper is fixed.

```bash
# status (from a PC with gh logged in)
gh api repos/rhicksrad/art/actions/runners --jq '.runners[] | "\(.name) \(.status) \([.labels[].name]|join(","))"'
# on a PC
sudo -u ghrunner XDG_RUNTIME_DIR=/run/user/$(id -u ghrunner) systemctl --user status runner-art
```
