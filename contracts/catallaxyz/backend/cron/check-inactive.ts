import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import type { Catallaxyz } from "../../target/types/catallaxyz";

type TerminationLogEntry = {
  market: string;
  tx: string;
  terminatedAt: string;
  executor: string;
  reason: "inactivity";
};

const LOG_PATH = path.resolve("backend/db/termination_log.json");
const DEFAULT_INACTIVITY_SECONDS = 7 * 24 * 60 * 60;

const loadIdl = () => {
  const idlPath = path.resolve("target/idl/catallaxyz.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error("IDL not found. Run: anchor build");
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
};

const readLog = (): TerminationLogEntry[] => {
  if (!fs.existsSync(LOG_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(LOG_PATH, "utf8").trim();
  if (!raw) {
    return [];
  }
  return JSON.parse(raw) as TerminationLogEntry[];
};

const writeLog = (entries: TerminationLogEntry[]) => {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
};

async function main() {
  if (process.env.ENABLE_INACTIVITY_TERMINATION !== "true") {
    console.log("⏸️  Inactivity termination disabled. Set ENABLE_INACTIVITY_TERMINATION=true");
    return;
  }

  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com",
    "confirmed"
  );

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = loadIdl();
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;

  const [global] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  const globalAccount = await program.account.global.fetch(global);
  const authority = provider.wallet.publicKey;
  if (!globalAccount.authority.equals(authority)) {
    throw new Error("Unauthorized: wallet is not global authority");
  }

  const inactivitySeconds = Number(process.env.INACTIVITY_TIMEOUT_SECONDS || DEFAULT_INACTIVITY_SECONDS);
  const nowTs = Math.floor(Date.now() / 1000);
  const maxTerminations = Number(process.env.MAX_TERMINATIONS || 10);
  const dryRun = process.env.DRY_RUN !== "false";

  const markets = await program.account.market.all();
  const candidates = markets.filter((m) => {
    const account: any = m.account;
    return (
      account.status === 0 &&
      nowTs - Number(account.lastActivityTs) >= inactivitySeconds
    );
  });

  console.log(`🔎 Found ${candidates.length} inactive markets`);

  let terminatedCount = 0;
  const logEntries = readLog();

  for (const marketInfo of candidates) {
    if (terminatedCount >= maxTerminations) {
      break;
    }

    const market = marketInfo.publicKey;
    const marketAccount: any = marketInfo.account;

    const [marketUsdcVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("market_vault"), market.toBuffer()],
      programId
    );
    const [platformTreasury] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform_treasury")],
      programId
    );
    const [creatorTreasury] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator_treasury")],
      programId
    );

    const usdcMint = globalAccount.usdcMint as PublicKey;
    const creator = marketAccount.creator as PublicKey;

    const creatorUsdcAccount = process.env.CREATOR_USDC_ACCOUNT
      ? new PublicKey(process.env.CREATOR_USDC_ACCOUNT)
      : getAssociatedTokenAddressSync(usdcMint, creator, false, TOKEN_PROGRAM_ID);

    const adminUsdcAccount = process.env.ADMIN_USDC_ACCOUNT
      ? new PublicKey(process.env.ADMIN_USDC_ACCOUNT)
      : getAssociatedTokenAddressSync(usdcMint, authority, false, TOKEN_PROGRAM_ID);

    console.log("🚨 Inactive market:", market.toString());

    if (dryRun) {
      console.log("  DRY_RUN=true, skipping transaction");
      continue;
    }

    try {
      const tx = await program.methods
        .terminateIfInactive()
        .accounts({
          global,
          authority,
          market,
          marketUsdcVault,
          platformTreasury,
          creatorTreasury,
          creatorUsdcAccount,
          callerUsdcAccount: adminUsdcAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("✅ Transaction:", tx);
      logEntries.push({
        market: market.toString(),
        tx,
        terminatedAt: new Date().toISOString(),
        executor: authority.toString(),
        reason: "inactivity",
      });
      terminatedCount += 1;
    } catch (err) {
      console.error("❌ Termination failed:", err);
    }
  }

  if (!dryRun && terminatedCount > 0) {
    writeLog(logEntries);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Inactivity scan failed:", err);
    process.exit(1);
  });
