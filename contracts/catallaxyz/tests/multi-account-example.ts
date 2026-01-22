import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { catallaxyz } from "../target/types/catallaxyz";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import { expect } from "chai";

/**
 * 多账户交易测试示例
 * 
 * 这个测试展示如何：
 * 1. 加载多个测试账户
 * 2. 使用不同账户进行交易
 * 3. 验证账户余额变化
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
        `无法加载账户 ${accountNumber}。请先运行: bash scripts/setup-test-accounts-v2.sh`
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
        "无法加载测试 USDC 配置。请先运行: yarn create-test-usdc 或使用 CLI 创建"
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
    console.log("\n=== 测试账户信息 ===\n");

    const usdcMint = getTestUsdcMint();
    console.log("测试 USDC Mint:", usdcMint.toString());
    console.log("");

    // Load 3 test accounts
    for (let i = 1; i <= 3; i++) {
      try {
        const account = loadAccount(i);
        const solBalance = await provider.connection.getBalance(
          account.publicKey
        );
        const usdcBalance = await getUsdcBalance(account.publicKey, usdcMint);

        console.log(`账户 ${i}:`);
        console.log(`  地址: ${account.publicKey.toString()}`);
        console.log(`  SOL: ${solBalance / anchor.web3.LAMPORTS_PER_SOL}`);
        console.log(`  USDC: ${usdcBalance}`);
        console.log("");
      } catch (e) {
        console.log(`账户 ${i}: 未找到`);
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

    console.log("\n账户 1 余额:");
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
    
    console.log("市场创建成功");
  });

  it("Scenario 2: Account 2 buys YES tokens", async () => {
    const buyer = loadAccount(2);
    const usdcMint = getTestUsdcMint();

    // Record balance before buy
    const balanceBefore = await getUsdcBalance(buyer.publicKey, usdcMint);
    
    // Buy logic (using Manifest order book)
    // const tx = await program.methods
    //   .placeOrder({...})
    //   .accounts({...})
    //   .signers([buyer])
    //   .rpc();
    
    // Verify balance change
    const balanceAfter = await getUsdcBalance(buyer.publicKey, usdcMint);
    expect(balanceAfter).to.be.lessThan(balanceBefore);
    
    console.log(`USDC 消耗: ${balanceBefore - balanceAfter}`);
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

