import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";
import { setupProvider, printConfig } from "./utils/anchor-config";

/**
 * Set or Update Keeper Script
 * 
 * This script sets or updates the keeper wallet address in the Global account.
 * The keeper can perform automated tasks like terminating inactive markets.
 * 
 * Usage:
 *   KEEPER_PUBLIC_KEY=<pubkey> yarn ts-node scripts/set-keeper.ts
 * 
 * To disable separate keeper (only authority can perform keeper tasks):
 *   KEEPER_PUBLIC_KEY=11111111111111111111111111111111 yarn ts-node scripts/set-keeper.ts
 */

const GLOBAL_SEED = "global";

async function main() {
  console.log("=".repeat(70));
  console.log("🔧 SET KEEPER");
  console.log("=".repeat(70));
  console.log("");

  // Get keeper from environment
  const keeperEnv = process.env.KEEPER_PUBLIC_KEY;
  if (!keeperEnv) {
    console.log("❌ ERROR: KEEPER_PUBLIC_KEY environment variable is required");
    console.log("");
    console.log("Usage:");
    console.log("  KEEPER_PUBLIC_KEY=<pubkey> yarn ts-node scripts/set-keeper.ts");
    console.log("");
    console.log("To disable separate keeper:");
    console.log("  KEEPER_PUBLIC_KEY=11111111111111111111111111111111 yarn ts-node scripts/set-keeper.ts");
    process.exit(1);
  }

  let newKeeper: PublicKey;
  try {
    newKeeper = new PublicKey(keeperEnv);
  } catch (error) {
    console.log("❌ ERROR: Invalid KEEPER_PUBLIC_KEY");
    console.log("   Provided:", keeperEnv);
    process.exit(1);
  }

  // Setup provider
  printConfig();
  const provider = setupProvider();
  const connection = provider.connection;
  
  console.log("🔑 Authority Wallet:", provider.wallet.publicKey.toString());
  console.log("🤖 New Keeper:", newKeeper.toString());
  console.log("");

  // Load program from IDL
  const idlPath = "./target/idl/catallaxyz.json";
  if (!fs.existsSync(idlPath)) {
    console.log("❌ IDL file not found!");
    console.log("   Please run: anchor build");
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;

  console.log("📋 Program ID:", program.programId.toString());
  console.log("");

  // Derive Global PDA
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_SEED)],
    program.programId
  );

  // Fetch current Global state
  try {
    const globalAccount = await program.account.global.fetch(globalPda);
    console.log("📊 Current Global State:");
    console.log("   Authority:", globalAccount.authority.toString());
    console.log("   Current Keeper:", globalAccount.keeper.toString());
    console.log("");

    // Check if wallet is authority
    if (!globalAccount.authority.equals(provider.wallet.publicKey)) {
      console.log("❌ ERROR: Only the authority can update the keeper");
      console.log("   Authority:", globalAccount.authority.toString());
      console.log("   Your wallet:", provider.wallet.publicKey.toString());
      process.exit(1);
    }

    // Check if keeper is already set to the new value
    if (globalAccount.keeper.equals(newKeeper)) {
      console.log("ℹ️  Keeper is already set to this value");
      process.exit(0);
    }

  } catch (error: any) {
    console.log("❌ ERROR: Global account not found or not initialized");
    console.log("   Please run initialization first");
    process.exit(1);
  }

  // Send set_keeper transaction
  console.log("📝 Updating keeper...");
  try {
    const tx = await program.methods
      .setKeeper({ newKeeper })
      .accountsStrict({
        authority: provider.wallet.publicKey,
        global: globalPda,
      })
      .rpc();

    console.log("✅ Keeper updated successfully!");
    console.log("📝 Transaction Signature:", tx);
    console.log("");

    // Wait for confirmation
    await connection.confirmTransaction(tx, "confirmed");
    console.log("✅ Transaction confirmed");
    console.log("");

    // Verify the update
    const updatedGlobal = await program.account.global.fetch(globalPda);
    console.log("📊 Updated Global State:");
    console.log("   Keeper:", updatedGlobal.keeper.toString());
    
    if (updatedGlobal.keeper.equals(newKeeper)) {
      console.log("");
      console.log("✅ Keeper verified!");
    } else {
      console.log("");
      console.log("⚠️  Warning: Keeper value doesn't match expected");
    }

  } catch (error: any) {
    console.log("❌ ERROR: Failed to update keeper");
    console.log("   Error:", error.message);
    process.exit(1);
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("✅ DONE");
  console.log("=".repeat(70));
}

main().catch(console.error);
