They're complementary authorities, not redundant. Each owns a distinct layer:

| Document          | Authority      | Owns                                                                                 |
| ----------------- | -------------- | ------------------------------------------------------------------------------------ |
| **FIB-H / FIB-S** | Scope          | What may exist, what is forbidden, containment loop, anti-invention boundary         |
| **PRD**           | Requirements   | What the system must do, functional requirements, NFRs, DoD, open questions for EXEC |
| **EXEC-SPEC**     | Implementation | How to satisfy requirements within scope                                             |

**FIBs cannot replace the PRD because they don't carry:**
- Functional requirements (e.g. PRD §5.1 req 3: "int() must reject dollar-floats at outbound boundary after /100 removal")
- The Q-4 pre-flight mandate (§5.1 req 10) — that was a product/engineering decision, not a scope boundary
- NFRs (§5.2: "no `as any`, no schema bypass, no route-level reclassification")
- DoD checkboxes with evidence criteria
- Risk tables and open questions for EXEC

**PRDs cannot replace FIBs because they don't carry:**
- Machine-readable capability inventory (CAP-1 through CAP-7) that the EXEC-SPEC traces against
- Anti-invention enforcement (the check that EXEC output paths match FIB-S `zachman.where.surfaces`)
- Frozen scope containment — a PRD can be amended loosely, a FIB pair is the freeze record
- The adjacent-rejected ledger (why specific temptations were explicitly ruled out)

**In this build specifically:** the PRD gave me the requirement ordering rule (remove `/100` before enabling `int()`) and the Q-4 stop condition. The FIB-S gave me the capability inventory to trace workstreams against and enforce anti-invention. Both were load-bearing for generating a correct EXEC-SPEC.

The chain is intentional: **FIB → PRD → EXEC-SPEC**, each layer constrained by all upstream layers.

 fib-s efficacy as contrasted with fib-h?                                                                                                                                                                          
                                                                                                                                                                                                                
● From what the EXEC-074 generation actually exercised:                                                                                                                                                             
                                                                                                                                                                                                                
  FIB-H is load-bearing for:                                                                                                                                                                                        
  - Reasoning about edge cases. The Mechanical Compatibility Exception required prose judgment — "is this new logic or mechanical adaptation?" FIB-S can't encode that reasoning; it can only encode the outcome.
  - Adjacent-rejected ledger. The "why we didn't bundle UI migration" record lives in FIB-H. FIB-S has adjacent_rejected entries but they're summaries, not arguments.                                              
  - Ambiguous stop conditions. "Route-level compensation is prohibited" is easy to read in FIB-H. In FIB-S it's a prohibited list entry that can be ambiguous without context.
  - Human review and sign-off. The architect reads FIB-H, not FIB-S.                                                                                                                                                
                                                                                                                                                                                                                    
  FIB-S is load-bearing for:                                                                                                                                                                                        
  - Anti-invention enforcement. The pipeline's path-level scan (output paths vs zachman.where.surfaces[kind=api]) only works because FIB-S has machine-readable surface entries. FIB-H can't be grepped for this.   
  - Capability coverage check. "CAP-1 through CAP-7 all have a workstream trace" is a mechanical count against the FIB-S zachman.how.capabilities array. Prose can't be checked this way.                           
  - Decision-to-test injection. The pipeline reads governance.open_questions_allowed_at_scaffold and checks each Q is either resolved or carried — this is a structured list operation.                             
  - EXEC-SPEC traceability. Every workstream's traces_to: [CAP-1, CAP-2] references FIB-S capability IDs. FIB-H has no stable IDs to reference.                                                                     
                                                                                                                                                                                                                    
  The practical gap: FIB-H caught the spirit of the Q-4 stop condition ("UI edits prohibited") but FIB-S is what would mechanically validate that anomaly-alert-card.tsx is not in zachman.where.surfaces — making  
  the violation detectable without human reading. In this pipeline the Q-4 pre-flight was an explicit PRD requirement, not a FIB-S surface scan, so both were needed to catch it.                                   
                                                                                                                                                                                                                    
  Summary: FIB-H is the human authority; FIB-S is the machine enforcement surface. FIB-H without FIB-S is a governance doc that relies entirely on human reading. FIB-S without FIB-H loses the reasoning record    
  that justifies why the boundary is where it is — which matters the moment someone asks "can we just add X?"
