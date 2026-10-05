# Automation Workflow Topology

## Event fan-out

| Event | Workflows | Classification |
|---|---|---|
| Pull request opened/synchronized/reopened | CI, CodeQL, Dependency Review, PR Quality, PR Labels, Project Report | Required PR validation; Project Report is observability |
| Pull request closed + merged into main | Release | Delivery |
| Push to main | CI, Project Report, Drive Sync, Notion Sync | Post-merge validation/synchronization |
| Critical workflow completed | Incident Guard | Incident detection |
| CI completed | Automation Dashboard | State refresh |
| Deployment status | Deployment Safety Net, Vercel Browser E2E | Production protection / browser validation |
| Incident issue opened | AI-Assisted Diagnosis, Self-Healing | Diagnosis / repair pipeline |
| Operator self-healing PR opened/updated | Self-Healing Repair Verification | Repair gate |
| Scheduled | CodeQL, Drive Sync, Automation Dashboard, Branch Maintenance, Repo Health, Automation Debug Benchmark, Automation Cost Benchmark | Periodic maintenance/measurement |
| Manual dispatch | Several operational workflows | Explicit operator action |

## Important cascades

### Incident path
`critical workflow failure → Incident Guard → incident issue → AI Diagnosis → Self-Healing → Draft PR → Repair Verification`

### Post-repair safety path
`merged repair → main regression → Incident Guard → Safe Rollback candidate → Draft rollback PR`

### Deployment path
`Vercel deployment success → Production Browser E2E / Deployment Safety Net`

## Known intentional fan-out

- CI and CodeQL run on PRs because they answer different quality/security questions.
- Incident Guard listens to security/build/deployment workflows because it is the detection boundary.
- Repair Verification only runs for `operator/self-heal-*` branches.
- Production Browser E2E is intentionally narrower than Preview E2E to reduce noise/cost.

## Optimization candidates to measure before changing

1. Project Report runs both on PRs and main pushes. The generated tree is largely equivalent after merge, so the post-merge run is a candidate for removal if the report is not needed as a post-merge artifact.
2. Push-to-main synchronization (Drive + Notion) is operationally justified and should not be collapsed without checking sync semantics.
3. Scheduled workflows are independent maintenance/measurement tasks; they should be optimized only from measured activity data.
4. CI/CodeQL/Dependency Review are security/validation controls and are not candidates for removal merely because they consume time.

## Safety rule

No optimization should remove a detection, security, verification, or rollback boundary unless an equivalent control demonstrably replaces it.


## Business contract gate

The CI suite now includes deterministic business invariants for the three state
surfaces already present in the application:

- cart quantity/MOQ, identifiers and duplicate variant lines;
- stored order arithmetic and duplicate variant lines;
- product-import lifecycle consistency and confidence bounds.

The invariant engine is pure and machine-readable. It is a detection boundary,
not an authorization to mutate production state. Future incident intelligence
can consume its `rule_id` values without allowing the AI layer to invent fixes.


## Business incident intelligence

Business invariant violations are treated as **evidence**, not as automatic repair authorization.

The flow is:

`business invariant test/audit → CART-*/ORDER-*/IMPORT-* signal → Incident Intelligence → AI Diagnosis context`

A business rule signal alone never selects a self-healing recipe. Automatic repair still requires an existing deterministic recipe, a validated AI diagnosis, exact run/commit correlation, and all repair verification gates.

### Supabase migration drift path
`PR/push → Supabase Migration Drift → compare local filenames vs remote migration history by timestamp → machine-readable drift report`

The detector is intentionally read-only: it never applies, repairs, reorders, or deletes migrations. Supabase itself compares local migration files with remote history by migration timestamp. The remote probe uses the Supabase Management API only when the repository has both `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` configured. Without those credentials, the workflow remains installed but explicitly reports that the remote audit is not enabled.

A migration drift is an evidence signal, not a self-healing authorization. In particular, a remote-only migration means the database has applied schema history that is not represented in the repository and must be reconciled deliberately before any automated repair is considered.


### Data Integrity OS
`PR/push/schedule → Data Integrity → duplicate + orphan snapshot → machine-readable integrity report → Incident Guard (main failures)`

The duplicate audit checks integrity keys that the current schema declares unique or where the payment lifecycle requires a single live payment per order. The orphan audit checks both enforced relational links and important logical references that are not protected by a foreign key, notably `product_views.product_id → products.id`.

Integrity evidence is diagnostic only. It does not authorize self-healing or data deletion. Pull-request audits may report existing production findings without blocking the PR; failures on `main`/scheduled audits are eligible for Incident Guard.
