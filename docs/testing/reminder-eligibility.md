# Synthetic reminder eligibility

Run in cloud development on Node 22.23.1:
```sh
npm test
npm run eligibility:synthetic
```

The example prints quiet_hours at 22:00 Asia/Kolkata and eligible at 07:00.
It creates synthetic in-memory commitments and only previews; it never reserves or sends.
CI also runs both earlier examples and strict TypeScript checking.

Tests cover interval boundaries including midnight, a fractional-offset zone, DST gap/fold,
invalid and accessor policies, read-only previews, SQLite reopening, expired snoozes, state reasons,
stale previews, UTC duplicate limits under timezone changes, attempts/cooldowns, recovery decisions,
approval denial, clock rollback, corrupt/unavailable storage and transaction rollback.

See ADR 0007 for exact semantics. The PR records actual cloud results.
No production integration, scheduler, preference persistence or next-delivery guarantee is included.
