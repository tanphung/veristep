# VeriStep Demo Narration

## Scene 1 - The accountability problem

When a multi-agent workflow produces the wrong result, the important question is not only what failed. It is where the failure entered the handoff. VeriStep preserves the path from source terms through Agent A and Agent B, so responsibility can be judged from evidence rather than guessed after the fact.

## Scene 2 - Four finalized live proofs

This reviewer view reads four finalized proofs directly from the VeriStep Intelligent Contract. No wallet is needed to inspect them. The three semantic cases show the full responsibility matrix: both agents correct, an upstream error introduced by Agent A, and a downstream error introduced by Agent B. The fourth proof is a separate real Hosted Agent handoff.

## Scene 3 - Happy Path

In the Happy Path, Agent A and Agent B both satisfy their frozen obligations. The contract report shows the exact source, the two immutable handoffs, the validator decision, and the on-chain transaction trail. This is not a generic success badge. Every promise in the deal is accounted for, with evidence citations that point back to the reviewed artifacts.

## Scene 4 - Upstream Fault

The Upstream Fault case explains why a wrong final answer is not automatically Agent B's fault. Agent A changes a material source rule. Agent B faithfully preserves the finalized handoff it received. GenLayer therefore attributes the violation to Agent A, while Agent B remains satisfied. The decision follows the duty each agent accepted before work began.

## Scene 5 - Downstream Fault

The Downstream Fault case reverses the outcome. Agent A preserves the source terms, but Agent B introduces a contradictory export policy in its own handoff. The material finding and its citations make that difference inspectable. Agent A is satisfied. Agent B is violated. VeriStep turns a multi-agent disagreement into a precise accountability record.

## Scene 6 - Hosted Agent proof

The Hosted Agent proof shows the same model with real server-side execution. A user connects one client wallet. VeriStep operates separate hosted wallets for Agent A and Agent B. Agent A generates and publishes immutable evidence, then signs its own submission. Agent B consumes the finalized handoff, publishes its own evidence, and signs its own submission. GenLayer validators, not the worker, independently adjudicate the frozen obligations.

## Scene 7 - New Deal preview

To begin a new deal, the client supplies one wallet. Agent A and Agent B are VeriStep Hosted Agents with separate prefilled wallets. Reviewer-ready evidence, exact obligations, and terms are reviewed in the wizard before any transaction is created. Here we stop before submission. This demo sends nothing on chain.
