# SQLite storage verification

Run `npm test` in GitHub Actions or a cloud environment with Node 22.23.1.
No dependency installation is needed. The SQLite experimental warning is expected
with this pinned runtime. Tests use synthetic data in temporary directories only.

The existing 30 memory tests are retained with their failure injection adapted to
the transactional Store interface. Fifteen additional storage tests cover:

- A new process reading committed facts, commitment states and reminder history.
- Two processes preserving both updates and reserving exactly one reminder.
- Killing a process after its SQL write but before commit, then reopening.
- Lock timeout, SQL abort, commit failure, rollback and subsequent recovery.
- Permission denials, invalid state, callback exceptions and defensive copies.
- Missing/empty/corrupt databases, unsupported versions, missing singleton state.
- Read-only and closed handles; private file permissions and symlink rejection.
- Snapshot size and revision bounds.
- Consistent backup/restore, refusal to overwrite, read-only restored handles,
  reminder deduplication and uncertain-delivery suppression after reopening.

Cloud CI results for the exact commit are recorded in the PR. No local execution
of this new suite or production verification is claimed. SQL abort/lock tests
exercise failure handling; they do not simulate every OS/disk failure or certify
hardware power-loss durability.

## Synthetic example (cloud only)

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Memory } from '../../src/memory.ts';
import { SqliteStore } from '../../src/sqlite-store.ts';

const dir = mkdtempSync(join(tmpdir(), 'alfred-demo-'));
const path = join(dir, 'memory.sqlite');
const approved = { approved: true } as const; // trusted synthetic test host only
const store = SqliteStore.create(path, approved);
new Memory(store).remember({ id: 'synthetic-fact', text: 'The fictional user likes blue' }, approved);
store.backupTo(join(dir, 'backup.sqlite'), approved);
store.close();
const reopened = SqliteStore.open(path);
try { console.log(new Memory(reopened).read().facts.length); } // 1
finally { reopened.close(); }
```

In real host code, never derive approval from a model/client-provided boolean.
Do not point this prototype at any OpenClaw database or private memory directory.
Read ADR 0004 for restore restrictions and requirements before future integration.
