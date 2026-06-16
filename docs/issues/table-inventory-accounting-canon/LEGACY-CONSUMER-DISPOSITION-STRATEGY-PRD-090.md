### Legacy Consumer Disposition Strategy

PRD-090 does not migrate every legacy table-result consumer to
`TableInventoryAccountingProjection`.

The only required migrated consumer in this exemplar is the Pit Terminal Rundown.

All other active operator-visible consumers that currently render legacy
table-result values must be explicitly classified before release.

Allowed dispositions:

1. `consume_projection`
   - The surface consumes `TableInventoryAccountingProjection`.
   - Required for the Pit Terminal Rundown exemplar.

2. `suppress_rendering`
   - The surface does not yet consume the projection.
   - It must not render or serialize forbidden legacy table-result fields or labels.

3. `inactive_or_internal_only_with_reason`
   - Allowed only for deleted routes, archived code/docs, tests, or internal-only
     fields that are never returned to an operator-visible boundary.

No active operator-visible surface may use `inactive_or_internal_only_with_reason`
while continuing to render or serialize forbidden legacy table-result values.