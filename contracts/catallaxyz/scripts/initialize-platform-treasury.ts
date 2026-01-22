import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";

/**
 * Initialize Platform Treasury
 * 
 * This script will:
 * 1. Initialize the platform treasury token account
 * 2. This account collects all trading and creation fees
 * 3. Owned by the global PDA
 * 
 * Prerequisites:
 * - Program must be deployed
 * - Global account must be initialized (run initialize-with-tusdc.ts first)
 * 
 * Usage:
 *   yarn ts-node scripts/initialize-platform-treasury.ts
 */

async function main() {
  console.log("🚀 Initializing Platform Treasury\n");

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const connection = provider.connection;
  console.log("🔑 Authority:", provider.wallet.publicKey.toString());
  console.log("🌐 RPC Endpoint:", connection.rpcEndpoint);
  console.log("");

  // Check SOL balance
  const balance = await connection.getBalance(provider.wallet.publicKey);
  console.log("💰 SOL Balance:", (balance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");
  
  if (balance < 0.05 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Low SOL balance! At least 0.05 SOL recommended");
  }
  console.log("");

  // Load program
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

  // Calculate Global PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  console.log("🌐 Global PDA:", globalPda.toString());

  // Check if Global account exists
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

  // Calculate Platform Treasury PDA
  const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_treasury")],
    programId
  );

  console.log("🏦 Platform Treasury PDA:", platformTreasuryPda.toString());
  console.log("");

  // Check if already initialized
  try {
    const accountInfo = await connection.getAccountInfo(platformTreasuryPda);
    if (accountInfo && accountInfo.data.length > 0) {
      console.log("⚠️  Platform Treasury already initialized!");
      console.log("   Account exists with", accountInfo.data.length, "bytes");
      
      // Try to parse as token account
      try {
        const tokenAccount = await connection.getTokenAccountBalance(platformTreasuryPda);
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

  console.log("📝 Initializing Platform Treasury...");
  console.log("");

  try {
    // Initialize Platform Treasury
    const tx = await program.methods
      .initPlatformTreasury()
      .accountsStrict({
        authority: provider.wallet.publicKey,
        global: globalPda,
        platformTreasury: platformTreasuryPda,
        usdcMint: globalAccount.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Platform Treasury initialized!");
    console.log("📝 Transaction Signature:", tx);
    
    // Determine network for explorer link
    const isMainnet = connection.rpcEndpoint.includes("mainnet");
    const cluster = isMainnet ? "" : "?cluster=devnet";
    console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}${cluster}`);
    console.log("");

    // Wait for confirmation
    await connection.confirmTransaction(tx, "confirmed");
    console.log("✅ Transaction confirmed");
    console.log("");

    // Verify
    console.log("🔍 Verifying...");
    const accountInfo = await connection.getAccountInfo(platformTreasuryPda);
    
    if (accountInfo) {
      console.log("✅ Platform Treasury account created");
      console.log("   Address:", platformTreasuryPda.toString());
      console.log("   Owner:", accountInfo.owner.toString());
      console.log("   Size:", accountInfo.data.length, "bytes");
      
      try {
        const tokenBalance = await connection.getTokenAccountBalance(platformTreasuryPda);
        console.log("   Balance:", tokenBalance.value.uiAmount || 0, "USDC");
      } catch (e) {
        console.log("   Balance: 0 USDC");
      }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("✨ Platform Treasury initialization complete!");
    console.log("=".repeat(60));
    console.log("");
    console.log("📝 Next Steps:");
    console.log("1. Initialize VRF Treasury:");
    console.log("   yarn ts-node scripts/initialize-treasury.ts");
    console.log("");
    console.log("2. Start using the platform!");

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
