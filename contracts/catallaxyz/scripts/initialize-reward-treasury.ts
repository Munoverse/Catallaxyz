import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";

/**
 * Initialize Reward Treasury
 *
 * This script will:
 * 1. Initialize the reward treasury token account
 * 2. This account collects the liquidity rewards share of trading fees
 * 3. Owned by the global PDA
 *
 * Prerequisites:
 * - Program must be deployed
 * - Global account must be initialized (run initialize-with-tusdc.ts first)
 *
 * Usage:
 *   yarn ts-node scripts/initialize-reward-treasury.ts
 */

async function main() {
  console.log("🚀 Initializing Reward Treasury\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const connection = provider.connection;
  console.log("🔑 Authority:", provider.wallet.publicKey.toString());
  console.log("🌐 RPC Endpoint:", connection.rpcEndpoint);
  console.log("");

  const balance = await connection.getBalance(provider.wallet.publicKey);
  console.log("💰 SOL Balance:", (balance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");

  if (balance < 0.05 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Low SOL balance! At least 0.05 SOL recommended");
  }
  console.log("");

  const idlPath = "./target/idl/catallaxyz.json";
  if (!fs.existsSync(idlPath)) {
    console.log("❌ IDL file not found! Please run: anchor build");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;

  console.log("📦 Program ID:", programId.toString());
  console.log("");

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  console.log("🌐 Global PDA:", globalPda.toString());

  let globalAccount;
  try {
    globalAccount = await program.account.global.fetch(globalPda);
    console.log("✅ Global account found");
    console.log("   USDC Mint:", globalAccount.usdcMint.toString());
    console.log("");
  } catch (error) {
    console.log("❌ Global account not initialized!");
    console.log("   Please run: yarn ts-node scripts/initialize-with-tusdc.ts");
    console.log("   or: yarn ts-node scripts/initialize-mainnet.ts (for mainnet)");
    process.exit(1);
  }

  const [rewardTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_treasury")],
    programId
  );

  console.log("🎁 Reward Treasury PDA:", rewardTreasuryPda.toString());
  console.log("");

  try {
    const accountInfo = await connection.getAccountInfo(rewardTreasuryPda);
    if (accountInfo && accountInfo.data.length > 0) {
      console.log("⚠️  Reward Treasury already initialized!");
      console.log("   Account exists with", accountInfo.data.length, "bytes");

      try {
        const tokenAccount = await connection.getTokenAccountBalance(rewardTreasuryPda);
        console.log("   Balance:", tokenAccount.value.uiAmount || 0, "USDC");
      } catch (e) {
        console.log("   (Could not parse token account balance)");
      }

      console.log("");
      console.log("✅ No action needed");
      process.exit(0);
    }
  } catch (error) {
    // Account doesn't exist, continue
  }

  console.log("📝 Initializing Reward Treasury...");
  console.log("");

  try {
    const tx = await program.methods
      .initRewardTreasury()
      .accountsStrict({
        authority: provider.wallet.publicKey,
        global: globalPda,
        rewardTreasury: rewardTreasuryPda,
        usdcMint: globalAccount.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Reward Treasury initialized!");
    console.log("📝 Transaction Signature:", tx);

    const isMainnet = connection.rpcEndpoint.includes("mainnet");
    const cluster = isMainnet ? "" : "?cluster=devnet";
    console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}${cluster}`);
    console.log("");

    await connection.confirmTransaction(tx, "confirmed");
    console.log("✅ Transaction confirmed");
    console.log("");

    console.log("🔍 Verifying...");
    const accountInfo = await connection.getAccountInfo(rewardTreasuryPda);

    if (accountInfo) {
      console.log("✅ Reward Treasury account created");
      console.log("   Address:", rewardTreasuryPda.toString());
      console.log("   Owner:", accountInfo.owner.toString());
      console.log("   Size:", accountInfo.data.length, "bytes");

      try {
        const tokenBalance = await connection.getTokenAccountBalance(rewardTreasuryPda);
        console.log("   Balance:", tokenBalance.value.uiAmount || 0, "USDC");
      } catch (e) {
        console.log("   Balance: 0 USDC");
      }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("✨ Reward Treasury initialization complete!");
    console.log("=".repeat(60));
    console.log("");
    console.log("📝 Next Steps:");
    console.log("1. Initialize Platform Treasury:");
    console.log("   yarn ts-node scripts/initialize-platform-treasury.ts");
    console.log("");
    console.log("2. Initialize VRF Treasury:");
    console.log("   yarn ts-node scripts/initialize-treasury.ts");
  } catch (error: any) {
    console.error("❌ Initialization failed:", error.message);

    if (error.logs) {
      console.log("\n📜 Program logs:");
      error.logs.forEach((log: string) => console.log("   ", log));
    }

    console.log("");
    console.log("💡 Troubleshooting:");
    console.log("   - Ensure Global account is initialized");
    console.log("   - Check SOL balance (need ~0.05 SOL)");
    console.log("   - Verify you're the authority of the Global account");

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unexpected error:", err);
    process.exit(1);
  });
