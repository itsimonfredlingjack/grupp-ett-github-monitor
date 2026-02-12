# Monitor setup (detailed)

See [MONITORING_SETUP.md](https://github.com/itsimonfredlingjack/grupp-ett-github/blob/main/MONITORING_SETUP.md) in the original grupp-ett-github repo for the full guide. Summary for this repo:

- **Patterns** the wrapper maps to nodes: git/commit/push → github; pytest/npm test → actions; Writing/Editing → claude; Reviewing → jules; Reading/Fetching → jira.
- **Adding nodes:** extend `VALID_NODES` in `monitor/monitor_service.py`, add patterns in `claude-monitor-wrapper.sh`, and update the dashboard in `static/monitor.html`.
- **Logs:** wrapper writes to `~/.claude-monitor.log`; use `tail -f ~/.claude-monitor.log` to debug.
