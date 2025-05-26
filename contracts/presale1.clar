
;; STXCITY Presale Contract v1

(use-trait ft-trait .sip-010-trait-ft-standard.sip-010-trait)

;; ERRORS
(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-INITIALIZED (err u1001))
(define-constant ERR-NOT-INITIALIZED (err u1002))
(define-constant ERR-INSUFFICIENT-AMOUNT (err u5001))
(define-constant ERR-ZERO-AMOUNT (err u5002))
(define-constant ERR-INVALID-AMOUNT (err u5003))

(define-constant ERR-PRESALE-ENDED (err u7001))
(define-constant ERR-PRESALE-NOT-ENDED (err u7002))
(define-constant ERR-INVALID-TOKEN (err u7003))
(define-constant ERR-NOT-PARTICIPANT (err u7004))

(define-constant ERR-NOTHING-TO-CLAIM (err u7006))
(define-constant ERR-MAX-DEPOSIT-EXCEEDED (err u8001))
(define-constant ERR-HARDCAP-EXCEEDED (err u8002))
(define-constant ERR-SOFTCAP-NOT-REACHED (err u8003))
(define-constant ERR-DISTRIBUTION-ALREADY-STARTED (err u8004))
(define-constant ERR-NOT-WHITELISTED (err u8005))

;; CONSTANTS
(define-constant ONE_6 u1000000) 
(define-constant LAUNCHPAD_TOKEN .stxcity-token)
(define-constant LAUNCHPAD_ADDRESS (as-contract tx-sender))
(define-constant AMM_WALLET 'ST351YPXNR61E8137E5VNBW31AZQ88MB2DMNXFFF6) ;; TODO: replace real amm here
(define-constant STXCITY_WALLET 'ST1YCCFFCV8G9V2CSXRY8T7H8KYZCN4QWDF9SYEM7) ;; STXCITY wallet
(define-constant TOKEN_TO_LIST u300000000) ;; 300M 
(define-constant TOKEN_TO_SELL u200000000) ;; 200M
(define-constant START_BLOCK u50229) ;; default 5 block from create
(define-constant WHITELIST_END_BLOCK u55229) ;; End of whitelist period, start of public sale
(define-constant END_BLOCK u60228)


;; Vesting milestone constants
;; These define the block heights and percentages for token vesting
;; IMPORTANT: When customizing milestones, follow these rules:
;; 1. Milestone percentages MUST be in ascending order (each one higher than the previous)
;; 2. The final active milestone MUST be set to 100% (u100)
;; 3. If using fewer milestones, adjust ACTIVE_MILESTONE_COUNT accordingly

;; Block heights (relative to distribution start)
(define-constant MILESTONE_1_BLOCKS u0)      ;; Immediate - 20% unlocked right after finalize-presale
(define-constant MILESTONE_2_BLOCKS u500)    ;; ~3.5 days - 40% unlocked
(define-constant MILESTONE_3_BLOCKS u1000)   ;; 7 days - 60% unlocked
(define-constant MILESTONE_4_BLOCKS u1500)   ;; 10.4 days - 80% unlocked
(define-constant MILESTONE_5_BLOCKS u2100)   ;; 14.6 days - 100% unlocked

;; Vesting percentages at each milestone
(define-constant MILESTONE_1_PERCENT u20)    ;; 20%
(define-constant MILESTONE_2_PERCENT u40)    ;; 40%
(define-constant MILESTONE_3_PERCENT u60)    ;; 60%
(define-constant MILESTONE_4_PERCENT u80)    ;; 80%
(define-constant MILESTONE_5_PERCENT u100)   ;; 100% - final milestone

;; Set how many milestones are actually used (1-5)
(define-constant ACTIVE_MILESTONE_COUNT u5)


;; STATE VARIABLES
(define-data-var initialized bool false)
(define-data-var deployer principal tx-sender)
(define-data-var stx-pool uint u0)
(define-data-var participant-amount uint u0)
(define-data-var presale-hardcap uint u100000000)  ;; 200 STX
(define-data-var presale-softcap uint u50000000)   ;; 100 STX
(define-data-var min-buy uint u1000000)             ;; 10 STX
(define-data-var max-buy uint u50000000)             ;; 50 STX
(define-data-var distribution-height uint u0)        ;; When tokens start vesting



;; MAPS
(define-map users-deposits
    { user-addr: principal }
    uint
)

(define-map claimed-amounts 
    { user-addr: principal }
    uint
)

;; Whitelist map - stores addresses that can participate during whitelist period
(define-map whitelist-addresses principal bool)

;; READ-ONLY FUNCTIONS

;; Get comprehensive information about the presale status and configuration
(define-read-only (get-presale-info)
  (let
    (
      (current-block burn-block-height)
      (has-ended (<= END_BLOCK current-block))
      (has-started (<= START_BLOCK current-block))
      (hardcap-reached (>= (var-get stx-pool) (var-get presale-hardcap)))
      (softcap-reached (>= (var-get stx-pool) (var-get presale-softcap)))
      (distribution-started (> (var-get distribution-height) u0))
      (whitelist-active (and (<= START_BLOCK current-block) (< current-block WHITELIST_END_BLOCK)))
      (user-is-whitelisted (default-to false (map-get? whitelist-addresses tx-sender)))
    )
    (ok 
      {
        ;; Contract state
        initialized: (var-get initialized),
        ;; Token info
        token: LAUNCHPAD_TOKEN,
        token-to-sell: TOKEN_TO_SELL,
        token-to-list: TOKEN_TO_LIST,
        
        ;; Presale parameters
        softcap: (var-get presale-softcap),
        hardcap: (var-get presale-hardcap),
        min-buy: (var-get min-buy),
        max-buy: (var-get max-buy),
        start-block: START_BLOCK,
        end-block: END_BLOCK,
        
        ;; Current status
        total-stx-raised: (var-get stx-pool),
        participants: (var-get participant-amount),
        current-block: current-block,
        has-started: has-started,
        has-ended: has-ended,
        hardcap-reached: hardcap-reached,
        softcap-reached: softcap-reached,
        
        ;; Distribution info
        deployer: (var-get deployer),
        distribution-height: (var-get distribution-height),
        distribution-started: distribution-started,
        
        ;; Whitelist info
        whitelist-end-block: WHITELIST_END_BLOCK,
        whitelist-active: whitelist-active,
        is-whitelisted: user-is-whitelisted,
        
        ;; Progress indicators
        progress-percentage: (if (> (var-get presale-hardcap) u0)
                               (/ (* (var-get stx-pool) u100) (var-get presale-hardcap))
                               u0),
        softcap-percentage: (if (> (var-get presale-hardcap) u0)
                             (/ (* (var-get presale-softcap) u100) (var-get presale-hardcap))
                             u0)
      }
    )
  )
)

(define-read-only (get-user-deposits (user-addr principal)) 
  (default-to u0 (map-get? users-deposits {user-addr: user-addr}))
)

(define-read-only (calculate-allocation (user-addr principal))
  (let
    ((user-deposit (get-user-deposits user-addr)))
    ;; Multiply by the rate and divide by precision factor
    (/ (* (get-stx-quote) user-deposit) ONE_6) 
  )
)

;; Returns the fixed exchange rate of how many tokens you get for 1 STX
;; Uses a precision factor of 1,000,000 to ensure non-zero results
;; The result should be divided by 1,000,000 when used in calculations
(define-read-only (get-stx-quote)
  (if (> (var-get presale-hardcap) u0)
    (/ (* TOKEN_TO_SELL ONE_6) (var-get presale-hardcap))
    u0
  )
)

(define-read-only (get-claimed-amount (user-addr principal)) 
  (default-to u0 (map-get? claimed-amounts { user-addr: user-addr }))
)

(define-read-only (get-vesting-schedule)
  (ok {
    milestone1: {blocks: MILESTONE_1_BLOCKS, percent: MILESTONE_1_PERCENT},
    milestone2: {blocks: MILESTONE_2_BLOCKS, percent: MILESTONE_2_PERCENT},
    milestone3: {blocks: MILESTONE_3_BLOCKS, percent: MILESTONE_3_PERCENT},
    milestone4: {blocks: MILESTONE_4_BLOCKS, percent: MILESTONE_4_PERCENT},
    milestone5: {blocks: MILESTONE_5_BLOCKS, percent: MILESTONE_5_PERCENT}
  })
)

(define-read-only (get-user-info (user principal))
  (ok
    {
      deposit: (get-user-deposits user),
      allocation: (calculate-allocation user),
      claimed: (get-claimed-amount user),
      claimable: (get-claimable-amount user),

      current-block: burn-block-height,
      distribution-height: (var-get distribution-height),
      vested-percent: (get-vested-percentage),
      vested-amount: (/ (* (calculate-allocation user) (get-vested-percentage)) u100),  

      milestones: (get-vesting-schedule),
    }
  )
)

;; Calculate total tokens allocated to participants based on STX raised
(define-read-only (get-total-allocated)
  ;; Multiply by the rate and divide by precision factor
  (/ (* (get-stx-quote) (var-get stx-pool)) ONE_6)
)

(define-read-only (get-current-block-height)
  (ok {stacks: burn-block-height, bitcoin: burn-block-height})
)

;; PUBLIC FUNCTIONS

;; Deposit STX to participate in presale
(define-public (buy (amount uint))
  (let
    (
      (current-stx-pool (var-get stx-pool))
      (exists (is-some (map-get? users-deposits { user-addr: tx-sender })))
      (user-deposit (get-user-deposits tx-sender))
      (participants (var-get participant-amount))
    )
    (try! (check-is-initialized))
    
    ;; Validate deposit
    (asserts! (> END_BLOCK burn-block-height) ERR-PRESALE-ENDED)
    (asserts! (<= (var-get distribution-height) u0) ERR-DISTRIBUTION-ALREADY-STARTED)
    
    ;; Check whitelist status if in whitelist period
    (if (and (<= START_BLOCK burn-block-height) (< burn-block-height WHITELIST_END_BLOCK))
      ;; During whitelist period, check if user is whitelisted
      (asserts! (default-to false (map-get? whitelist-addresses tx-sender)) ERR-NOT-WHITELISTED)
      ;; After whitelist period or if whitelist equals start/end (no whitelist), anyone can buy
      true
    )
    (asserts! (>= amount (var-get min-buy)) ERR-INSUFFICIENT-AMOUNT)
    (asserts! (<= (+ user-deposit amount) (var-get max-buy)) ERR-MAX-DEPOSIT-EXCEEDED)
    (asserts! (<= (+ amount current-stx-pool) (var-get presale-hardcap)) ERR-HARDCAP-EXCEEDED)
    
    
    ;; Process deposit
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (var-set stx-pool (+ current-stx-pool amount))
    (map-set users-deposits {user-addr: tx-sender} (+ user-deposit amount))
    
    ;; Update participant count if new user
    (if (not exists)
      (var-set participant-amount (+ participants u1))
      true
    )
    
    ;; Print appropriate event data
    (print {
      type: (if exists "deposit" "deposit-new-user"),
      user: tx-sender,
      amount: amount,
      total-deposit: (+ user-deposit amount),
      total-participants: (if exists participants (+ participants u1))
    })
    
    (ok true)
  )
)


;; Finalize presale and start vesting
(define-public (finalize-presale (token-trait <ft-trait>))
  (begin
    (try! (check-is-initialized))
    (try! (check-is-deployer))
    
    (asserts! (is-eq (contract-of token-trait) LAUNCHPAD_TOKEN) ERR-INVALID-TOKEN)
    ;; Ensure presale can be finalized under one of these conditions:
    ;; 1. Presale ended AND softcap reached
    ;; 2. Hardcap reached (can finalize anytime)
    ;; 3. Softcap reached AND owner wants to finalize early (before end time)
    (asserts! (or 
              ;; Condition 1: Presale ended (time) AND softcap reached
              (and 
                (<= END_BLOCK burn-block-height)
                (>= (var-get stx-pool) (var-get presale-softcap))
              )
              ;; Condition 2: Hardcap reached (can finalize anytime)
              (>= (var-get stx-pool) (var-get presale-hardcap))
              ;; Condition 3: Softcap reached but presale not ended (early finalization)
              (and
                (> END_BLOCK burn-block-height)
                (>= (var-get stx-pool) (var-get presale-softcap))
              )
              ) ERR-PRESALE-NOT-ENDED)
    
    ;; Set distribution height to current block
    (var-set distribution-height burn-block-height)
    
    ;; Calculate 5% of raised STX for STXCITY wallet
    (let ((stxcity-amount (/ (* (var-get stx-pool) u5) u100)))
      ;; Send 5% of raised STX to STXCITY wallet
      (try! (as-contract (stx-transfer? stxcity-amount tx-sender STXCITY_WALLET)))
      
      ;; Send remaining 95% of raised STX to AMM_WALLET
      (try! (as-contract (stx-transfer? (- (var-get stx-pool) stxcity-amount) tx-sender AMM_WALLET)))
    )
    ;; Send token to AMM_WALLET
    (try! (as-contract (contract-call? token-trait transfer TOKEN_TO_LIST tx-sender AMM_WALLET none)))
    
    
    (print {
      type: "presale-finalized",
      stx-raised: (var-get stx-pool),
      participants: (var-get participant-amount),
      distribution-height: burn-block-height
    })
    (ok true)
  )
)



;; Claim vested tokens based on the vesting schedule
(define-public (claim (token-trait <ft-trait>))
  (let
    (
      (user tx-sender)
      (claimable (get-claimable-amount user))
    )
    (try! (check-is-initialized))
    
    ;; Validate claim conditions
    (asserts! (> (var-get distribution-height) u0) ERR-PRESALE-NOT-ENDED)
    (asserts! (is-eq (contract-of token-trait) LAUNCHPAD_TOKEN) ERR-INVALID-TOKEN)
    (asserts! (> (get-user-deposits user) u0) ERR-NOT-PARTICIPANT)
    (asserts! (> claimable u0) ERR-NOTHING-TO-CLAIM)
    
    ;; Process claim - transfer tokens from contract to user
    (try! (as-contract (contract-call? token-trait transfer claimable tx-sender user none)))
    
    ;; Update claimed amount in the ledger
    (map-set claimed-amounts { user-addr: user } 
      (+ (get-claimed-amount user) claimable))
    
    (print {
      type: "claim",
      user: user,
      amount: claimable,
      total-claimed: (+ (get-claimed-amount user) claimable)
    })
    
    (ok claimable)
  )
)

;; Allow users to claim their STX back if presale fails to reach softcap
(define-public (claim-stx-refund)
  (let
    (
      (user tx-sender)
      (user-deposit (get-user-deposits user))
    )
    (try! (check-is-initialized))
    
    ;; Refunds are only allowed when:
    ;; 1. The presale period has ended
    (asserts! (<= END_BLOCK burn-block-height) ERR-PRESALE-NOT-ENDED)
    ;; 2. The softcap was not reached (failed presale)
    (asserts! (< (var-get stx-pool) (var-get presale-softcap)) ERR-SOFTCAP-NOT-REACHED)
    
    (asserts! (> user-deposit u0) ERR-NOT-PARTICIPANT)
    
    ;; Process refund - transfer from contract back to user
    (try! (as-contract (stx-transfer? user-deposit tx-sender user)))
    
    ;; Update state
    (map-set users-deposits {user-addr: user} u0)
    (var-set stx-pool (- (var-get stx-pool) user-deposit))
    
    (print {
      type: "refund",
      user: user,
      amount: user-deposit
    })
    
    (ok user-deposit)
  )
)


;; Withdraw all tokens if presale fails to reach softcap
(define-public (withdraw-tokens-when-fail (token-trait <ft-trait>))
  (begin
    (try! (check-is-deployer))
    (asserts! (is-eq (contract-of token-trait) LAUNCHPAD_TOKEN) ERR-INVALID-TOKEN)
    ;; Only allow withdrawal if presale has ended and softcap wasn't reached and distribution hasn't started
    (asserts! (<= END_BLOCK burn-block-height) ERR-PRESALE-NOT-ENDED)
    (asserts! (< (var-get stx-pool) (var-get presale-softcap)) ERR-SOFTCAP-NOT-REACHED)
    (asserts! (is-eq (var-get distribution-height) u0) ERR-PRESALE-NOT-ENDED)

    (let
      (
        (token-balance (unwrap-panic (contract-call? token-trait get-balance LAUNCHPAD_ADDRESS)))
      )
      ;; Transfer all tokens back to the deployer since the presale failed
      (try! (as-contract (contract-call? token-trait transfer token-balance tx-sender (var-get deployer) none)))
      
      (print {
        type: "withdraw-tokens-failed-presale",
        amount: token-balance,
        recipient: (var-get deployer),
        reason: "presale-failed-to-reach-softcap"
      })
      
      (ok token-balance)
    )
  )
)

;; Withdraw unsold tokens after presale has been finalized successfully
(define-public (withdraw-tokens-after-finalize (token-trait <ft-trait>))
  (begin
    (try! (check-is-deployer))
    ;; Only allow withdrawal if presale has been finalized
    (asserts! (> (var-get distribution-height) u0) ERR-PRESALE-NOT-ENDED)
    (asserts! (is-eq (contract-of token-trait) LAUNCHPAD_TOKEN) ERR-INVALID-TOKEN)
    
    (let
      (
        ;; Calculate total tokens allocated to participants
        (total-allocated (get-total-allocated))
        ;; Calculate unsold tokens
        (unsold-tokens (- TOKEN_TO_SELL total-allocated))
        ;; Get current token balance in the contract
        (token-balance (unwrap-panic (contract-call? token-trait get-balance LAUNCHPAD_ADDRESS)))
        ;; Calculate withdrawable amount (min of unsold tokens and actual balance)
        (withdrawable-amount (if (< token-balance unsold-tokens) token-balance unsold-tokens))
      )
      ;; Ensure there are tokens to withdraw
      (asserts! (> withdrawable-amount u0) ERR-NOTHING-TO-CLAIM)
      
      ;; Transfer unsold tokens back to the deployer
      (try! (as-contract (contract-call? token-trait transfer withdrawable-amount tx-sender (var-get deployer) none)))
      
      (print {
        type: "withdraw-unsold-tokens",
        amount: withdrawable-amount,
        recipient: (var-get deployer),
        total-allocated: total-allocated,
        total-unsold: unsold-tokens
      })
      
      (ok withdrawable-amount)
    )
  )
)
;; PRIVATE FUNCTIONS

(define-private (check-is-deployer)
  (ok (asserts! (is-eq tx-sender (var-get deployer)) ERR-NOT-AUTHORIZED))
)

;; Whitelist management functions

;; Add a single address to the whitelist
(define-public (add-to-whitelist (address principal))
  (begin
    (try! (check-is-deployer))
    (map-set whitelist-addresses address true)
    
    (print {
      type: "whitelist-add",
      address: address
    })
    
    (ok true)
  )
)

;; Add multiple addresses to the whitelist
(define-public (add-addresses-to-whitelist (addresses (list 200 principal)))
  (begin
    (try! (check-is-deployer))
    (map add-address addresses)
    
    (print {
      type: "whitelist-add-batch",
      count: (len addresses)
    })
    
    (ok true)
  )
)

;; Helper function to add address to whitelist
(define-private (add-address (address principal))
  (map-set whitelist-addresses address true)
)

;; Remove an address from the whitelist
(define-public (remove-from-whitelist (address principal))
  (begin
    (try! (check-is-deployer))
    (map-delete whitelist-addresses address)
    
    (print {
      type: "whitelist-remove",
      address: address
    })
    
    (ok true)
  )
)

;; Check if an address is whitelisted
(define-read-only (check-is-whitelisted (address principal))
  (default-to false (map-get? whitelist-addresses address))
)

(define-private (check-is-initialized)
  (ok (asserts! (var-get initialized) ERR-NOT-INITIALIZED))
)
;; Calculate claimable amount based on vesting schedule
(define-private (get-claimable-amount (user principal))
  ;; If distribution hasn't started yet, nothing is claimable
  (if (<= (var-get distribution-height) u0)
    u0
    (let 
      (
        (claimed (get-claimed-amount user))
        (allocation (calculate-allocation user))
        (vested-percent (get-vested-percentage))
        ;; Do multiplication before division to preserve precision
        (vested-amount (/ (* allocation vested-percent) u100))
      )
      ;; Ensure result is never negative
      (if (>= vested-amount claimed)
        (- vested-amount claimed)
        u0)
    )
  )
)

(define-private (get-vested-percentage)
  (let
    (
      (current-block burn-block-height)
      (dist-height (var-get distribution-height))
    )
    ;; Call the appropriate function based on ACTIVE_MILESTONE_COUNT
    (if (is-eq ACTIVE_MILESTONE_COUNT u1)
      (get-vested-percentage-1 current-block dist-height)
      (if (is-eq ACTIVE_MILESTONE_COUNT u2)
        (get-vested-percentage-2 current-block dist-height)
        (if (is-eq ACTIVE_MILESTONE_COUNT u3)
          (get-vested-percentage-3 current-block dist-height)
          (if (is-eq ACTIVE_MILESTONE_COUNT u4)
            (get-vested-percentage-4 current-block dist-height)
            (get-vested-percentage-5 current-block dist-height) ;; Default to 5 milestones
          )
        )
      )
    )
  )
)

;; Helper functions for different milestone counts

;; 5 milestones version
(define-private (get-vested-percentage-5 (current-block uint) (dist-height uint))
  (let
    (
      (milestone1 (+ dist-height MILESTONE_1_BLOCKS))
      (milestone2 (+ dist-height MILESTONE_2_BLOCKS))
      (milestone3 (+ dist-height MILESTONE_3_BLOCKS))
      (milestone4 (+ dist-height MILESTONE_4_BLOCKS))
      (milestone5 (+ dist-height MILESTONE_5_BLOCKS))
    )
    (if (>= current-block milestone5) 
      MILESTONE_5_PERCENT  ;; 60% vested
      (if (>= current-block milestone4)
        MILESTONE_4_PERCENT   ;; 45% vested
        (if (>= current-block milestone3)
          MILESTONE_3_PERCENT   ;; 30% vested
          (if (>= current-block milestone2)
            MILESTONE_2_PERCENT   ;; 20% vested
            (if (>= current-block milestone1)
              MILESTONE_1_PERCENT   ;; 10% vested
              u0    ;; 0% vested
            )
          )
        )
      )
    )
  )
)

;; 4 milestones version
(define-private (get-vested-percentage-4 (current-block uint) (dist-height uint))
  (let
    (
      (milestone1 (+ dist-height MILESTONE_1_BLOCKS))
      (milestone2 (+ dist-height MILESTONE_2_BLOCKS))
      (milestone3 (+ dist-height MILESTONE_3_BLOCKS))
      (milestone4 (+ dist-height MILESTONE_4_BLOCKS))
    )
    (if (>= current-block milestone4) 
      MILESTONE_4_PERCENT  ;; 45% vested
      (if (>= current-block milestone3)
        MILESTONE_3_PERCENT   ;; 30% vested
        (if (>= current-block milestone2)
          MILESTONE_2_PERCENT   ;; 20% vested
          (if (>= current-block milestone1)
            MILESTONE_1_PERCENT   ;; 10% vested
            u0    ;; 0% vested
          )
        )
      )
    )
  )
)

;; 3 milestones version
(define-private (get-vested-percentage-3 (current-block uint) (dist-height uint))
  (let
    (
      (milestone1 (+ dist-height MILESTONE_1_BLOCKS))
      (milestone2 (+ dist-height MILESTONE_2_BLOCKS))
      (milestone3 (+ dist-height MILESTONE_3_BLOCKS))
    )
    (if (>= current-block milestone3) 
      MILESTONE_3_PERCENT  ;; 30% vested
      (if (>= current-block milestone2)
        MILESTONE_2_PERCENT   ;; 20% vested
        (if (>= current-block milestone1)
          MILESTONE_1_PERCENT   ;; 10% vested
          u0    ;; 0% vested
        )
      )
    )
  )
)

;; 2 milestones version
(define-private (get-vested-percentage-2 (current-block uint) (dist-height uint))
  (let
    (
      (milestone1 (+ dist-height MILESTONE_1_BLOCKS))
      (milestone2 (+ dist-height MILESTONE_2_BLOCKS))
    )
    (if (>= current-block milestone2) 
      MILESTONE_2_PERCENT  ;; 20% vested
      (if (>= current-block milestone1)
        MILESTONE_1_PERCENT   ;; 10% vested
        u0    ;; 0% vested
      )
    )
  )
)

;; 1 milestone version
(define-private (get-vested-percentage-1 (current-block uint) (dist-height uint))
  (let
    (
      (milestone1 (+ dist-height MILESTONE_1_BLOCKS))
    )
    (if (>= current-block milestone1) 
      MILESTONE_1_PERCENT  ;; 10% vested
      u0    ;; 0% vested
    )
  )
)



;; Validate milestone percentages
(define-private (validate-milestone-percentages)
  (let
    (
      (is-valid (and 
                  ;; Check that percentages are in ascending order
                  (< MILESTONE_1_PERCENT MILESTONE_2_PERCENT)
                  (< MILESTONE_2_PERCENT MILESTONE_3_PERCENT)
                  (< MILESTONE_3_PERCENT MILESTONE_4_PERCENT)
                  (< MILESTONE_4_PERCENT MILESTONE_5_PERCENT)
                  
                  ;; Check that the final active milestone is 100%
                  (is-eq (unwrap-panic 
                           (element-at 
                             (list MILESTONE_1_PERCENT MILESTONE_2_PERCENT MILESTONE_3_PERCENT 
                                   MILESTONE_4_PERCENT MILESTONE_5_PERCENT) 
                             (- ACTIVE_MILESTONE_COUNT u1)
                           )
                         ) 
                         u100)
                ))
    )
    (asserts! is-valid (err u10000)) ;; Error if milestone configuration is invalid
    (ok true)
  )
)

(begin
    ;; Auto-initialize the presale contract
    ;; Set up the presale parameters
            ;; Validate milestone configuration
            (try! (validate-milestone-percentages))
            
            (try! (contract-call? .stxcity-token transfer (+ TOKEN_TO_LIST TOKEN_TO_SELL) tx-sender LAUNCHPAD_ADDRESS none))
            (var-set initialized true)
            (print {
                type: "initialize-presale",
                token-amount: (+ TOKEN_TO_LIST TOKEN_TO_SELL),
                start-block: START_BLOCK,
                end-block: END_BLOCK
            })
    ;; Transfer STX fee to stxcity wallet
    (try! (stx-transfer? u200000 tx-sender 'ST2J9WNZV97AJ49ZDR77WGNR3HDHQRSEHZ45JXB21))
    (print (get-presale-info))
)