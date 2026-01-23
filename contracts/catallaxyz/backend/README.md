# Backend Admin Jobs

This folder contains backend/ops scripts that must be run by the global authority wallet.

## Inactivity Termination

`terminate-inactive.ts` triggers `terminate_if_inactive` for a specific market.

### Usage

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/admin.json
export MARKET_PUBKEY=<market_pubkey>

yarn terminate-inactive
```

Optional overrides:

- `ADMIN_USDC_ACCOUNT`: reward recipient token account (defaults to admin ATA)
- `CREATOR_USDC_ACCOUNT`: creator token account (defaults to creator ATA)

## Inactivity Scan (Cron)

`cron/check-inactive.ts` scans all markets and terminates inactive ones.

### Enable/Disable

Set `ENABLE_INACTIVITY_TERMINATION=true` to enable. When disabled, the script exits without changes.

### Usage

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/admin.json
export ENABLE_INACTIVITY_TERMINATION=true

# Optional
export DRY_RUN=false
export MAX_TERMINATIONS=10
export INACTIVITY_TIMEOUT_SECONDS=604800

yarn check-inactive
```

Notes:
- `DRY_RUN` defaults to true to avoid accidental terminations.
- Use `MAX_TERMINATIONS` to cap daily/cron executions.

### Local DB

The job appends a record to `backend/db/termination_log.json`. If you use a real
database, apply `backend/db/schema.sql` and insert a row with the same fields.
