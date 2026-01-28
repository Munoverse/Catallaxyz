import {
  deriveGlobalPda,
  executeTermination,
  getProgram,
  parsePublicKey,
  readTerminationLog,
  writeTerminationLog,
} from "./utils/termination";
import { createLogger } from "./utils/logger";
import { TerminationReason } from "../shared/types";

// AUDIT FIX v1.1.0: Use structured logging
const logger = createLogger('terminate-inactive');

async function main() {
  // AUDIT FIX v1.2.0: Validate MARKET_PUBKEY before use
  const marketKey = process.env.MARKET_PUBKEY;
  if (!marketKey) {
    throw new Error('MARKET_PUBKEY environment variable is required');
  }
  if (marketKey.length < 32 || marketKey.length > 44) {
    throw new Error('MARKET_PUBKEY appears to be invalid (wrong length)');
  }

  const { program, programId, provider } = getProgram();

  const market = parsePublicKey(marketKey, "MARKET_PUBKEY");
  const globalPda = deriveGlobalPda(programId);

  const globalAccount = await program.account.global.fetch(globalPda);
  const marketAccount = await program.account.market.fetch(market);

  const authority = provider.wallet.publicKey;
  if (!globalAccount.authority.equals(authority)) {
    throw new Error("Unauthorized: wallet is not global authority");
  }

  logger.info("Terminating inactive market", {
    market: market.toString(),
    authority: authority.toString(),
  });

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

  const entries = readTerminationLog();
  entries.push({
    market: market.toString(),
    tx,
    terminatedAt: new Date().toISOString(),
    executor: authority.toString(),
    reason: TerminationReason.Inactivity,
  });
  writeTerminationLog(entries);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Termination failed", err);
    process.exit(1);
  });
