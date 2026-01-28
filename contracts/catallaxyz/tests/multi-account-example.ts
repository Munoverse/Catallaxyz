import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { catallaxyz } from "../target/types/catallaxyz";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import { expect } from "chai";

/**
 * Multi-account trading example.
 *
 * This test demonstrates:
 * 1. Loading multiple test accounts
 * 2. Trading with different accounts
 * 3. Verifying balance changes
 */

describe("Multi-account trading example", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.catallaxyz as Program<catallaxyz>;

  // Helper: load test account
  const loadAccount = (accountNumber: number): Keypair => {
    const keyFile = `test-accounts/test-account-${accountNumber}.json`;
    try {
      const secretKey = JSON.parse(fs.readFileSync(keyFile, "utf8"));
      return Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } catch (e) {
      throw new Error(
        `Unable to load account ${accountNumber}. Run: bash scripts/setup-test-accounts-v2.sh`
      );
    }
  };

  // Helper: get test USDC mint
  const getTestUsdcMint = (): PublicKey => {
    try {
      const config = JSON.parse(
        fs.readFileSync("test-usdc-config.json", "utf8")
      );
      return new PublicKey(config.testUsdcMint);
    } catch (e) {
      throw new Error(
        "Unable to load test USDC config. Run: yarn create-test-usdc or create it via CLI"
      );
    }
  };

  // Helper: get account USDC balance
  const getUsdcBalance = async (
    owner: PublicKey,
    mint: PublicKey
  ): Promise<number> => {
    const tokenAccount = await getAssociatedTokenAddress(
      mint, 
      owner,
      false, // allowOwnerOffCurve
      TOKEN_2022_PROGRAM_ID // Use Token-2022 program
    );
    try {
      const balance = await provider.connection.getTokenAccountBalance(
        tokenAccount
      );
      return parseFloat(balance.value.uiAmountString || "0");
    } catch (e) {
      return 0;
    }
  };

  it("Load and display test accounts", async () => {
    console.log("\n=== Test Account Info ===\n");

    const usdcMint = getTestUsdcMint();
    console.log("Test USDC Mint:", usdcMint.toString());
    console.log("");

    // Load 3 test accounts
    for (let i = 1; i <= 3; i++) {
      try {
        const account = loadAccount(i);
        const solBalance = await provider.connection.getBalance(
          account.publicKey
        );
        const usdcBalance = await getUsdcBalance(account.publicKey, usdcMint);

        console.log(`Account ${i}:`);
        console.log(`  Address: ${account.publicKey.toString()}`);
        console.log(`  SOL: ${solBalance / anchor.web3.LAMPORTS_PER_SOL}`);
        console.log(`  USDC: ${usdcBalance}`);
        console.log("");
      } catch (e) {
        console.log(`Account ${i}: not found`);
        console.log("");
      }
    }
  });

  it("Example: Check account balances", async () => {
    const account1 = loadAccount(1);
    const usdcMint = getTestUsdcMint();

    const solBalance = await provider.connection.getBalance(
      account1.publicKey
    );
    const usdcBalance = await getUsdcBalance(account1.publicKey, usdcMint);

    console.log("\nAccount 1 balances:");
    console.log(`SOL: ${solBalance / anchor.web3.LAMPORTS_PER_SOL}`);
    console.log(`USDC: ${usdcBalance}`);

    // Verify account has enough balance
    expect(solBalance).to.be.greaterThan(0);
    expect(usdcBalance).to.be.greaterThan(0);
  });

  // Example test scenarios to implement:

  /*
  it("Scenario 1: Create market with account 1", async () => {
    const creator = loadAccount(1);
    const usdcMint = getTestUsdcMint();

    // Create market logic
    // const tx = await program.methods
    //   .createMarket(...)
    //   .accounts({...})
    //   .signers([creator])
    //   .rpc();
    
    console.log("Market created successfully");
  });

  it("Scenario 2: Account 2 buys YES tokens", async () => {
    const buyer = loadAccount(2);
    const usdcMint = getTestUsdcMint();

    // Record balance before buy
    const balanceBefore = await getUsdcBalance(buyer.publicKey, usdcMint);
    
    // Buy logic (off-chain matching, on-chain settlement)
    // const tx = await program.methods
    //   .placeOrder({...})
    //   .accounts({...})
    //   .signers([buyer])
    //   .rpc();
    
    // Verify balance change
    const balanceAfter = await getUsdcBalance(buyer.publicKey, usdcMint);
    expect(balanceAfter).to.be.lessThan(balanceBefore);
    
    console.log(`USDC spent: ${balanceBefore - balanceAfter}`);
  });

  it("Scenario 3: Account 3 buys NO tokens", async () => {
    const buyer = loadAccount(3);
    // ... similar logic
  });

  it("Scenario 4: Verify market state", async () => {
    // Verify market status, liquidity, pricing
  });

  it("Scenario 5: Settle market and verify payouts", async () => {
    // Settle market and verify payouts
  });
  */
});

