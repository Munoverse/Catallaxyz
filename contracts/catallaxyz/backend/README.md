# Backend Admin Jobs (DEPRECATED)

> **⚠️ DEPRECATED**: This folder contains legacy admin scripts. 
> The main backend at `/apps/backend/` now handles all these functions with better:
> - Error handling
> - Logging
> - API integration
> - Cron scheduling
>
> **Recommended**: Use `apps/backend` instead of these scripts.

This folder contains legacy backend/ops scripts that must be run by the global authority wallet.

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

### Local Log Storage

The job appends a record to `backend/db/termination_log.json`.
`reason` is a numeric enum (see `shared/types.ts`).

## Market Sync (On-chain → Database)

This script syncs on-chain market accounts into the Supabase/Postgres `markets` table.

```
export DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/admin.json

yarn sync-markets
```

## Markets API (Pagination)

```
GET /api/markets?query=...&status=all&sortBy=created_desc&limit=20&cursor=<token>
```

Returns:

```
{
  "markets": [...],
  "nextCursor": "<token or null>"
}
```

## Trade Settlement Signer (API)

The frontend can request settlement signatures from the Next.js API route:

`POST /api/settle-trade`

Required env var (server-side only):

```
SETTLEMENT_SIGNER_SECRET_KEY='[1,2,3,...]'
```

This must be a JSON array matching a Solana keypair secret key.
The API returns a 64-byte signature array and the signer public key.

## CLOB Orderbook (API)

Local orderbook API for matching and basic CLOB flow:

- `GET /api/clob/orderbook?market=<pubkey>&outcome=0|1`
- `POST /api/clob/orderbook`

Payload:

```
{
  "market": "<market_pubkey>",
  "outcome": 0,
  "side": "buy",
  "price": 500000,
  "size": 1000000,
  "maker": "<maker_pubkey>"
  "nonce": "1690000000000",
  "expiresAt": "1690000600000",
  "signature": "<base64>"
}
```

Orders are stored in `backend/db/orderbook.json` by default. Override path with:

```
CLOB_ORDERBOOK_PATH=/absolute/path/to/orderbook.json
```

If you want to use Supabase/Postgres instead of JSON, set:

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
```

When `DATABASE_URL` is present, the API uses Postgres tables (`orders`, `trades`).

Order signatures are required. The message to sign is:

```
v1|<market>|<outcome>|<side>|<price>|<size>|<maker>|<nonce>|<expiresAt>
```

Balance checks (on-chain) are enabled by default. To disable:

```
CLOB_ENFORCE_BALANCE_CHECK=false
```

Tick size validation (default 0.001):

```
CLOB_TICK_SIZE=0.001
```

Trade history API:

- `GET /api/clob/trades?market=<pubkey>&limit=20`
