# Synthetic reminder delivery simulation

Run on Node 22.23.1 in cloud development:
```sh
npm test
npm run delivery:synthetic
```

The example uses a disposable SQLite file, prints success/failure/uncertainty/quiet-hour summaries,
reopens the database and demonstrates that a crash reservation remains blocked the next day.
It removes its fixtures afterward. No actual messages are sent.

Tests exercise both stores for successful replay suppression, retry cooldown/caps, timeout and crash
recovery; SQLite process contention, a killed worker, failed SQL settlement, failed reservation,
stale previews, review races, permission denial, invalid policies and source failures.
CI runs all earlier examples plus this one and strict TypeScript checking. The PR records actual results.

See ADR 0008 for limits: fixed synthetic outcomes, no live timeout/cancellation/provider guarantee,
no persistent run summary, no scheduler or production integration.
