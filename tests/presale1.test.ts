import { describe, expect, it, beforeEach } from "vitest";
import { initSimnet } from "@hirosystems/clarinet-sdk";
import { cvToValue, principalCV, uintCV, listCV, contractPrincipalCV } from "@stacks/transactions";

// Initialize the simnet
const simnet = await initSimnet();

// Get accounts for testing
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;
const wallet5 = accounts.get("wallet_5")!;

// Constants from the contract (read from the contract or hardcoded for tests)
const ONE_6 = 1000000; // Precision factor
const TOKEN_TO_SELL = 200000000 * ONE_6; // 200M tokens
const SOFTCAP = 500 * ONE_6; // 500 STX
const HARDCAP = 2000 * ONE_6; // 2000 STX
const MIN_BUY = 10 * ONE_6; // 10 STX
const MAX_BUY = 100 * ONE_6; // 100 STX
const START_BLOCK = 10;
const WHITELIST_END_BLOCK = 20;
const END_BLOCK = 30;

// Helper functions
function getPresaleInfo() {
  const { result } = simnet.callReadOnlyFn(
    "presale1", 
    "get-presale-info", 
    [], 
    deployer
  );
  return result;
}

function getUserInfo(user: string) {
  const { result } = simnet.callReadOnlyFn(
    "presale1", 
    "get-user-info", 
    [principalCV(user)], 
    user
  );
  return result;
}

function isWhitelisted(user: string): boolean {
  const { result } = simnet.callReadOnlyFn("presale1", "is-whitelisted", [principalCV(user)], deployer);
  return cvToValue(result);
}

function advanceBlocks(count: number) {
  for (let i = 0; i < count; i++) {
    simnet.mineEmptyBlock();
  }
}

describe("STXCITY Presale Contract Tests", () => {
  describe("Initialization", () => {
    it("should verify the contract is initialized", () => {
      // Get presale info
      const presaleInfo = getPresaleInfo();
      
      // Check initialization
      expect(presaleInfo.initialized).toBe(true);
      expect(presaleInfo.token_to_sell).toBe(TOKEN_TO_SELL);
      expect(presaleInfo.softcap).toBe(SOFTCAP);
      expect(presaleInfo.hardcap).toBe(HARDCAP);
      expect(presaleInfo.min_buy).toBe(MIN_BUY);
      expect(presaleInfo.max_buy).toBe(MAX_BUY);
    });
  });

  describe("Whitelist Management", () => {
    it("should allow the deployer to add addresses to the whitelist", () => {
      // Add wallet1 to the whitelist
      const addToWhitelist = simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet1)], 
        deployer
      );
      
      // Check the result
      expect(addToWhitelist.result.type).toBe("ok");
      
      // Verify wallet1 is in the whitelist
      expect(isWhitelisted(wallet1)).toBe(true);
    });
    
    it("should not allow non-deployer to add addresses to the whitelist", () => {
      // Try to add wallet2 to the whitelist from wallet1
      const addToWhitelist = simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet2)], 
        wallet1
      );
      
      // Check the result is an error
      expect(addToWhitelist.result.type).toBe("err");
    });

    it("should allow batch addition to whitelist", () => {
      // Add multiple addresses to whitelist
      const addresses = [wallet2, wallet3, wallet4].map(addr => principalCV(addr));
      const result = simnet.callPublicFn(
        "presale1", 
        "add-addresses-to-whitelist", 
        [listCV(addresses)], 
        deployer
      );
      
      expect(result.result.type).toBe("ok");
      
      // Verify all addresses are whitelisted
      for (const addr of [wallet2, wallet3, wallet4]) {
        expect(isWhitelisted(addr)).toBe(true);
      }
    });
  });

  describe("Buying Tokens", () => {
    beforeAll(() => {
      // Advance to the start block
      simnet.mineEmptyBlocks(START_BLOCK - simnet.blockHeight);
    });
    
    it("should allow whitelisted users to buy tokens during whitelist period", () => {
      // Buy tokens with wallet1
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet1
      );
      
      // Check the result
      expect(buyTokens.result.type).toBe("ok");
      
      // Check user info
      const userInfo = getUserInfo(wallet1);
      expect(userInfo.stx_amount).toBe(MIN_BUY);
    });
    
    it("should enforce minimum buy amount", () => {
      // Try to buy less than minimum
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY - 1)], 
        wallet2
      );
      
      // Check the result is an error
      expect(buyTokens.result.type).toBe("err");
    });
    
    it("should enforce maximum buy amount", () => {
      // Try to buy more than maximum
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MAX_BUY + 1)], 
        wallet2
      );
      
      // Check the result is an error
      expect(buyTokens.result.type).toBe("err");
    });
  });

  describe("Public Sale Period", () => {
    beforeAll(() => {
      // Advance to after whitelist period
      simnet.mineEmptyBlocks(WHITELIST_END_BLOCK - simnet.blockHeight + 1);
    });
    
    it("should allow any user to buy tokens after whitelist period", () => {
      // Buy tokens with wallet5 (not whitelisted)
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet5
      );
      
      // Check the result
      expect(buyTokens.result.type).toBe("ok");
      
      // Check user info
      const userInfo = getUserInfo(wallet5);
      expect(userInfo.stx_amount).toBe(MIN_BUY);
    });
  });

  describe("Finalizing Presale", () => {
    beforeAll(() => {
      // Advance to the end block
      simnet.mineEmptyBlocks(END_BLOCK - simnet.blockHeight);
    });
    
    it("should allow the deployer to finalize the presale", () => {
      // Finalize the presale
      const finalize = simnet.callPublicFn(
        "presale1", 
        "finalize", 
        [], 
        deployer
      );
      
      // Check the result
      expect(finalize.result.type).toBe("ok");
      
      // Check presale info
      const presaleInfo = getPresaleInfo();
      expect(presaleInfo.finalized).toBe(true);
    });
    
    it("should not allow non-deployer to finalize the presale", () => {
      // Try to finalize from wallet1
      const finalize = simnet.callPublicFn(
        "presale1", 
        "finalize", 
        [], 
        wallet1
      );
      
      // Check the result is an error
      expect(finalize.result.type).toBe("err");
    });
  });
});

describe("STXCITY Presale Contract Tests", () => {
  describe("Initialization", () => {
    it("should verify the contract is initialized", () => {
      // Get presale info
      const presaleInfo = getPresaleInfo();
      
      // Check initialization
      expect(presaleInfo.initialized).toBe(true);
      expect(presaleInfo.token_to_sell).toBe(TOKEN_TO_SELL);
      expect(presaleInfo.softcap).toBe(SOFTCAP);
      expect(presaleInfo.hardcap).toBe(HARDCAP);
      expect(presaleInfo.min_buy).toBe(MIN_BUY);
      expect(presaleInfo.max_buy).toBe(MAX_BUY);
    });
  });

  describe("Whitelist Management", () => {
    it("should allow the deployer to add addresses to the whitelist", () => {
      // Add wallet1 to the whitelist
      const addToWhitelist = simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet1)], 
        deployer
      );
      
      // Check the result
      expect(addToWhitelist.result.type).toBe("ok");
      
      // Verify wallet1 is in the whitelist
      expect(isWhitelisted(wallet1)).toBe(true);
    });
    
    it("should not allow non-deployer to add addresses to the whitelist", () => {
      // Try to add wallet2 to the whitelist from wallet1
      const addToWhitelist = simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet2)], 
        wallet1
      );
      
      // Check the result is an error
      expect(addToWhitelist.result.type).toBe("err");
    });

    it("should allow batch addition to whitelist", () => {
      // Add multiple addresses to whitelist
      const addresses = [wallet2, wallet3, wallet4].map(addr => principalCV(addr));
      const result = simnet.callPublicFn(
        "presale1", 
        "add-addresses-to-whitelist", 
        [listCV(addresses)], 
        deployer
      );
      
      expect(result.result.type).toBe("ok");
      
      // Verify all addresses are whitelisted
      for (const addr of [wallet2, wallet3, wallet4]) {
        expect(isWhitelisted(addr)).toBe(true);
      }
    });
  });

  describe("Buying Tokens", () => {
    beforeAll(() => {
      // Advance to the start block
      simnet.mineEmptyBlocks(START_BLOCK - simnet.blockHeight);
    });
    
    it("should allow whitelisted users to buy tokens during whitelist period", () => {
      // Buy tokens with wallet1
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet1
      );
      
      // Check the result
      expect(buyTokens.result.type).toBe("ok");
      
      // Check user info
      const userInfo = getUserInfo(wallet1);
      expect(userInfo.stx_amount).toBe(MIN_BUY);
    });
    
    it("should enforce minimum buy amount", () => {
      // Try to buy less than minimum
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY - 1)], 
        wallet2
      );
      
      // Check the result is an error
      expect(buyTokens.result.type).toBe("err");
    });
    
    it("should enforce maximum buy amount", () => {
      // Try to buy more than maximum
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MAX_BUY + 1)], 
        wallet2
      );
      
      // Check the result is an error
      expect(buyTokens.result.type).toBe("err");
    });
  });

  describe("Public Sale Period", () => {
    beforeAll(() => {
      // Advance to after whitelist period
      simnet.mineEmptyBlocks(WHITELIST_END_BLOCK - simnet.blockHeight + 1);
    });
    
    it("should allow any user to buy tokens after whitelist period", () => {
      // Buy tokens with wallet5 (not whitelisted)
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet5
      );
      
      // Check the result
      expect(buyTokens.result.type).toBe("ok");
      
      // Check user info
      const userInfo = getUserInfo(wallet5);
      expect(userInfo.stx_amount).toBe(MIN_BUY);
    });
  });

  describe("Finalizing Presale", () => {
    beforeAll(() => {
      // Advance to the end block
      simnet.mineEmptyBlocks(END_BLOCK - simnet.blockHeight);
    });
    
    it("should allow the deployer to finalize the presale", () => {
      // Finalize the presale
      const finalize = simnet.callPublicFn(
        "presale1", 
        "finalize", 
        [], 
        deployer
      );
      
      // Check the result
      expect(finalize.result.type).toBe("ok");
      
      // Check presale info
      const presaleInfo = getPresaleInfo();
      expect(presaleInfo.finalized).toBe(true);
    });
    
    it("should not allow non-deployer to finalize the presale", () => {
      // Try to finalize from wallet1
      const finalize = simnet.callPublicFn(
        "presale1", 
        "finalize", 
        [], 
        wallet1
      );
      
      // Check the result is an error
      expect(finalize.result.type).toBe("err");
    });
  });
});

describe("STXCITY Presale Contract Tests", () => {

  describe("Whitelist Management", () => {
    it("should allow the deployer to add addresses to the whitelist", () => {
      // Add wallet1 to the whitelist
      const addToWhitelist = simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet1)], 
        deployer
      );
      
      // Check the result
      expect(addToWhitelist.result.type).toBe("ok");
      
      // Verify wallet1 is in the whitelist
      const checkWhitelist = simnet.callReadOnlyFn(
        "presale1", 
        "is-whitelisted", 
        [principalCV(wallet1)], 
        deployer
      );
      
      expect(cvToValue(checkWhitelist.result)).toBe(true);
    });
    
    it("should not allow non-deployer to add addresses to the whitelist", () => {
      // Try to add wallet2 to the whitelist from wallet1
      const addToWhitelist = simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet2)], 
        wallet1
      );
      
      // Check the result is an error
      expect(addToWhitelist.result.type).toBe("err");
    });
  });

  describe("Buying Tokens", () => {
    beforeAll(() => {
      // Advance to the start block
      simnet.mineEmptyBlocks(START_BLOCK);
      
      // Add wallet1 to the whitelist
      simnet.callPublicFn(
        "presale1", 
        "add-to-whitelist", 
        [principalCV(wallet1)], 
        deployer
      );
    });
    
    it("should allow whitelisted users to buy tokens during whitelist period", () => {
      // Buy tokens with wallet1
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet1
      );
      
      // Check the result
      expect(buyTokens.result.type).toBe("ok");
      
      // Check user info
      const userInfo = getUserInfo(wallet1);
      expect(userInfo.stx_amount).toBe(MIN_BUY);
    });
    
    it("should not allow non-whitelisted users to buy during whitelist period", () => {
      // Try to buy tokens with wallet2 (not whitelisted)
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet2
      );
      
      // Check the result is an error
      expect(buyTokens.result.type).toBe("err");
    });
  });

  describe("Public Sale Period", () => {
    beforeAll(() => {
      // Advance to after whitelist period
      simnet.mineEmptyBlocks(WHITELIST_END_BLOCK - START_BLOCK + 1);
    });
    
    it("should allow any user to buy tokens after whitelist period", () => {
      // Buy tokens with wallet2 (not whitelisted)
      const buyTokens = simnet.callPublicFn(
        "presale1", 
        "buy", 
        [uintCV(MIN_BUY)], 
        wallet2
      );
      
      // Check the result
      expect(buyTokens.result.type).toBe("ok");
      
      // Check user info
      const userInfo = getUserInfo(wallet2);
      expect(userInfo.stx_amount).toBe(MIN_BUY);
    });
  });

  describe("Finalizing Presale", () => {
    beforeAll(() => {
      // Advance to the end block
      simnet.mineEmptyBlocks(END_BLOCK - WHITELIST_END_BLOCK);
    });
    
    it("should allow the deployer to finalize the presale", () => {
      // Finalize the presale
      const finalize = simnet.callPublicFn(
        "presale1", 
        "finalize", 
        [], 
        deployer
      );
      
      // Check the result
      expect(finalize.result.type).toBe("ok");
      
      // Check presale info
      const presaleInfo = getPresaleInfo();
      expect(presaleInfo.finalized).toBe(true);
    });
    
    it("should not allow non-deployer to finalize the presale", () => {
      // Try to finalize from wallet1
      const finalize = simnet.callPublicFn(
        "presale1", 
        "finalize", 
        [], 
        wallet1
      );
      
      // Check the result is an error
      expect(finalize.result.type).toBe("err");
    });
  });
});

describe("STXCITY Presale Contract Tests", () => {
  describe("Initialization", () => {
    it("should verify the contract is initialized", () => {
      // Get presale info
      const presaleInfo = getPresaleInfo();
      
      // Check initialization
      expect(presaleInfo.initialized).toBe(true);
      expect(presaleInfo.token_to_sell).toBe(TOKEN_TO_SELL);
      expect(presaleInfo.softcap).toBe(SOFTCAP);
      expect(presaleInfo.hardcap).toBe(HARDCAP);
      expect(presaleInfo.min_buy).toBe(MIN_BUY);
      expect(presaleInfo.max_buy).toBe(MAX_BUY);
    });
  });

  // Set up initial state before all tests
  beforeAll(() => {
    // The contract is auto-initialized during deployment
    // Check that initialization was successful
    const presaleInfo = getPresaleInfo();
    expect(presaleInfo.initialized.expectBool()).toBe(true);
  });

  describe("Basic Presale Functionality", () => {
    it("should have correct initial state", () => {
      const presaleInfo = getPresaleInfo();
      
      // Check initial values
      expect(presaleInfo.initialized.expectBool()).toBe(true);
      expect(presaleInfo["token-to-sell"].expectUint()).toBe(TOKEN_TO_SELL);
      expect(presaleInfo.softcap.expectUint()).toBe(SOFTCAP);
      expect(presaleInfo.hardcap.expectUint()).toBe(HARDCAP);
      expect(presaleInfo["min-buy"].expectUint()).toBe(MIN_BUY);
      expect(presaleInfo["max-buy"].expectUint()).toBe(MAX_BUY);
      expect(presaleInfo["start-block"].expectUint()).toBe(START_BLOCK);
      expect(presaleInfo["end-block"].expectUint()).toBe(END_BLOCK);
      expect(presaleInfo["total-stx-raised"].expectUint()).toBe(0);
      expect(presaleInfo.participants.expectUint()).toBe(0);
      expect(presaleInfo["distribution-height"].expectUint()).toBe(0);
      expect(presaleInfo["distribution-started"].expectBool()).toBe(false);
    });

    it("should not allow buying before presale starts", () => {
      // Ensure we're before the start block
      while (simnet.blockHeight >= START_BLOCK) {
        simnet.mineEmptyBlock(-1); // Go back in time if needed
      }
      
      const buyAmount = 10 * ONE_6; // 10 STX
      const result = simnet.callPublicFn("presale1", "buy", [Cl.uint(buyAmount)], wallet1);
      
      // Should fail because presale hasn't started
      expect(result.result).toBeErr().toContain("u7001"); // ERR-PRESALE-ENDED
    });
  });

  describe("Whitelist Functionality", () => {
    beforeEach(() => {
      // Advance to start of presale if needed
      while (simnet.blockHeight < START_BLOCK) {
        simnet.mineEmptyBlock();
      }
    });

    it("should allow deployer to add addresses to whitelist", () => {
      const result = simnet.callPublicFn("presale1", "add-to-whitelist", [principalCV(wallet1)], deployer);
      expect(result.result.type).toBe("ok");
      
      // Verify wallet1 is whitelisted
      const checkResult = simnet.callReadOnlyFn(
        "presale1", 
        "is-whitelisted", 
        [principalCV(wallet1)], 
        deployer
      );
      expect(cvToValue(checkResult.result)).toBe(true);
    });
    
    it("should allow batch addition to whitelist", () => {
      const addresses = [wallet2, wallet3, wallet4].map(addr => principalCV(addr));
      const result = simnet.callPublicFn(
        "presale1", 
        "add-addresses-to-whitelist", 
        [listCV(addresses)], 
        deployer
      );
      expect(result.result.type).toBe("ok");
      
      // Verify all addresses are whitelisted
      for (const addr of [wallet2, wallet3, wallet4]) {
        const checkResult = simnet.callReadOnlyFn(
          "presale1", 
          "is-whitelisted", 
          [principalCV(addr)], 
          deployer
        );
        expect(cvToValue(checkResult.result)).toBe(true);
      }
    });
    
    it("should allow whitelisted users to buy during whitelist period", () => {
      // Ensure we're in whitelist period
      while (simnet.blockHeight >= WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock(-1);
      }
      
      const buyAmount = 10 * ONE_6; // 10 STX
      const result = simnet.callPublicFn("presale1", "buy", [uintCV(buyAmount)], wallet1);
      
      expect(result.result.type).toBe("ok");
      
      // Check user deposit was recorded
      const userDeposit = simnet.callReadOnlyFn(
        "presale1", 
        "get-user-deposits", 
        [principalCV(wallet1)], 
        wallet1
      );
      expect(cvToValue(userDeposit.result)).toBe(buyAmount);
    });

    it("should not allow non-whitelisted users to buy during whitelist period", () => {
      // Ensure we're in whitelist period
      while (simnet.blockHeight >= WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock(-1);
      }
      
      // wallet5 is not whitelisted
      const buyAmount = 10 * ONE_6; // 10 STX
      const result = simnet.callPublicFn("presale1", "buy", [uintCV(buyAmount)], wallet5);
      
      expect(result.result.type).toBe("err");
      expect(cvToValue(result.result)).toContain("u8005"); // ERR-NOT-WHITELISTED
    });

    it("should allow anyone to buy after whitelist period", () => {
      // Advance to after whitelist period
      while (simnet.blockHeight < WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // wallet5 is not whitelisted but should be able to buy now
      const buyAmount = 10 * ONE_6; // 10 STX
      const result = simnet.callPublicFn("presale1", "buy", [uintCV(buyAmount)], wallet5);
      
      expect(result.result.type).toBe("ok");
      
      // Check user deposit was recorded
      const userDeposit = simnet.callReadOnlyFn(
        "presale1", 
        "get-user-deposits", 
        [principalCV(wallet5)], 
        wallet5
      );
      expect(cvToValue(userDeposit.result)).toBe(buyAmount);
    });
  });

  describe("Buying and Deposit Limits", () => {
    beforeEach(() => {
      // Advance to public sale period
      while (simnet.blockHeight < WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock();
      }
    });

    it("should enforce minimum buy amount", () => {
      const buyAmount = MIN_BUY - 1; // Less than minimum
      const result = simnet.callPublicFn("presale1", "buy", [uintCV(buyAmount)], wallet1);
      
      expect(result.result.type).toBe("err");
      expect(cvToValue(result.result)).toContain("u5001"); // ERR-INSUFFICIENT-AMOUNT
    });

    it("should enforce maximum buy amount", () => {
      // First buy a valid amount
      const initialBuy = 10 * ONE_6; // 10 STX
      simnet.callPublicFn("presale1", "buy", [uintCV(initialBuy)], wallet2);
      
      // Then try to exceed max buy
      const secondBuy = MAX_BUY; // This would exceed max buy
      const result = simnet.callPublicFn("presale1", "buy", [uintCV(secondBuy)], wallet2);
      
      expect(result.result.type).toBe("err");
      expect(cvToValue(result.result)).toContain("u8001"); // ERR-MAX-DEPOSIT-EXCEEDED
    });

    it("should enforce hardcap", () => {
      // Buy up to nearly hardcap with wallet3
      const nearHardcapAmount = HARDCAP - 2 * ONE_6; // Leave 2 STX room
      simnet.callPublicFn("presale1", "buy", [uintCV(nearHardcapAmount)], wallet3);
      
      // Try to exceed hardcap with wallet4
      const exceedAmount = 3 * ONE_6; // 3 STX, which would exceed hardcap
      const result = simnet.callPublicFn("presale1", "buy", [uintCV(exceedAmount)], wallet4);
      
      expect(result.result.type).toBe("err");
      expect(cvToValue(result.result)).toContain("u8002"); // ERR-HARDCAP-EXCEEDED
    });
  });

  describe("Presale Finalization", () => {
    beforeEach(async () => {
      // Reinitialize the simnet for a fresh state
      const newSimnet = await initSimnet();
      Object.assign(simnet, newSimnet);
      
      // Advance to public sale period
      while (simnet.blockHeight < WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // Add wallet1 to whitelist
      simnet.callPublicFn("presale1", "add-to-whitelist", [Cl.principal(wallet1)], deployer);
    });

    it("should not allow finalization before end if softcap not reached", () => {
      // Buy less than softcap
      const buyAmount = SOFTCAP - ONE_6; // Just under softcap
      simnet.callPublicFn("presale1", "buy", [uintCV(buyAmount)], wallet1);
      
      // Try to finalize before end
      const result = simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [contractPrincipalCV(deployer, "stxcity-token")], 
        deployer
      );
      
      expect(result.result.type).toBe("err");
      expect(cvToValue(result.result)).toContain("u7002"); // ERR-PRESALE-NOT-ENDED
    });

    it("should allow early finalization if softcap reached", () => {
      // Buy exactly softcap
      simnet.callPublicFn("presale1", "buy", [uintCV(SOFTCAP)], wallet1);
      
      // Finalize before end
      const result = simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [contractPrincipalCV(deployer, "stxcity-token")], 
        deployer
      );
      
      expect(result.result.type).toBe("ok");
      
      // Check distribution height is set
      const presaleInfo = getPresaleInfo();
      expect(cvToValue(presaleInfo)["distribution-height"]).toBe(simnet.blockHeight);
      expect(cvToValue(presaleInfo)["distribution-started"]).toBe(true);
    });

    it("should allow finalization after end if softcap reached", () => {
      // Buy exactly softcap
      simnet.callPublicFn("presale1", "buy", [Cl.uint(SOFTCAP)], wallet1);
      
      // Advance to after end block
      while (simnet.blockHeight < END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // Finalize
      const result = simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        deployer
      );
      
      expect(result.result).toBeOk().toBeTrue();
    });

    it("should not allow finalization after end if softcap not reached", () => {
      // Buy less than softcap
      const buyAmount = SOFTCAP - ONE_6; // Just under softcap
      simnet.callPublicFn("presale1", "buy", [Cl.uint(buyAmount)], wallet1);
      
      // Advance to after end block
      while (simnet.blockHeight < END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // Try to finalize
      const result = simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        deployer
      );
      
      expect(result.result).toBeErr().toContain("u7002"); // ERR-PRESALE-NOT-ENDED
    });
  });

  describe("Token Vesting and Claims", () => {
    beforeEach(() => {
      // Reset simulation
      simnet.reset();
      
      // Advance to public sale period
      while (simnet.blockHeight < WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // Buy tokens with wallet1
      simnet.callPublicFn("presale1", "buy", [Cl.uint(SOFTCAP)], wallet1);
      
      // Finalize presale
      simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        deployer
      );
    });

    it("should calculate correct allocation based on deposit", () => {
      const userInfo = getUserInfo(wallet1);
      const deposit = userInfo.deposit.expectUint();
      const allocation = userInfo.allocation.expectUint();
      
      // Calculate expected allocation: deposit * (TOKEN_TO_SELL / HARDCAP)
      const expectedAllocation = Math.floor((deposit * TOKEN_TO_SELL) / HARDCAP);
      expect(allocation).toBe(expectedAllocation);
    });

    it("should allow claiming tokens according to vesting schedule", () => {
      // Check initial vested percentage (should be 20% at milestone 1)
      const initialUserInfo = getUserInfo(wallet1);
      expect(initialUserInfo["vested-percent"].expectUint()).toBe(20); // MILESTONE_1_PERCENT
      
      // Claim tokens
      const claimResult = simnet.callPublicFn(
        "presale1", 
        "claim", 
        [contractPrincipalCV(deployer, "stxcity-token")], 
        wallet1
      );
      expect(claimResult.result.type).toBe("ok");
      
      // Check claimed amount
      const afterClaimInfo = getUserInfo(wallet1);
      expect(cvToValue(afterClaimInfo).claimed).toBeGreaterThan(0);
      
      // Advance to milestone 2
      advanceBlocks(500); // MILESTONE_2_BLOCKS
      
      // Check new vested percentage (should be 40% at milestone 2)
      const milestone2Info = getUserInfo(wallet1);
      expect(cvToValue(milestone2Info)["vested-percent"]).toBe(40); // MILESTONE_2_PERCENT
      
      // Claim more tokens
      const claim2Result = simnet.callPublicFn(
        "presale1", 
        "claim", 
        [contractPrincipalCV(deployer, "stxcity-token")], 
        wallet1
      );
      expect(claim2Result.result.type).toBe("ok");
      
      // Check new claimed amount is higher
      const afterClaim2Info = getUserInfo(wallet1);
      expect(afterClaim2Info.claimed.expectUint()).toBeGreaterThan(afterClaimInfo.claimed.expectUint());
    });

    it("should not allow claiming more than vested amount", () => {
      // Claim initial tokens
      simnet.callPublicFn(
        "presale1", 
        "claim", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet1
      );
      
      // Try to claim again immediately (should fail with nothing to claim)
      const secondClaimResult = simnet.callPublicFn(
        "presale1", 
        "claim", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet1
      );
      
      expect(secondClaimResult.result).toBeErr().toContain("u7006"); // ERR-NOTHING-TO-CLAIM
    });

    it("should allow claiming 100% after final milestone", () => {
      // Advance to final milestone
      advanceBlocks(2100); // MILESTONE_5_BLOCKS
      
      // Check vested percentage is 100%
      const finalInfo = getUserInfo(wallet1);
      expect(finalInfo["vested-percent"].expectUint()).toBe(100); // MILESTONE_5_PERCENT
      
      // Claim all tokens
      const claimResult = simnet.callPublicFn(
        "presale1", 
        "claim", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet1
      );
      expect(claimResult.result).toBeOk();
      
      // Check claimed amount equals allocation
      const afterClaimInfo = getUserInfo(wallet1);
      expect(afterClaimInfo.claimed.expectUint()).toBe(afterClaimInfo.allocation.expectUint());
      expect(afterClaimInfo.claimable.expectUint()).toBe(0); // Nothing left to claim
    });
  });

  describe("Failed Presale Scenarios", () => {
    beforeEach(() => {
      // Reset simulation
      simnet.reset();
      
      // Advance to public sale period
      while (simnet.blockHeight < WHITELIST_END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // Buy less than softcap
      simnet.callPublicFn("presale1", "buy", [Cl.uint(SOFTCAP - ONE_6)], wallet1);
      
      // Advance to after end block
      while (simnet.blockHeight < END_BLOCK) {
        simnet.mineEmptyBlock();
      }
    });

    it("should allow STX refunds if softcap not reached", () => {
      // Get initial STX balance
      const initialBalance = simnet.getAddressStxBalance(wallet1);
      
      // Claim refund
      const refundResult = simnet.callPublicFn("presale1", "claim-stx-refund", [], wallet1);
      expect(refundResult.result).toBeOk();
      
      // Check STX balance increased
      const finalBalance = simnet.getAddressStxBalance(wallet1);
      expect(finalBalance).toBeGreaterThan(initialBalance);
      
      // Check user deposit is now zero
      const userDeposit = simnet.callReadOnlyFn(
        "presale1", 
        "get-user-deposits", 
        [Cl.principal(wallet1)], 
        wallet1
      );
      expect(userDeposit.result.expectUint()).toBe(0);
    });

    it("should allow deployer to withdraw tokens if presale fails", () => {
      // Get initial token balance
      const initialBalance = simnet.callReadOnlyFn(
        "stxcity-token", 
        "get-balance", 
        [Cl.principal(deployer)], 
        deployer
      ).result.expectOk().expectUint();
      
      // Withdraw tokens
      const withdrawResult = simnet.callPublicFn(
        "presale1", 
        "withdraw-tokens-when-fail", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        deployer
      );
      expect(withdrawResult.result).toBeOk();
      
      // Check token balance increased
      const finalBalance = simnet.callReadOnlyFn(
        "stxcity-token", 
        "get-balance", 
        [Cl.principal(deployer)], 
        deployer
      ).result.expectOk().expectUint();
      expect(finalBalance).toBeGreaterThan(initialBalance);
    });
  });

  describe("Security and Edge Cases", () => {
    it("should not allow non-deployer to finalize presale", () => {
      const result = simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet1 // Not the deployer
      );
      
      expect(result.result).toBeErr().toContain("u1000"); // ERR-NOT-AUTHORIZED
    });

    it("should not allow non-deployer to withdraw tokens", () => {
      const result = simnet.callPublicFn(
        "presale1", 
        "withdraw-tokens-when-fail", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet1 // Not the deployer
      );
      
      expect(result.result).toBeErr().toContain("u1000"); // ERR-NOT-AUTHORIZED
    });

    it("should not allow claiming if user didn't participate", () => {
      // Advance to after presale and finalize
      while (simnet.blockHeight < END_BLOCK) {
        simnet.mineEmptyBlock();
      }
      
      // Buy with wallet1 to reach softcap
      simnet.callPublicFn("presale1", "buy", [Cl.uint(SOFTCAP)], wallet1);
      
      // Finalize presale
      simnet.callPublicFn(
        "presale1", 
        "finalize-presale", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        deployer
      );
      
      // Try to claim with wallet5 (didn't participate)
      const claimResult = simnet.callPublicFn(
        "presale1", 
        "claim", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet5
      );
      
      expect(claimResult.result).toBeErr().toContain("u7004"); // ERR-NOT-PARTICIPANT
    });

    it("should not allow claiming before distribution starts", () => {
      // Reset simulation
      simnet.reset();
      
      // Buy tokens with wallet1
      simnet.callPublicFn("presale1", "buy", [Cl.uint(SOFTCAP)], wallet1);
      
      // Try to claim before finalization
      const claimResult = simnet.callPublicFn(
        "presale1", 
        "claim", 
        [Cl.contractPrincipal(deployer, "stxcity-token")], 
        wallet1
      );
      
      expect(claimResult.result).toBeErr().toContain("u7002"); // ERR-PRESALE-NOT-ENDED
    });
  });
});
