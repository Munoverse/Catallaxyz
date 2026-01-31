import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";
import { setupProvider, printConfig } from "./utils/anchor-config.ts";

/**
 * Devnet Initialization Script
 * 
 * This script will:
 * 1. Initialize Global account with Test USDC
 * 2. Initialize Platform Treasury
 * 3. Initialize Reward Treasury
 * 4. Initialize Creator Treasury
 * 5. Verify all configurations
 * 
 * Prerequisites:
 * - Program deployed to Devnet
 * - Test USDC mint created (run create-test-usdc.ts first)
 * - Anchor.toml configured for Devnet (cluster = "devnet")
 * - At least 2 SOL in deployer wallet
 * 
 * Environment variables:
 * - TEST_USDC_MINT: Address of the test USDC mint (required)
 * - KEEPER_PUBLIC_KEY: Set the keeper address (optional, defaults to authority)
 * 
 * Usage:
 *   TEST_USDC_MINT=<mint_address> yarn ts-node scripts/initialize-devnet.ts
 */

async function main() {
  console.log("=".repeat(70));
  console.log("🚀 CATALLAXYZ DEVNET INITIALIZATION");
  console.log("=".repeat(70));
  console.log("");

  // Get Test USDC mint from environment
  const testUsdcMintAddress = process.env.TEST_USDC_MINT;
  if (!testUsdcMintAddress) {
    console.log("❌ TEST_USDC_MINT environment variable not set!");
    console.log("");
    console.log("💡 First, create a test USDC mint:");
    console.log("   yarn ts-node scripts/create-test-usdc.ts");
    console.log("");
    console.log("   Then run with:");
    console.log("   TEST_USDC_MINT=<mint_address> yarn ts-node scripts/initialize-devnet.ts");
    process.exit(1);
  }

  const TEST_USDC_MINT = new PublicKey(testUsdcMintAddress);

  // Setup provider (reads from Anchor.toml)
  printConfig();
  const provider = setupProvider();
  
  const connection = provider.connection;
  
  // Verify we're on Devnet
  const endpoint = connection.rpcEndpoint;
  console.log("🌐 RPC Endpoint:", endpoint);
  
  if (endpoint.includes("mainnet")) {
    console.log("");
    console.log("❌ ERROR: Connected to Mainnet!");
    console.log("   This script is for Devnet only.");
    console.log("   For mainnet, use: yarn ts-node scripts/initialize-mainnet.ts");
    process.exit(1);
  }
  
  console.log("✅ Connected to Devnet");
  console.log("");

  console.log("🔑 Deployer Wallet:", provider.wallet.publicKey.toString());
  console.log("");

  // Check SOL balance
  const balance = await connection.getBalance(provider.wallet.publicKey);
  const solBalance = balance / anchor.web3.LAMPORTS_PER_SOL;
  
  console.log("💰 SOL Balance:", solBalance.toFixed(4), "SOL");
  
  if (balance < 2 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("");
    console.log("⚠️  Low SOL balance!");
    console.log("   Current:", solBalance.toFixed(4), "SOL");
    console.log("   Recommended: At least 2 SOL");
    console.log("");
    console.log("💡 Get devnet SOL:");
    console.log("   solana airdrop 2");
  } else {
    console.log("✅ Sufficient SOL balance");
  }
  console.log("");

  // Load program
  const idlPath = "./target/idl/catallaxyz.json";
  if (!fs.existsSync(idlPath)) {
    console.log("❌ IDL file not found!");
    console.log("   Please run: anchor build");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;

  console.log("📦 Program ID:", programId.toString());
  console.log("💵 Test USDC Mint:", TEST_USDC_MINT.toString());
  console.log("");

  // Verify program is deployed
  const programAccount = await connection.getAccountInfo(programId);
  if (!programAccount) {
    console.log("❌ Program not found!");
    console.log("   Please deploy first: anchor deploy");
    process.exit(1);
  }
  
  console.log("✅ Program deployed");
  console.log("");

  // Calculate PDAs
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );

  const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_treasury")],
    programId
  );

  const [rewardTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reward_treasury")],
    programId
  );

  const [creatorTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_treasury")],
    programId
  );

  console.log("📍 Program Derived Addresses:");
  console.log("   Global PDA:", globalPda.toString());
  console.log("   Platform Treasury:", platformTreasuryPda.toString());
  console.log("   Reward Treasury:", rewardTreasuryPda.toString());
  console.log("   Creator Treasury:", creatorTreasuryPda.toString());
  console.log("");

  console.log("✅ Starting initialization...");
  console.log("");

  // Step 1: Initialize Global
  console.log("─".repeat(70));
  console.log("Step 1/4: Initialize Global Account");
  console.log("─".repeat(70));
  console.log("");

  try {
    const existingGlobal = await program.account.global.fetch(globalPda);
    console.log("⚠️  Global account already initialized!");
    console.log("   Authority:", existingGlobal.authority.toString());
    console.log("   USDC Mint:", existingGlobal.usdcMint.toString());
    console.log("✅ Skipping...");
  } catch (error: any) {
    if (!error.message.includes("Account does not exist")) {
      console.error("❌ Error checking Global account:", error);
      process.exit(1);
    }
    
    console.log("📝 Initializing Global account...");
    
    const keeperEnv = process.env.KEEPER_PUBLIC_KEY;
    const keeper = keeperEnv ? new PublicKey(keeperEnv) : null;
    if (keeper) {
      console.log("   Keeper:", keeper.toString());
    }
    
    try {
      const tx = await program.methods
        .initialize({
          usdcMint: TEST_USDC_MINT,
          keeper,
        })
        .accountsStrict({
          authority: provider.wallet.publicKey,
          global: globalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Global initialized!");
      console.log("📝 Transaction:", tx);
      console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
      await connection.confirmTransaction(tx, "confirmed");
    } catch (error: any) {
      console.error("❌ Failed:", error.message);
      if (error.logs) {
        error.logs.forEach((log: string) => console.log("   ", log));
      }
      process.exit(1);
    }
  }
  
  console.log("");

  // Step 2: Initialize Platform Treasury
  console.log("─".repeat(70));
  console.log("Step 2/4: Initialize Platform Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const info = await connection.getAccountInfo(platformTreasuryPda);
    if (info && info.data.length > 0) {
      console.log("✅ Platform Treasury already initialized");
    } else {
      throw new Error("Not initialized");
    }
  } catch (error) {
    console.log("📝 Initializing Platform Treasury...");
    try {
      const globalAccount = await program.account.global.fetch(globalPda);
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
      console.log("📝 Transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");
    } catch (error: any) {
      console.error("❌ Failed:", error.message);
      process.exit(1);
    }
  }
  
  console.log("");

  // Step 3: Initialize Reward Treasury
  console.log("─".repeat(70));
  console.log("Step 3/4: Initialize Reward Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const info = await connection.getAccountInfo(rewardTreasuryPda);
    if (info && info.data.length > 0) {
      console.log("✅ Reward Treasury already initialized");
    } else {
      throw new Error("Not initialized");
    }
  } catch (error) {
    console.log("📝 Initializing Reward Treasury...");
    try {
      const globalAccount = await program.account.global.fetch(globalPda);
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
      console.log("📝 Transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");
    } catch (error: any) {
      console.error("❌ Failed:", error.message);
      process.exit(1);
    }
  }
  
  console.log("");

  // Step 4: Initialize Creator Treasury
  console.log("─".repeat(70));
  console.log("Step 4/4: Initialize Creator Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const info = await connection.getAccountInfo(creatorTreasuryPda);
    if (info && info.data.length > 0) {
      console.log("✅ Creator Treasury already initialized");
    } else {
      throw new Error("Not initialized");
    }
  } catch (error) {
    console.log("📝 Initializing Creator Treasury...");
    try {
      const globalAccount = await program.account.global.fetch(globalPda);
      const tx = await program.methods
        .initCreatorTreasury()
        .accountsStrict({
          authority: provider.wallet.publicKey,
          global: globalPda,
          creatorTreasury: creatorTreasuryPda,
          usdcMint: globalAccount.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Creator Treasury initialized!");
      console.log("📝 Transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");
    } catch (error: any) {
      console.error("❌ Failed:", error.message);
      process.exit(1);
    }
  }

  console.log("");

  // Final verification
  console.log("=".repeat(70));
  console.log("🔍 FINAL VERIFICATION");
  console.log("=".repeat(70));
  console.log("");

  const globalAccount = await program.account.global.fetch(globalPda);
  console.log("✅ Global Account");
  console.log("   Address:", globalPda.toString());
  console.log("   Authority:", globalAccount.authority.toString());
  console.log("   USDC Mint:", globalAccount.usdcMint.toString());
  console.log("");

  const checkBalance = async (name: string, address: PublicKey) => {
    try {
      const balance = await connection.getTokenAccountBalance(address);
      console.log(`✅ ${name}`);
      console.log("   Address:", address.toString());
      console.log("   Balance:", balance.value.uiAmount || 0, "USDC");
    } catch {
      console.log(`⚠️  ${name} - Could not read balance`);
    }
    console.log("");
  };

  await checkBalance("Platform Treasury", platformTreasuryPda);
  await checkBalance("Reward Treasury", rewardTreasuryPda);
  await checkBalance("Creator Treasury", creatorTreasuryPda);

  // Check final SOL balance
  const finalBalance = await connection.getBalance(provider.wallet.publicKey);
  const finalSol = finalBalance / anchor.web3.LAMPORTS_PER_SOL;
  const used = solBalance - finalSol;
  
  console.log("💰 SOL Usage:");
  console.log("   Initial:", solBalance.toFixed(4), "SOL");
  console.log("   Final:", finalSol.toFixed(4), "SOL");
  console.log("   Used:", used.toFixed(4), "SOL");
  console.log("");

  console.log("=".repeat(70));
  console.log("✨ DEVNET INITIALIZATION COMPLETE!");
  console.log("=".repeat(70));
  console.log("");
  console.log("📝 Environment Variables for Backend:");
  console.log("");
  console.log(`PROGRAM_ID=${programId.toString()}`);
  console.log(`USDC_MINT_ADDRESS=${TEST_USDC_MINT.toString()}`);
  console.log("");
  console.log("📝 Next Steps:");
  console.log("1. Set Keeper (if not set):");
  console.log("   KEEPER_PUBLIC_KEY=<pubkey> yarn ts-node scripts/set-keeper.ts");
  console.log("");
  console.log("2. Mint test USDC to users:");
  console.log("   yarn ts-node scripts/mint-test-usdc.ts <wallet_address> <amount>");
  console.log("");
  console.log("3. Verify configuration:");
  console.log("   yarn ts-node scripts/check-program-config.ts");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  });
