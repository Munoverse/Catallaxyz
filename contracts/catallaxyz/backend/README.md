# Backend Sync & Admin Jobs

This folder contains blockchain synchronization services and admin scripts.

## Sync Services

These services sync on-chain state to the PostgreSQL database for the off-chain CLOB and UI.

### Event Indexer (cron/sync-events.ts)

Indexes all contract events to the database. This is the primary sync service.

```bash
export DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export NEXT_PUBLIC_PROGRAM_ID=<program_id>

# Run once
SYNC_ONCE=true yarn sync-events

# Run continuously (default)
yarn sync-events
```

Events indexed:
- `MarketCreated`, `MarketSettled`, `MarketTerminated`, `MarketPaused`, `MarketResumed`
- `OrderFilled`, `OrderCancelled`, `OrdersMatched`
- `PositionSplit`, `PositionMerged`, `CtfTokensRedeemed`
- `NonceIncremented`
- `GlobalFeeRatesUpdated`, `GlobalTradingPaused`, `GlobalTradingUnpaused`

### Trade Sync (cron/sync-trades.ts)

Syncs `TradingFeeCollected` events for trade history.

```bash
yarn sync-trades
```

### Market Sync (sync-markets.ts)

Syncs all Market accounts to the database.

```bash
yarn sync-markets
```

### Global State Sync (sync-global.ts)

Syncs the Global account (fee rates, operators, trading status).

```bash
yarn sync-global
```

### User Nonce Sync (sync-user-nonces.ts)

Syncs UserNonce PDAs for CLOB order validation.

```bash
yarn sync-user-nonces
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANCHOR_PROVIDER_URL` | Yes | Solana RPC URL |
| `NEXT_PUBLIC_PROGRAM_ID` | Yes | Catallaxyz program ID |
| `ANCHOR_WALLET` | Admin only | Admin wallet for termination scripts |
| `SYNC_BATCH_SIZE` | No | Batch size for event fetching (default: 100) |
| `SYNC_INTERVAL_MS` | No | Sync interval in ms (default: 10000) |
| `DRY_RUN` | No | Skip database writes (default: false) |
| `SYNC_ONCE` | No | Run once and exit (default: false) |

## Recommended Cron Schedule

```cron
# Event indexer (every 10 seconds via pm2 or systemd)
*/10 * * * * * cd /path/to/backend && yarn sync-events

# Market sync (every 5 minutes)
*/5 * * * * cd /path/to/backend && yarn sync-markets

# Global state sync (every hour)
0 * * * * cd /path/to/backend && yarn sync-global

# Inactivity check (every 6 hours)
0 */6 * * * cd /path/to/backend && yarn check-inactive
```

---

## Admin Scripts (Require Authority Wallet)

This folder also contains admin scripts that must be run by the global authority wallet.

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
