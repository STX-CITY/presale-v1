# STXCITY Presale Contract

This repository contains the smart contracts for the STXCITY token presale. The presale contract is designed to facilitate a fair and transparent token distribution with features like whitelisting, vesting schedules, and automated fund distribution.

You can use the testnet version of this contract at: https://testnet.stx.city/presale/explore
Create a testnet presale at: https://testnet.stx.city/presale/create

## Contract Overview

The presale contract (`presale1.clar`) manages the entire token sale process, from accepting STX deposits to distributing tokens according to a vesting schedule. It includes mechanisms for whitelisting participants, enforcing minimum and maximum purchase limits, and handling both successful and failed presale scenarios.

## Key Features

### 1. Presale Parameters

- **Token Allocation**: The contract allocates tokens for sale (`TOKEN_TO_SELL`) and for liquidity provision (`TOKEN_TO_LIST`).
- **Caps**: Configurable softcap and hardcap to ensure minimum viability and maximum raise.
- **Purchase Limits**: Minimum and maximum purchase amounts per participant.
- **Timeline**: Configurable start and end blocks, with optional whitelist period.

### 2. Whitelist Functionality

- **Whitelist Period**: Optional period where only whitelisted addresses can participate.
- **Whitelist Management**: Functions to add and remove addresses from the whitelist.
- **Public Sale**: After the whitelist period ends, anyone can participate until the end block is reached.

### 3. Vesting Schedule

- **Milestone-based Vesting**: Tokens are released according to a configurable vesting schedule.
- **Flexible Configuration**: Supports 1-5 milestones with customizable block heights and percentages.
- **Claiming Mechanism**: Participants can claim their vested tokens at any time after distribution starts.

### 4. Fund Distribution

- **Fee Structure**: 5% of raised STX goes to the STXCITY wallet as a platform fee.
- **Deployer Return**: 50% of the remaining funds (after fee) are returned to the deployer.
- **Liquidity Provision**: The remaining 45% of funds are sent to the AMM wallet for liquidity.

### 5. Safety Mechanisms

- **Refund System**: If the softcap is not reached, participants can claim refunds.
- **Token Recovery**: Deployer can recover tokens if the presale fails or withdraw unsold tokens after a successful presale.
- **Authorization Checks**: Critical functions are protected with deployer-only access.

## Contract Flow

1. **Initialization**: The contract is initialized with token allocation, presale parameters, and vesting schedule.
2. **Whitelist Period**: (Optional) Only whitelisted addresses can participate.
3. **Public Sale**: Anyone can participate until the end block or hardcap is reached.
4. **Finalization**:
   - If softcap is reached: The presale is finalized, funds are distributed, and vesting begins.
   - If softcap is not reached: Participants can claim refunds, and the deployer can recover tokens.
5. **Token Distribution**: Participants can claim their tokens according to the vesting schedule.

## Key Functions

### User Functions

- `buy(amount)`: Participate in the presale by sending STX.
- `claim(token-trait)`: Claim vested tokens after presale finalization.
- `claim-stx-refund()`: Claim STX refund if presale fails to reach softcap.

### Admin Functions

- `finalize-presale(token-trait)`: Finalize the presale and start the vesting period.
- `add-to-whitelist(address)` / `add-addresses-to-whitelist(addresses)`: Manage whitelist.
- `withdraw-tokens-when-fail(token-trait)`: Recover tokens if presale fails.
- `withdraw-tokens-after-finalize(token-trait)`: Withdraw unsold tokens after successful presale.

### Read-Only Functions

- `get-presale-info()`: Get comprehensive information about the presale status.
- `get-user-info(user)`: Get information about a specific user's participation.
- `get-user-vesting-details(user)`: Get detailed vesting information for a user.
- `get-vesting-schedule()`: Get the vesting schedule configuration.

## Vesting Schedule Configuration

The contract uses a milestone-based vesting schedule:

- **Milestone 1**: Block 0 - 20% (immediate upon finalization)
- **Milestone 2**: Block 500 - 40% (approximately 3.5 days)
- **Milestone 3**: Block 1000 - 60% (approximately 7 days)
- **Milestone 4**: Block 1500 - 80% (approximately 10.4 days)
- **Milestone 5**: Block 2100 - 100% (approximately 14.6 days)

## Detailed Vesting Mechanism

### How Vesting Works

The vesting mechanism in the presale contract is designed to gradually release tokens to participants over time, encouraging long-term holding and reducing market volatility. Here's a detailed explanation of how it works:

### 1. Vesting Initialization

When the presale is finalized (via the `finalize-presale` function), the contract records the current block height as the `distribution-height`. This block height serves as the reference point for all vesting calculations.

### 2. Milestone Calculation

Each milestone is defined by two parameters:
- A block height offset from the `distribution-height`
- A percentage of tokens that becomes available at that milestone

For example, if `distribution-height` is set to block 50000:
- Milestone 1 would be at block 50000 (immediate) with 20% of tokens available
- Milestone 2 would be at block 50500 (50000 + 500) with 40% of tokens available
- And so on...

### 3. Vested Percentage Determination

At any given time, the contract calculates the current vested percentage using the `get-vested-percentage` function, which:

1. Gets the current block height
2. Compares it against each milestone's block height
3. Returns the percentage corresponding to the highest milestone that has been reached

The contract is flexible and can work with 1-5 milestones, determined by the `ACTIVE_MILESTONE_COUNT` constant. Depending on this value, one of five different functions is used to calculate the vested percentage.

### 4. Claimable Amount Calculation

When a user attempts to claim tokens, the contract:

1. Calculates their total allocation based on their STX contribution using `calculate-allocation`
2. Determines the current vested percentage using `get-vested-percentage`
3. Multiplies the allocation by the vested percentage to get the total amount vested so far
4. Subtracts any previously claimed tokens to determine the currently claimable amount

This is implemented in the `get-claimable-amount` function.

### 5. Token Claiming

Users can call the `claim` function at any time after the presale is finalized. The contract will:

1. Calculate how many tokens the user can claim at the current block height
2. Transfer that amount from the contract to the user
3. Update the user's claimed amount in the `claimed-amounts` map
4. Allow the user to claim more tokens as additional milestones are reached

### 6. Advanced Vesting Information

The contract provides a detailed view of a user's vesting status through the `get-user-vesting-details` function, which returns:

- Total token allocation
- Amount claimed so far
- Amount currently claimable
- Current vested percentage
- Information about the current milestone
- Information about the next milestone (if any)
- Detailed information about all milestones, including whether they've been reached

### 7. Vesting Configuration Validation

To ensure the vesting schedule is properly configured, the contract includes a `validate-milestone-percentages` function that verifies:

- Percentages are in ascending order (each milestone unlocks more tokens than the previous one)
- The final active milestone is set to 100% (ensuring all tokens can eventually be claimed)

This validation is performed during contract initialization to prevent configuration errors.

## Fund Distribution

When the presale is finalized:

1. 5% of raised STX goes to the STXCITY wallet as a platform fee.
2. From the remaining 95%:
   - 50% goes to the deployer (47.5% of total)
   - 50% goes to the AMM wallet for liquidity (47.5% of total)
3. All tokens allocated for liquidity (`TOKEN_TO_LIST`) are sent to the AMM wallet.

## Security Considerations

- The contract includes authorization checks to ensure only the deployer can perform administrative actions.
- Funds are held in the contract until the presale is finalized or refunded.
- The vesting schedule is enforced by the contract to ensure fair distribution.
- Milestone configuration is validated to ensure proper vesting percentages.

## Testing

The contract includes comprehensive tests in the `tests` directory to verify all functionality, including:

- Buying tokens during whitelist and public periods
- Enforcing minimum and maximum purchase limits
- Finalizing the presale and distributing funds
- Claiming tokens according to the vesting schedule
- Handling refunds in case of failed presale
