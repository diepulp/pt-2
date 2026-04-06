

Here's the exact sequence:

**1. Inventory — sort by memory, filter to node/tsserver:**
```bash
ps aux --sort=-%mem | grep -E 'node|tsserver' | grep -v grep | head -20
```

**2. Classify each process** by reading the output:

| Signal | Verdict |
|--------|---------|
| PID started yesterday (`Apr04`) | Stale — kill |
| PID started just now (`16:53`) | Current session — keep |
| Parent is `/usr/share/code/code` | VS Code — keep |
| `tsserver.js` on a `pts/` terminal | Old Claude LSP — kill |
| `mcp-remote`, `playwright-mcp`, etc. with old timestamps | Old MCP servers — kill |

**3. If unsure, check start time:**
```bash
ps -o pid,lstart,rss,cmd -p 42005
```

**4. Kill the stale PIDs in one shot:**
```bash
kill 42005 42004 42018 41993 9263 9281 9252 9101 9068
```

`kill` sends `SIGTERM` (graceful shutdown). If any survive, escalate with `kill -9 <pid>`.

**5. Verify:**
```bash
ps aux --sort=-%mem | grep -E 'node|tsserver' | grep -v grep | head -10
```

The key insight is **timestamp-based triage** — current session processes share a recent start time, everything older is fair game.