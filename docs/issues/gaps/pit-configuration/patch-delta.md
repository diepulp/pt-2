Approved, with a few caveats.

The issue is legitimate: the brief describes a real post-bootstrap gap where tables can exist, pit assignment can be deferred, and there is no correction path later, which breaks the operator’s ability to make the digital floor reflect the live floor and weakens pit-scoped reporting/filtering. That problem statement is clean and worth fixing.

The direction is mostly right for pilot containment. It keeps the work on the existing /admin/settings/operations surface, limits the actor to admin/operations lead, and defines a tight loop: review assigned/unassigned tables, assign or move a table, clear a mapping, refresh, and let downstream pit-scoped views consume the updated mapping. It also explicitly rejects the usual stupidity—floor-plan editor, table creation, workflow approvals, dashboard redesign, and multi-casino nonsense. That is exactly the kind of fence this slice needed.

What I approve:

The source-of-truth posture is correct. The brief explicitly says canonical pit/table mapping is authoritative and gaming_table.pit must remain secondary if mirrored at all. Good. That avoids split-brain by design.
The exclusions are strong enough to stop this from mutating into “floor management platform v0.1.”
The expansion trigger rule is sharp and useful. It correctly forces amendment if downstream tries to drift into new surfaces, layout tooling, or free-text-as-truth garbage.

Where I’d criticize it:

The biggest weakness is that the brief leaves the core modeling choice unresolved: “assign directly to pits or to specific pit slots.” That is not a cosmetic implementation detail. That choice defines the data mutation path, validation rules, and UI shape. If you leave it fuzzy too long, downstream design will start pretending both are true and you’ll get the usual muddy half-abstraction. For pilot, I would strongly bias this toward whichever existing canonical mapping path already drives reporting today, and refuse any “support both cleanly” fantasy. The brief hints at this, but not forcefully enough.

Second, “whether pit definitions must already exist or can be minimally created in this same surface” is a possible scope leak. Minimal pit creation sounds innocent, but it is the sort of thing that grows claws: naming, uniqueness, ordering, deletion rules, empty states, referential cleanup. If pit definitions do not already exist reliably, this feature is not just assignment correction anymore. I would either lock the first pass to existing pits only, or explicitly constrain “minimal creation” to a tiny subcase with no editing/deletion semantics. Right now that door is ajar.

Third, the role boundary is open between admin-only and pit_boss read/edit access. Read is fine to defer. Edit is not harmless. If you let downstream decide this casually, you can drag auth and policy churn into what should be a boring admin settings slice. Pilot-safe answer: admin edit only, everyone else read-only or nothing. Defer broader permissions.

Fourth, the brief says pit-scoped reporting/filtering should use the updated mapping after save, which is correct, but it does not explicitly say whether this requires cache invalidation only, view recomputation, or any compatibility mirroring for legacy filters. That is not fatal for intake, but it is a place where implementation could get sloppy and accidentally reintroduce gaming_table.pit dependence. The brief should be interpreted narrowly: consume canonical mapping first; any mirror is compatibility exhaust, not logic.

Verdict: yes, approve the direction.

But approve it as a contained admin correction feature, not as a latent floor-layout wedge. The thing to watch like a hawk is this: the brief is sound as long as downstream commits to one canonical assignment path, admin-only edit authority, and no hidden pit-definition management explosion. If those stay pinned, this is a reasonable P1 slice. If not, it will start pretending to be “just configuration” while quietly becoming a layout subsystem.