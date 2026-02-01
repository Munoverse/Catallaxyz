import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  AnchorUtils,
  InstructionUtils,
  Queue,
  Randomness,
  ON_DEMAND_MAINNET_PID,
  ON_DEMAND_DEVNET_PID,
} from "@switchboard-xyz/on-demand";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { rpc, PROGRAM_ID } from "../solana";

/**
 * Browser-compatible wallet implementation for Anchor
 * This replaces the Node.js Wallet class that's not available in browser
 */
class BrowserWallet {
  constructor(readonly payer: Keypair) {}

  async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.payer);
    } else if (tx instanceof VersionedTransaction) {
      tx.sign([this.payer]);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> {
    return txs.map((tx) => {
      if (tx instanceof Transaction) {
        tx.partialSign(this.payer);
      } else if (tx instanceof VersionedTransaction) {
        tx.sign([this.payer]);
      }
      return tx;
    });
  }

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
}

/**
 * Switchboard Randomness Configuration
 */
export const SWITCHBOARD_QUEUE_DEVNET = new PublicKey(
  "FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di"
);

export const SWITCHBOARD_QUEUE_MAINNET = new PublicKey(
  // Mainnet queue address - update when available
  "FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di"
);

/**
 * Get the Switchboard queue address based on network
 */
export function getSwitchboardQueue(): PublicKey {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  return network === "mainnet-beta"
    ? SWITCHBOARD_QUEUE_MAINNET
    : SWITCHBOARD_QUEUE_DEVNET;
}

/**
 * Get the Switchboard on-demand program ID for the current network
 */
export function getSwitchboardProgramId(): PublicKey {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  return network === "mainnet-beta" ? ON_DEMAND_MAINNET_PID : ON_DEMAND_DEVNET_PID;
}

/**
 * Randomness Account State
 */
export interface RandomnessAccountState {
  randomnessAccount: PublicKey;
  randomness: Randomness;
  seedSlot?: number;
  revealedValue?: bigint;
  isCommitted: boolean;
  isRevealed: boolean;
}

/**
 * Create a new Randomness Account
 * @param connection Solana connection
 * @param payer Payer keypair
 * @returns Randomness account and initialization instruction
 */
export async function createRandomnessAccount(
  connection: Connection,
  payer: Keypair
): Promise<{ randomness: Randomness; initIx: any }> {
  // Initialize Switchboard program
  const sbQueue = getSwitchboardQueue();
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const sbProgramId = getSwitchboardProgramId();
  
  // Create provider for Anchor
  const provider = new AnchorProvider(
    connection,
    new BrowserWallet(payer),
    { commitment: "confirmed" }
  );
  const sbProgram = await Program.at(
    sbProgramId,
    provider
  );
  // Type assertion to bypass Anchor version mismatch between dependencies
  const queueAccount = new Queue(sbProgram as any, sbQueue);

  // Generate keypair for randomness account
  const rngKp = Keypair.generate();
  const [randomness, initIx] = await Randomness.create(
    sbProgram as any,
    rngKp,
    sbQueue
  );

  return { randomness, initIx };
}

/**
 * Create a new Randomness Account using a wallet adapter
 * Generates a randomness keypair locally and signs with wallet + keypair.
 */
export async function createRandomnessAccountWithWallet(
  connection: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }
): Promise<{ randomnessAccount: PublicKey; signature: string }> {
  const sbQueue = getSwitchboardQueue();
  const sbProgramId = getSwitchboardProgramId();

  const provider = new AnchorProvider(
    connection,
    wallet as any,
    { commitment: "confirmed" }
  );
  const sbProgram = await Program.at(sbProgramId, provider);

  const rngKp = Keypair.generate();
  const [randomness, initIx] = await Randomness.create(
    sbProgram as any,
    rngKp,
    sbQueue
  );

  // Wrap the instruction in a transaction
  const tx = new Transaction();
  tx.add(initIx);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.partialSign(rngKp);

  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return { randomnessAccount: randomness.pubkey, signature };
}

/**
 * Create a commit instruction for randomness
 * This locks the randomness account to a future slot
 * @param randomness Randomness instance
 * @param queue Switchboard queue
 * @returns Commit instruction
 */
export async function createCommitInstruction(
  randomness: Randomness,
  queue?: PublicKey
): Promise<Transaction> {
  const sbQueue = queue || getSwitchboardQueue();
  const commitIx = await randomness.commitIx(sbQueue);
  
  const transaction = new Transaction().add(commitIx);
  return transaction;
}

/**
 * Create a reveal instruction for randomness
 * This reveals the random value for the committed slot
 * @param randomness Randomness instance
 * @returns Reveal instruction
 */
export async function createRevealInstruction(
  randomness: Randomness
): Promise<Transaction> {
  const revealIx = await randomness.revealIx();
  const transaction = new Transaction().add(revealIx);
  return transaction;
}

/**
 * Build a commit transaction using a wallet adapter.
 */
export async function createCommitTransactionWithWallet(
  connection: Connection,
  randomnessAccount: PublicKey,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  queue?: PublicKey
): Promise<Transaction> {
  const sbProgramId = getSwitchboardProgramId();
  const sbProgram = await Program.at(
    sbProgramId,
    new AnchorProvider(connection, wallet as any, { commitment: "confirmed" })
  );
  const randomness = new Randomness(sbProgram as any, randomnessAccount);
  const commitIx = await randomness.commitIx(queue || getSwitchboardQueue());
  const tx = new Transaction().add(commitIx);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Build a reveal transaction using a wallet adapter.
 */
export async function createRevealTransactionWithWallet(
  connection: Connection,
  randomnessAccount: PublicKey,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }
): Promise<Transaction> {
  const sbProgramId = getSwitchboardProgramId();
  const sbProgram = await Program.at(
    sbProgramId,
    new AnchorProvider(connection, wallet as any, { commitment: "confirmed" })
  );
  const randomness = new Randomness(sbProgram as any, randomnessAccount);
  const revealIx = await randomness.revealIx();
  const tx = new Transaction().add(revealIx);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Get the revealed random value from a randomness account
 * @param connection Solana connection
 * @param randomnessAccount PublicKey of the randomness account
 * @returns The revealed random value (bigint) or null if not revealed
 */
export async function getRevealedValue(
  connection: Connection,
  randomnessAccount: PublicKey
): Promise<bigint | null> {
  try {
    const accountInfo = await connection.getAccountInfo(randomnessAccount);
    if (!accountInfo) {
      return null;
    }

    // Parse randomness account data using Randomness class
    const sbQueue = getSwitchboardQueue();
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
    const sbProgramId = getSwitchboardProgramId();
    
    // Create a minimal provider for parsing
    const dummyKeypair = Keypair.generate();
    const provider = new AnchorProvider(
      connection,
      new BrowserWallet(dummyKeypair),
      { commitment: "confirmed" }
    );
    const sbProgram = await Program.at(sbProgramId, provider);
    
    // Use Randomness class to parse the account
    const randomness = new Randomness(sbProgram as any, randomnessAccount);
    
    // Get current clock
    const clock = await connection.getSlot();
    
    // Get revealed value using Randomness class method
    try {
      const revealedValue = (randomness as any).getValue?.(clock) ?? (randomness as any).get_value?.(clock);
      return revealedValue;
    } catch (error) {
      // Randomness not yet revealed
      return null;
    }
  } catch (error) {
    console.error("Error getting revealed value:", error);
    return null;
  }
}

/**
 * Check if randomness is ready to be revealed
 * @param connection Solana connection
 * @param randomnessAccount PublicKey of the randomness account
 * @returns true if randomness can be revealed
 */
export async function isRandomnessReady(
  connection: Connection,
  randomnessAccount: PublicKey
): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(randomnessAccount);
    if (!accountInfo) {
      return false;
    }

    // Parse randomness account data
    const sbQueue = getSwitchboardQueue();
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
    const sbProgramId = getSwitchboardProgramId();
    
    const dummyKeypair = Keypair.generate();
    const provider = new AnchorProvider(
      connection,
      new BrowserWallet(dummyKeypair),
      { commitment: "confirmed" }
    );
    const sbProgram = await Program.at(sbProgramId, provider);
    
    const randomness = new Randomness(sbProgram as any, randomnessAccount);
    const clock = await connection.getSlot();
    
    // Check if seed slot has passed
    // Access seed_slot from the randomness account data
    const seedSlot = (randomness as any).seedSlot ?? (randomness as any).seed_slot ?? 0;
    return seedSlot > 0 && seedSlot <= clock - 1;
  } catch (error) {
    console.error("Error checking randomness readiness:", error);
    return false;
  }
}

/**
 * Serialize instructions to file (for later execution)
 * Useful for scheduling reveal instructions
 * @param instructions Array of instructions
 * @param filename Output filename
 */
export async function serializeInstructionsToFile(
  instructions: Transaction[],
  filename: string
): Promise<void> {
  // Combine all instructions into one transaction
  const combinedTx = new Transaction();
  instructions.forEach((tx) => {
    tx.instructions.forEach((ix) => {
      combinedTx.add(ix);
    });
  });

  // Serialize to buffer
  const serialized = combinedTx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  // In browser environment, we can't write to file system
  // Instead, return the serialized data as base64
  const base64 = Buffer.from(serialized).toString("base64");
  
  // Store in localStorage or return as download
  if (typeof window !== "undefined") {
    localStorage.setItem(`randomness_${filename}`, base64);
  }

  return Promise.resolve();
}

/**
 * Helper class for managing randomness workflow
 */
export class RandomnessManager {
  private connection: Connection;
  private randomness: Randomness | null = null;
  private randomnessAccount: PublicKey | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Initialize a new randomness account
   */
  async initialize(payer: Keypair): Promise<PublicKey> {
    const { randomness, initIx } = await createRandomnessAccount(
      this.connection,
      payer
    );
    
    this.randomness = randomness;
    this.randomnessAccount = randomness.pubkey;
    
    // Send initialization transaction
    const signature = await this.connection.sendTransaction(
      initIx,
      [payer],
      { skipPreflight: false }
    );
    
    await this.connection.confirmTransaction(signature, "confirmed");
    
    return randomness.pubkey;
  }

  /**
   * Commit randomness to a future slot
   */
  async commit(payer: Keypair, queue?: PublicKey): Promise<string> {
    if (!this.randomness) {
      throw new Error("Randomness not initialized. Call initialize() first.");
    }

    const commitTx = await createCommitInstruction(this.randomness, queue);
    commitTx.feePayer = payer.publicKey;
    commitTx.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;

    const signature = await this.connection.sendTransaction(
      commitTx,
      [payer],
      { skipPreflight: false }
    );

    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  /**
   * Reveal randomness
   */
  async reveal(payer: Keypair): Promise<string> {
    if (!this.randomness) {
      throw new Error("Randomness not initialized. Call initialize() first.");
    }

    const revealTx = await createRevealInstruction(this.randomness);
    revealTx.feePayer = payer.publicKey;
    revealTx.recentBlockhash = (
      await this.connection.getLatestBlockhash()
    ).blockhash;

    const signature = await this.connection.sendTransaction(
      revealTx,
      [payer],
      { skipPreflight: false }
    );

    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  /**
   * Get the revealed random value
   */
  async getRevealedValue(): Promise<bigint | null> {
    if (!this.randomnessAccount) {
      return null;
    }

    return await getRevealedValue(this.connection, this.randomnessAccount);
  }

  /**
   * Check if randomness is ready to be revealed
   */
  async isReady(): Promise<boolean> {
    if (!this.randomnessAccount) {
      return false;
    }

    return await isRandomnessReady(this.connection, this.randomnessAccount);
  }

  /**
   * Get the randomness account public key
   */
  getRandomnessAccount(): PublicKey | null {
    return this.randomnessAccount;
  }
}

// Note: RandomnessAccountData is not directly exported from the SDK
// Use the Randomness class methods instead

