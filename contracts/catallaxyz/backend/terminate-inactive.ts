import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import type { Catallaxyz } from "../target/types/catallaxyz";

type TerminationLogEntry = {
  market: string;
  tx: string;
  terminatedAt: string;
  executor: string;
  reason: "inactivity";
};

const LOG_PATH = path.resolve("backend/db/termination_log.json");

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
  const marketKey = process.env.MARKET_PUBKEY;
  if (!marketKey) {
    throw new Error("Missing env MARKET_PUBKEY");
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

  const market = new PublicKey(marketKey);

  const [global] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

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

  const globalAccount = await program.account.global.fetch(global);
  const marketAccount = await program.account.market.fetch(market);

  const authority = provider.wallet.publicKey;
  if (!globalAccount.authority.equals(authority)) {
    throw new Error("Unauthorized: wallet is not global authority");
  }

  const usdcMint = globalAccount.usdcMint as PublicKey;
  const creator = marketAccount.creator as PublicKey;

  const creatorUsdcAccount = process.env.CREATOR_USDC_ACCOUNT
    ? new PublicKey(process.env.CREATOR_USDC_ACCOUNT)
    : getAssociatedTokenAddressSync(usdcMint, creator, false, TOKEN_PROGRAM_ID);

  const adminUsdcAccount = process.env.ADMIN_USDC_ACCOUNT
    ? new PublicKey(process.env.ADMIN_USDC_ACCOUNT)
    : getAssociatedTokenAddressSync(usdcMint, authority, false, TOKEN_PROGRAM_ID);

  console.log("🚨 Terminate inactive market");
  console.log("  Market:", market.toString());
  console.log("  Authority:", authority.toString());

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

  const entries = readLog();
  entries.push({
    market: market.toString(),
    tx,
    terminatedAt: new Date().toISOString(),
    executor: authority.toString(),
    reason: "inactivity",
  });
  writeLog(entries);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Termination failed:", err);
    process.exit(1);
  });
