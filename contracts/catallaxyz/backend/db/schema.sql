-- Local admin DB schema for inactivity termination tracking
-- This is optional; the backend job also logs to termination_log.json.

create table if not exists market_termination_events (
  id integer primary key autoincrement,
  market_pubkey text not null,
  reason text not null,
  terminated_at text not null,
  executor_pubkey text not null,
  tx_signature text not null
);

create index if not exists idx_market_termination_events_market
  on market_termination_events (market_pubkey);
