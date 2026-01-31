import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";
import { setupProvider, printConfig } from "./utils/anchor-config.ts";

/**
 * Initialize Catallaxyz program with tUSDC
 * 
 * This script will:
 * 1. Read test-usdc-config.json to get tUSDC mint address
 * 2. Initialize Global account using tUSDC as base token
 * 3. Verify initialization results
 * 
 * Optional environment variables:
 * - KEEPER_PUBLIC_KEY: Set the keeper address (defaults to authority)
 * 
 * Usage:
 *   yarn ts-node scripts/initialize-with-tusdc.ts
 */

async function main() {
  console.log("🚀 Starting Catallaxyz program initialization (using tUSDC)\n");

  // Setup provider (reads from Anchor.toml)
  printConfig();
  const provider = setupProvider();

  // Check if test-usdc-config.json exists
  const configPath = "./test-usdc-config.json";
  if (!fs.existsSync(configPath)) {
    console.log("❌ test-usdc-config.json does not exist!");
    console.log("   Please run first: yarn create-test-usdc");
    console.log("   or manually create the config file");
    process.exit(1);
  }

  // Read tUSDC config
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const tUsdcMint = new PublicKey(config.testUsdcMint);

  console.log("📋 Configuration Info:");
  console.log("   Network:", config.network);
  console.log("   tUSDC Mint:", tUsdcMint.toString());
  console.log("   Decimals:", config.decimals);
  console.log("");
  
  console.log("🔑 Authority:", provider.wallet.publicKey.toString());
  console.log("");

  // Check SOL balance
  const connection = provider.connection;
  const balance = await connection.getBalance(provider.wallet.publicKey);
  console.log("💰 SOL Balance:", (balance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");
  
  if (balance < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Insufficient SOL balance! At least 0.1 SOL required");
    console.log("   Please run: solana airdrop 1");
    process.exit(1);
  }
  console.log("");

  // Load program
  const idlPath = "./target/idl/catallaxyz.json";
  if (!fs.existsSync(idlPath)) {
    console.log("❌ IDL file does not exist! Please run first: anchor build");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;

  console.log("📦 Program ID:", programId.toString());
  console.log("");

  // Calculate Global PDA
  const [globalPda, globalBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  console.log("🌐 Global PDA:", globalPda.toString());
  console.log("   Bump:", globalBump);
  console.log("");

  // Check if already initialized
  try {
    const existingGlobal = await program.account.global.fetch(globalPda);
    console.log("⚠️  Program is already initialized!");
    console.log("");
    console.log("📊 Current Configuration:");
    console.log("   Authority:", existingGlobal.authority.toString());
    console.log("   USDC Mint:", existingGlobal.usdcMint.toString());
    console.log("");
    
    if (existingGlobal.usdcMint.toString() === tUsdcMint.toString()) {
      console.log("✅ Already initialized with tUSDC, no need to repeat");
    } else {
      console.log("❌ Using a different mint address!");
      console.log("   Current: " + existingGlobal.usdcMint.toString());
      console.log("   Expected: " + tUsdcMint.toString());
      console.log("");
      console.log("💡 Solutions:");
      console.log("   1. Continue testing with current configuration");
      console.log("   2. Or redeploy program with new program ID");
    }
    process.exit(0);
  } catch (error: any) {
    if (!error.message.includes("Account does not exist")) {
      console.error("❌ Error checking account:", error);
      process.exit(1);
    }
    // Account does not exist, continue with initialization
    console.log("✅ Program not initialized, starting initialization...\n");
  }

  try {
    // Initialize program
    console.log("📝 Sending initialization transaction...");
    
    // Check for optional keeper from environment
    const keeperEnv = process.env.KEEPER_PUBLIC_KEY;
    const keeper = keeperEnv ? new PublicKey(keeperEnv) : null;
    if (keeper) {
      console.log("   Keeper:", keeper.toString());
    } else {
      console.log("   Keeper: (defaults to authority)");
    }
    
    const tx = await program.methods
        .initialize({
          usdcMint: tUsdcMint,
          keeper,
        })
      .accountsStrict({
        authority: provider.wallet.publicKey,
        global: globalPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Initialization successful!");
    console.log("📝 Transaction Signature:", tx);
    console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("");

    // Wait for confirmation
    await connection.confirmTransaction(tx, "confirmed");
    console.log("✅ Transaction confirmed");
    console.log("");

    // Verify initialization result
    console.log("🔍 Verifying initialization result...");
    const globalAccount = await program.account.global.fetch(globalPda);

    console.log("📊 Global Account Configuration:");
    console.log("   Authority:", globalAccount.authority.toString());
    console.log("   USDC Mint:", globalAccount.usdcMint.toString());
    console.log("   Bump:", globalAccount.bump);
    console.log("   Treasury Bump:", globalAccount.treasuryBump);
    console.log("   Platform Treasury Bump:", globalAccount.platformTreasuryBump);
    console.log("");

    // Verify mint address
    if (globalAccount.usdcMint.toString() === tUsdcMint.toString()) {
      console.log("✅ USDC Mint configured correctly!");
    } else {
      console.log("⚠️  USDC Mint mismatch!");
      console.log("   Expected:", tUsdcMint.toString());
      console.log("   Actual:", globalAccount.usdcMint.toString());
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("✨ Initialization complete!");
    console.log("=".repeat(60));
    console.log("");
    console.log("📝 Next Steps:");
    console.log("1. Initialize treasuries:");
    console.log("   anchor run init-platform-treasury");
    console.log("   anchor run init-treasury");
    console.log("");
    console.log("2. Configure frontend (frontend/.env):");
    console.log("   NEXT_PUBLIC_USDC_MINT_ADDRESS=" + tUsdcMint.toString());
    console.log("");
    console.log("3. Mint test tUSDC:");
    console.log("   yarn mint-test-usdc 10000");
    console.log("");
    console.log("4. Start testing!");

  } catch (error: any) {
    console.error("❌ Initialization failed:", error);
    
    if (error.logs) {
      console.log("\n📜 Program logs:");
      error.logs.forEach((log: string) => console.log("   ", log));
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unexpected error:", err);
    process.exit(1);
  });
