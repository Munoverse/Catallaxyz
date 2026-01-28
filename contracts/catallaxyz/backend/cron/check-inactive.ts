import {
  DEFAULT_INACTIVITY_SECONDS,
  deriveGlobalPda,
  executeTermination,
  getProgram,
  readTerminationLog,
  writeTerminationLog,
  MarketAccount,
} from "../utils/termination";
// AUDIT FIX v1.2.6: Use env-validation directly instead of deprecated wrappers
import { validateServiceEnv, parseBool, parseNum } from "../utils/env-validation";
import { createLogger } from "../utils/logger";
import { MarketStatus, TerminationReason } from "../../shared/types";

// AUDIT FIX v1.1.0: Use structured logging
const logger = createLogger('check-inactive');

// AUDIT FIX: Validate environment variables at startup
validateServiceEnv('checkInactive');

async function main() {
  // AUDIT FIX v1.2.6: Use parseBool/parseNum directly from env-validation
  if (!parseBool("ENABLE_INACTIVITY_TERMINATION", false)) {
    // AUDIT FIX v1.1.0: Use structured logging
    logger.info("Inactivity termination disabled. Set ENABLE_INACTIVITY_TERMINATION=true");
    return;
  }

  const { program, programId, provider } = getProgram();

  const globalPda = deriveGlobalPda(programId);

  const globalAccount = await program.account.global.fetch(globalPda);
  const authority = provider.wallet.publicKey;
  if (!globalAccount.authority.equals(authority)) {
    throw new Error("Unauthorized: wallet is not global authority");
  }

  const inactivitySeconds = parseNum(
    "INACTIVITY_TIMEOUT_SECONDS",
    DEFAULT_INACTIVITY_SECONDS,
    { min: 1 }
  );
  const nowTs = Math.floor(Date.now() / 1000);
  const maxTerminations = parseNum(
    "MAX_TERMINATIONS",
    10,
    { min: 0 }
  );
  const dryRun = parseBool("DRY_RUN", true);

  const markets = await program.account.market.all();
  // AUDIT FIX v1.2.0: Use proper type with runtime validation
  const candidates = markets.filter((m) => {
    const account = m.account as unknown as MarketAccount;
    // Validate account structure before using
    // AUDIT FIX v1.2.4: Use correct field name lastActivityTimestamp (not lastActivityTs)
    if (!account || typeof account.status === 'undefined' || typeof account.lastActivityTimestamp === 'undefined') {
      logger.warn('Invalid market account structure', { market: m.publicKey.toString() });
      return false;
    }
    return (
      account.status === MarketStatus.Active &&
      nowTs - Number(account.lastActivityTimestamp) >= inactivitySeconds
    );
  });

  // AUDIT FIX v1.1.0: Use structured logging
  logger.info("Found inactive markets", { count: candidates.length });

  let terminatedCount = 0;
  const logEntries = readTerminationLog();

  for (const marketInfo of candidates) {
    if (terminatedCount >= maxTerminations) {
      break;
    }

    const market = marketInfo.publicKey;
    // AUDIT FIX v1.2.0: Use proper type with runtime validation
    const marketAccount = marketInfo.account as unknown as MarketAccount;
    if (!marketAccount || typeof marketAccount.creator === 'undefined') {
      logger.warn('Skipping market with invalid structure', { market: market.toString() });
      continue;
    }

    logger.info("Processing inactive market", { market: market.toString() });

    if (dryRun) {
      logger.debug("DRY_RUN=true, skipping transaction");
      continue;
    }

    try {
      const tx = await executeTermination({
        program,
        programId,
        market,
        globalPda,
        globalAccount,
        authority,
        marketAccount,
      });

      logger.info("Termination successful", { market: market.toString(), tx });
      logEntries.push({
        market: market.toString(),
        tx,
        terminatedAt: new Date().toISOString(),
        executor: authority.toString(),
        reason: TerminationReason.Inactivity,
      });
      terminatedCount += 1;
    } catch (err) {
      logger.error("Termination failed", err, { market: market.toString() });
    }
  }

  if (!dryRun && terminatedCount > 0) {
    writeTerminationLog(logEntries);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // AUDIT FIX v1.1.0: Use structured logging
    logger.error("Inactivity scan failed", err);
    process.exit(1);
  });
