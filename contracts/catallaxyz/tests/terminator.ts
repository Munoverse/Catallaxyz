import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { catallaxyz } from "../target/types/catallaxyz";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";

describe("catallaxyz", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.catallaxyz as Program<catallaxyz>;

  it("Is initialized!", async () => {
    // Get the authority (wallet)
    const authority = provider.wallet;

    // Derive the global PDA
    const [globalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    );

    // Check if account already exists
    let accountExists = false;
    try {
      await program.account.global.fetch(globalPda);
      accountExists = true;
      console.log("Global account already exists, skipping initialization");
    } catch (e) {
      // Account doesn't exist, we'll initialize it
      accountExists = false;
    }

    // Load test USDC mint from config
    let usdcMint: PublicKey;
    try {
      const config = JSON.parse(
        fs.readFileSync("test-usdc-config.json", "utf8")
      );
      usdcMint = new PublicKey(config.testUsdcMint);
      console.log("Using test USDC mint:", usdcMint.toString());
    } catch (e) {
      // Fallback to mainnet USDC for reference
      usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      console.log("Warning: test-usdc-config.json not found, using mainnet USDC");
    }
    const feeBps = 100; // 1% fee

    // Initialize the program only if account doesn't exist
    if (!accountExists) {
      const tx = await program.methods
        .initialize({
          usdcMint: usdcMint,
          feeBps: feeBps,
        })
        .accounts({
          authority: authority.publicKey,
          global: globalPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize transaction signature:", tx);
    }

    // Verify the global account exists and has correct data
    const globalAccount = await program.account.global.fetch(globalPda);
    console.log("Global account:", {
      authority: globalAccount.authority.toString(),
      usdcMint: globalAccount.usdcMint.toString(),
      feeBps: globalAccount.feeBps,
    });

    // Verify the account data matches expected values
    if (!accountExists) {
      // If we just created it, verify the values
      if (globalAccount.usdcMint.toString() !== usdcMint.toString()) {
        throw new Error("USDC mint mismatch");
      }
      if (globalAccount.feeBps !== feeBps) {
        throw new Error("Fee BPS mismatch");
      }
    }
  });
});
