import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";
import { setupProvider, getAnchorConfig, printConfig } from "./utils/anchor-config.js";

/**
 * Check the current configuration of the program
 * Display the status of the Global account, including the configured USDC mint address
 * 
 * Usage:
 *   yarn ts-node scripts/check-program-config.ts
 */

async function main() {
  console.log("🔍 Checking Catallaxyz program configuration...\n");

  // Setup provider (reads from Anchor.toml)
  printConfig();
  const provider = setupProvider();
  const connection = provider.connection;
  const config = getAnchorConfig();

  // Load program IDL
  const idlPath = "./target/idl/catallaxyz.json";
  if (!fs.existsSync(idlPath)) {
    console.log("❌ IDL file does not exist! Please run first: anchor build");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);

  console.log("📋 Program Information:");
  console.log("   Program ID:", programId.toString());
  console.log("   Network:", config.cluster);
  console.log("");

  // Create program instance
  const program = new Program(idl, provider) as Program<Catallaxyz>;

  // Calculate Global PDA
  const [globalPda, globalBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  console.log("🌐 Global PDA:", globalPda.toString());
  console.log("");

  try {
    // Fetch Global account data
    const globalAccount = await program.account.global.fetch(globalPda);

    console.log("✅ Program is initialized!");
    console.log("");
    console.log("📊 Global Account Configuration:");
    console.log("   Authority:", globalAccount.authority.toString());
    console.log("   USDC Mint:", globalAccount.usdcMint.toString());
    console.log("   Bump:", globalAccount.bump);
    console.log("   Treasury Bump:", globalAccount.treasuryBump);
    console.log("   Platform Treasury Bump:", globalAccount.platformTreasuryBump);
    console.log("");
    console.log("💰 Fee Statistics:");
    console.log("   Total Fees Collected (SOL):", 
      (globalAccount.totalFeesCollected.toNumber() / anchor.web3.LAMPORTS_PER_SOL).toFixed(4), "SOL");
    console.log("   Total Trading Fees (USDC):", 
      (globalAccount.totalTradingFeesCollected.toNumber() / 1_000_000).toFixed(2), "USDC");
    console.log("   Total Creation Fees (USDC):", 
      (globalAccount.totalCreationFeesCollected.toNumber() / 1_000_000).toFixed(2), "USDC");
    console.log("");

    // Check if using test USDC
    const configPath = "./test-usdc-config.json";
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const testUsdcMint = config.testUsdcMint;
      
      if (globalAccount.usdcMint.toString() === testUsdcMint) {
        console.log("✅ Currently using test USDC (tUSDC)");
        console.log("   This is the correct devnet configuration");
      } else {
        console.log("⚠️  Current USDC mint does not match the one in test-usdc-config.json");
        console.log("   In config file: " + testUsdcMint);
        console.log("   In program: " + globalAccount.usdcMint.toString());
      }
    } else {
      // Check if using mainnet USDC
      const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      if (globalAccount.usdcMint.toString() === MAINNET_USDC) {
        console.log("💎 Currently using mainnet USDC");
        console.log("   Suitable for mainnet-beta environment");
      } else {
        console.log("ℹ️  Currently using custom token mint");
      }
    }

    console.log("");
    console.log("🏦 Treasury Addresses:");
    
    // Calculate Treasury PDA (VRF fees)
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      programId
    );
    console.log("   VRF Treasury:", treasuryPda.toString());
    
    // Calculate Platform Treasury PDA (trading & creation fees)
    const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform_treasury")],
      programId
    );
    console.log("   Platform Treasury:", platformTreasuryPda.toString());

    // Check if treasuries are initialized
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      const platformTreasuryAccount = await connection.getAccountInfo(platformTreasuryPda);
      
      console.log("");
      console.log("🔐 Treasury Status:");
      console.log("   VRF Treasury:", treasuryAccount ? "✅ Initialized" : "❌ Not initialized");
      console.log("   Platform Treasury:", platformTreasuryAccount ? "✅ Initialized" : "❌ Not initialized");

      if (!treasuryAccount) {
        console.log("");
        console.log("⚠️  VRF Treasury not initialized!");
        console.log("   Run: anchor run init-treasury");
      }
      
      if (!platformTreasuryAccount) {
        console.log("");
        console.log("⚠️  Platform Treasury not initialized!");
        console.log("   Run: anchor run init-platform-treasury");
      }
    } catch (err) {
      console.log("");
      console.log("⚠️  Cannot check treasury status:", err);
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("✨ Configuration check complete!");
    console.log("=".repeat(60));

  } catch (error: any) {
    if (error.message.includes("Account does not exist")) {
      console.log("❌ Program is not initialized yet!");
      console.log("");
      console.log("📝 Initialization Steps:");
      console.log("1. Determine the USDC mint address to use:");
      console.log("   - Devnet testing: Use testUsdcMint from test-usdc-config.json");
      console.log("   - Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      console.log("");
      console.log("2. Create initialization script or call initialize instruction in tests");
      console.log("");
      
      // Check if test USDC config exists
      const configPath = "./test-usdc-config.json";
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        console.log("💡 Suggested test USDC mint:");
        console.log("   " + config.testUsdcMint);
      }
    } else {
      console.error("❌ Error:", error);
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
