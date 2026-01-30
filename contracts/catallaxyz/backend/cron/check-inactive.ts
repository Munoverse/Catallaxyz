import { Transaction } from "@solana/web3.js";
import {
  DEFAULT_INACTIVITY_SECONDS,
  deriveGlobalPda,
  buildTerminationInstruction,
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

// Default batch size for bundling multiple terminations into one transaction
// Max ~8 due to Solana transaction size/account limits (tested safe: 4-6)
const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 8;

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
  const batchSize = parseNum(
    "BATCH_SIZE",
    DEFAULT_BATCH_SIZE,
    { min: 1, max: MAX_BATCH_SIZE }
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

  // Limit to maxTerminations
  const toTerminate = candidates.slice(0, maxTerminations);
  
  if (toTerminate.length === 0) {
    logger.info("No markets to terminate");
    return;
  }

  // Validate all candidates first
  const validCandidates = toTerminate.filter((marketInfo) => {
    const marketAccount = marketInfo.account as unknown as MarketAccount;
    if (!marketAccount || typeof marketAccount.creator === 'undefined') {
      logger.warn('Skipping market with invalid structure', { market: marketInfo.publicKey.toString() });
      return false;
    }
    return true;
  });

  if (dryRun) {
    logger.info("DRY_RUN=true, would terminate markets", { 
      count: validCandidates.length,
      markets: validCandidates.map(m => m.publicKey.toString())
    });
    return;
  }

  let terminatedCount = 0;
  const logEntries = readTerminationLog();

  // Process in batches
  for (let i = 0; i < validCandidates.length; i += batchSize) {
    const batch = validCandidates.slice(i, i + batchSize);
    
    logger.info("Processing batch", { 
      batchNumber: Math.floor(i / batchSize) + 1,
      batchSize: batch.length,
      markets: batch.map(m => m.publicKey.toString())
    });

    try {
      // Build all instructions for this batch
      const instructions = await Promise.all(
        batch.map(async (marketInfo) => {
          const market = marketInfo.publicKey;
          const marketAccount = marketInfo.account as unknown as MarketAccount;
          return buildTerminationInstruction({
            program,
            programId,
            market,
            globalPda,
            globalAccount,
            authority,
            marketAccount,
          });
        })
      );

      // Create and send batch transaction
      const tx = new Transaction();
      instructions.forEach((ix) => tx.add(ix));

      const signature = await provider.sendAndConfirm(tx);

      logger.info("Batch termination successful", { 
        batchSize: batch.length,
        tx: signature,
        markets: batch.map(m => m.publicKey.toString())
      });

      // Log each terminated market
      const timestamp = new Date().toISOString();
      batch.forEach((marketInfo) => {
        logEntries.push({
          market: marketInfo.publicKey.toString(),
          tx: signature,
          terminatedAt: timestamp,
          executor: authority.toString(),
          reason: TerminationReason.Inactivity,
        });
      });
      
      terminatedCount += batch.length;
    } catch (err) {
      logger.error("Batch termination failed", err, { 
        markets: batch.map(m => m.publicKey.toString())
      });
      
      // Fallback: try individual terminations for this batch
      logger.info("Falling back to individual terminations for failed batch");
      for (const marketInfo of batch) {
        const market = marketInfo.publicKey;
        const marketAccount = marketInfo.account as unknown as MarketAccount;
        
        try {
          const ix = await buildTerminationInstruction({
            program,
            programId,
            market,
            globalPda,
            globalAccount,
            authority,
            marketAccount,
          });
          
          const singleTx = new Transaction().add(ix);
          const signature = await provider.sendAndConfirm(singleTx);
          
          logger.info("Individual termination successful", { market: market.toString(), tx: signature });
          logEntries.push({
            market: market.toString(),
            tx: signature,
            terminatedAt: new Date().toISOString(),
            executor: authority.toString(),
            reason: TerminationReason.Inactivity,
          });
          terminatedCount += 1;
        } catch (individualErr) {
          logger.error("Individual termination failed", individualErr, { market: market.toString() });
        }
      }
    }
  }

  if (terminatedCount > 0) {
    writeTerminationLog(logEntries);
  }

  logger.info("Termination complete", { 
    terminated: terminatedCount,
    total: validCandidates.length
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // AUDIT FIX v1.1.0: Use structured logging
    logger.error("Inactivity scan failed", err);
    process.exit(1);
  });
