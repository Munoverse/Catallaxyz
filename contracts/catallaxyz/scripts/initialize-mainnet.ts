import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";

/**
 * Mainnet Initialization Script
 * 
 * This script will:
 * 1. Initialize Global account with Mainnet USDC
 * 2. Initialize Platform Treasury
 * 3. Initialize Reward Treasury
 * 4. Initialize Creator Treasury
 * 5. Initialize VRF Treasury
 * 6. Verify all configurations
 * 
 * ⚠️  CRITICAL: Mainnet Deployment
 * - Ensure you have sufficient SOL (~5-10 SOL recommended)
 * - Verify the Program ID matches your deployed program
 * - Double-check the keypair is correct
 * - This will use REAL USDC on Mainnet!
 * 
 * Prerequisites:
 * - Program deployed to Mainnet
 * - Solana CLI configured for Mainnet
 * - At least 5 SOL in deployer wallet
 * 
 * Environment Setup:
 *   export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com
 *   export ANCHOR_WALLET=~/.config/solana/mainnet-deployer.json
 * 
 * Usage:
 *   yarn ts-node scripts/initialize-mainnet.ts
 */

// Mainnet USDC mint address
const MAINNET_USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

async function main() {
  console.log("=".repeat(70));
  console.log("🚀 CATALLAXYZ MAINNET INITIALIZATION");
  console.log("=".repeat(70));
  console.log("");
  console.log("⚠️  WARNING: This will initialize the program on MAINNET!");
  console.log("   - Using REAL USDC");
  console.log("   - Transactions are IRREVERSIBLE");
  console.log("   - Ensure you have backed up your keypair");
  console.log("");

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const connection = provider.connection;
  
  // Verify we're on Mainnet
  const endpoint = connection.rpcEndpoint;
  console.log("🌐 RPC Endpoint:", endpoint);
  
  if (!endpoint.includes("mainnet")) {
    console.log("");
    console.log("❌ ERROR: Not connected to Mainnet!");
    console.log("   Current endpoint:", endpoint);
    console.log("");
    console.log("💡 To connect to Mainnet:");
    console.log("   export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com");
    console.log("   # Or use a paid RPC provider (Helius, QuickNode, etc.)");
    process.exit(1);
  }
  
  console.log("✅ Connected to Mainnet");
  console.log("");

  console.log("🔑 Deployer Wallet:", provider.wallet.publicKey.toString());
  console.log("");

  // Check SOL balance
  const balance = await connection.getBalance(provider.wallet.publicKey);
  const solBalance = balance / anchor.web3.LAMPORTS_PER_SOL;
  
  console.log("💰 SOL Balance:", solBalance.toFixed(4), "SOL");
  
  if (balance < 5 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("");
    console.log("❌ Insufficient SOL balance!");
    console.log("   Current:", solBalance.toFixed(4), "SOL");
    console.log("   Required: At least 5 SOL");
    console.log("   Recommended: 10+ SOL for safety");
    console.log("");
    console.log("💡 Please add more SOL to your wallet:");
    console.log("   - Transfer from an exchange");
    console.log("   - Or use another funded wallet");
    process.exit(1);
  }
  
  if (balance < 10 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Balance is less than 10 SOL (recommended amount)");
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
  console.log("");

  // Verify program is deployed
  const programAccount = await connection.getAccountInfo(programId);
  if (!programAccount) {
    console.log("❌ Program not found on Mainnet!");
    console.log("   Please deploy first: anchor deploy --provider.cluster mainnet");
    process.exit(1);
  }
  
  console.log("✅ Program deployed");
  console.log("   Executable:", programAccount.executable);
  console.log("   Owner:", programAccount.owner.toString());
  console.log("");

  // Calculate PDAs
  const [globalPda, globalBump] = PublicKey.findProgramAddressSync(
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

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    programId
  );

  console.log("📍 Program Derived Addresses:");
  console.log("   Global PDA:", globalPda.toString());
  console.log("   Platform Treasury:", platformTreasuryPda.toString());
  console.log("   Reward Treasury:", rewardTreasuryPda.toString());
  console.log("   Creator Treasury:", creatorTreasuryPda.toString());
  console.log("   VRF Treasury:", treasuryPda.toString());
  console.log("");

  console.log("💵 Mainnet USDC:");
  console.log("   Mint:", MAINNET_USDC_MINT.toString());
  console.log("");

  // Confirmation prompt
  console.log("=".repeat(70));
  console.log("⚠️  FINAL CONFIRMATION");
  console.log("=".repeat(70));
  console.log("");
  console.log("This script will:");
  console.log("  1. Initialize Global account with Mainnet USDC");
  console.log("  2. Initialize Platform Treasury");
  console.log("  3. Initialize Reward Treasury");
  console.log("  4. Initialize Creator Treasury");
  console.log("  5. Initialize VRF Treasury");
  console.log("");
  console.log("Deployer:", provider.wallet.publicKey.toString());
  console.log("Network: MAINNET");
  console.log("SOL Balance:", solBalance.toFixed(4), "SOL");
  console.log("");
  console.log("⚠️  Press Ctrl+C now to cancel, or wait 10 seconds to continue...");
  console.log("");

  // Wait 10 seconds
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log("✅ Starting initialization...");
  console.log("");

  const settlementSigner = new PublicKey(
    process.env.SETTLEMENT_SIGNER_PUBLIC_KEY || provider.wallet.publicKey.toString()
  );

  // Step 1: Initialize Global
  console.log("─".repeat(70));
  console.log("Step 1/5: Initialize Global Account");
  console.log("─".repeat(70));
  console.log("");

  try {
    const existingGlobal = await program.account.global.fetch(globalPda);
    console.log("⚠️  Global account already initialized!");
    console.log("   Authority:", existingGlobal.authority.toString());
    console.log("   USDC Mint:", existingGlobal.usdcMint.toString());
    console.log("");
    
    if (existingGlobal.usdcMint.toString() !== MAINNET_USDC_MINT.toString()) {
      console.log("❌ ERROR: Using wrong USDC mint!");
      console.log("   Expected:", MAINNET_USDC_MINT.toString());
      console.log("   Actual:", existingGlobal.usdcMint.toString());
      process.exit(1);
    }
    
    console.log("✅ Global account correctly configured");
  } catch (error: any) {
    if (!error.message.includes("Account does not exist")) {
      console.error("❌ Error checking Global account:", error);
      process.exit(1);
    }
    
    console.log("📝 Initializing Global account...");
    try {
      const tx = await program.methods
        .initialize({
          usdcMint: MAINNET_USDC_MINT,
          settlementSigner,
        })
        .accountsStrict({
          authority: provider.wallet.publicKey,
          global: globalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Global initialized!");
      console.log("📝 Transaction:", tx);
      console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}`);
      console.log("");

      await connection.confirmTransaction(tx, "confirmed");
      console.log("✅ Confirmed");
      
      // Verify
      const globalAccount = await program.account.global.fetch(globalPda);
      console.log("📊 Configuration:");
      console.log("   Authority:", globalAccount.authority.toString());
      console.log("   USDC Mint:", globalAccount.usdcMint.toString());
      console.log("   Bump:", globalAccount.bump);
    } catch (error: any) {
      console.error("❌ Failed to initialize Global:", error.message);
      if (error.logs) {
        console.log("\n📜 Program logs:");
        error.logs.forEach((log: string) => console.log("   ", log));
      }
      process.exit(1);
    }
  }
  
  console.log("");

  // Step 2: Initialize Platform Treasury
  console.log("─".repeat(70));
  console.log("Step 2/5: Initialize Platform Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const platformTreasuryInfo = await connection.getAccountInfo(platformTreasuryPda);
    if (platformTreasuryInfo && platformTreasuryInfo.data.length > 0) {
      console.log("✅ Platform Treasury already initialized");
      const balance = await connection.getTokenAccountBalance(platformTreasuryPda);
      console.log("   Balance:", balance.value.uiAmount || 0, "USDC");
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
      console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}`);
      console.log("");

      await connection.confirmTransaction(tx, "confirmed");
      console.log("✅ Confirmed");
    } catch (error: any) {
      console.error("❌ Failed to initialize Platform Treasury:", error.message);
      if (error.logs) {
        console.log("\n📜 Program logs:");
        error.logs.forEach((log: string) => console.log("   ", log));
      }
      process.exit(1);
    }
  }
  
  console.log("");

  // Step 3: Initialize Reward Treasury
  console.log("─".repeat(70));
  console.log("Step 3/5: Initialize Reward Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const rewardInfo = await connection.getAccountInfo(rewardTreasuryPda);
    if (rewardInfo && rewardInfo.data.length > 0) {
      console.log("✅ Reward Treasury already initialized");
      const balance = await connection.getTokenAccountBalance(rewardTreasuryPda);
      console.log("   Balance:", balance.value.uiAmount || 0, "USDC");
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
      console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}`);
      console.log("");

      await connection.confirmTransaction(tx, "confirmed");
      console.log("✅ Confirmed");
    } catch (error: any) {
      console.error("❌ Failed to initialize Reward Treasury:", error.message);
      if (error.logs) {
        console.log("\n📜 Program logs:");
        error.logs.forEach((log: string) => console.log("   ", log));
      }
      process.exit(1);
    }
  }
  
  console.log("");

  // Step 4: Initialize Creator Treasury
  console.log("─".repeat(70));
  console.log("Step 4/5: Initialize Creator Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const creatorInfo = await connection.getAccountInfo(creatorTreasuryPda);
    if (creatorInfo && creatorInfo.data.length > 0) {
      console.log("✅ Creator Treasury already initialized");
      const balance = await connection.getTokenAccountBalance(creatorTreasuryPda);
      console.log("   Balance:", balance.value.uiAmount || 0, "USDC");
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
      console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}`);
      console.log("");

      await connection.confirmTransaction(tx, "confirmed");
      console.log("✅ Confirmed");
    } catch (error: any) {
      console.error("❌ Failed to initialize Creator Treasury:", error.message);
      if (error.logs) {
        console.log("\n📜 Program logs:");
        error.logs.forEach((log: string) => console.log("   ", log));
      }
      process.exit(1);
    }
  }

  console.log("");

  // Step 5: Initialize VRF Treasury
  console.log("─".repeat(70));
  console.log("Step 5/5: Initialize VRF Treasury");
  console.log("─".repeat(70));
  console.log("");

  try {
    const treasuryInfo = await connection.getAccountInfo(treasuryPda);
    if (treasuryInfo && treasuryInfo.data.length > 0) {
      console.log("✅ VRF Treasury already initialized");
      const balance = await connection.getTokenAccountBalance(treasuryPda);
      console.log("   Balance:", balance.value.uiAmount || 0, "USDC");
    } else {
      throw new Error("Not initialized");
    }
  } catch (error) {
    console.log("📝 Initializing VRF Treasury...");
    try {
      const globalAccount = await program.account.global.fetch(globalPda);
      
      const tx = await program.methods
        .initTreasury()
        .accountsStrict({
          authority: provider.wallet.publicKey,
          global: globalPda,
          treasury: treasuryPda,
          usdcMint: globalAccount.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✅ VRF Treasury initialized!");
      console.log("📝 Transaction:", tx);
      console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${tx}`);
      console.log("");

      await connection.confirmTransaction(tx, "confirmed");
      console.log("✅ Confirmed");
    } catch (error: any) {
      console.error("❌ Failed to initialize VRF Treasury:", error.message);
      if (error.logs) {
        console.log("\n📜 Program logs:");
        error.logs.forEach((log: string) => console.log("   ", log));
      }
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

  const platformBalance = await connection.getTokenAccountBalance(platformTreasuryPda);
  console.log("✅ Platform Treasury");
  console.log("   Address:", platformTreasuryPda.toString());
  console.log("   Balance:", platformBalance.value.uiAmount || 0, "USDC");
  console.log("");

  const rewardBalance = await connection.getTokenAccountBalance(rewardTreasuryPda);
  console.log("✅ Reward Treasury");
  console.log("   Address:", rewardTreasuryPda.toString());
  console.log("   Balance:", rewardBalance.value.uiAmount || 0, "USDC");
  console.log("");

  const creatorBalance = await connection.getTokenAccountBalance(creatorTreasuryPda);
  console.log("✅ Creator Treasury");
  console.log("   Address:", creatorTreasuryPda.toString());
  console.log("   Balance:", creatorBalance.value.uiAmount || 0, "USDC");
  console.log("");

  const treasuryBalance = await connection.getTokenAccountBalance(treasuryPda);
  console.log("✅ VRF Treasury");
  console.log("   Address:", treasuryPda.toString());
  console.log("   Balance:", treasuryBalance.value.uiAmount || 0, "USDC");
  console.log("");

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
  console.log("✨ MAINNET INITIALIZATION COMPLETE!");
  console.log("=".repeat(70));
  console.log("");
  console.log("📝 Next Steps:");
  console.log("");
  console.log("1. Save these addresses to your configuration:");
  console.log("   Program ID:", programId.toString());
  console.log("   Global PDA:", globalPda.toString());
  console.log("   Platform Treasury:", platformTreasuryPda.toString());
  console.log("   Reward Treasury:", rewardTreasuryPda.toString());
  console.log("   Creator Treasury:", creatorTreasuryPda.toString());
  console.log("   VRF Treasury:", treasuryPda.toString());
  console.log("   USDC Mint:", MAINNET_USDC_MINT.toString());
  console.log("");
  console.log("2. Update Frontend .env:");
  console.log("   NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta");
  console.log("   NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com");
  console.log("   NEXT_PUBLIC_PROGRAM_ID=" + programId.toString());
  console.log("   NEXT_PUBLIC_USDC_MINT_ADDRESS=" + MAINNET_USDC_MINT.toString());
  console.log("");
  console.log("3. Update Database & Backend services");
  console.log("");
  console.log("4. Deploy Frontend to production");
  console.log("");
  console.log("5. Start Keeper service for VRF callbacks");
  console.log("");
  console.log("6. Monitor transactions and logs");
  console.log("");
  console.log("🎉 Your Catallaxyz program is now live on Mainnet!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  });
