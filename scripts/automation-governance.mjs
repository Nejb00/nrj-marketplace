import { analyzeIntegritySnapshot } from './data-integrity.mjs';
import { evaluateCrossSystemConsistency, evaluateImpossibleValues } from './cross-system-integrity.mjs';
import { auditSecurityFiles, securityRiskScore } from './security-audit.mjs';
import { summarizeTestImpact } from './test-intelligence.mjs';
import { evaluateRepairGuard } from './self-healing-guard.mjs';
import { selectRecoveryAction } from './recovery-guard.mjs';
import { summarizeAutomationHealth } from './observability-model.mjs';
import { analyzePullRequest } from './git-pr-intelligence.mjs';
import { evaluateProductionGate } from './production-guard.mjs';
import { recordIncident, classifyRecurrence } from './incident-history.mjs';
import { correlateSignals } from './cross-system-correlation.mjs';
import { evaluatePaymentAudit } from './payment-audit.mjs';

export function runAutomationGovernance(input = {}) {
  const integrity = analyzeIntegritySnapshot(input.integrity || { duplicates: [], orphans: [] });
  const crossSystem = evaluateCrossSystemConsistency(input.database || {});
  const impossible = evaluateImpossibleValues(input.database || {});
  const security = auditSecurityFiles(input.securityFiles || []);
  const testImpact = summarizeTestImpact(input.changedFiles || []);
  const repair = evaluateRepairGuard(input.repair || {
    run: { head_branch: 'unknown', conclusion: 'unknown' },
    recipe: {},
  });
  const recovery = selectRecoveryAction(input.recovery || {});
  const observability = summarizeAutomationHealth(input.observability || {});
  const pullRequest = analyzePullRequest(input.pullRequest || {});
  const production = evaluateProductionGate(input.production || {
    deploymentState: 'unknown',
  });
  const payment = evaluatePaymentAudit(input.payment || {});
  const memory = input.incident
    ? recordIncident(input.incidentHistory || [], input.incident)
    : input.incidentHistory || [];
  const recurrence = memory[0] ? classifyRecurrence(memory[0]) : 'none';
  const correlation = correlateSignals(input.correlation || {});

  const blockingSignals = [
    integrity.status === 'issues-detected',
    crossSystem.status === 'inconsistent',
    impossible.status === 'impossible-values-detected',
    security.status === 'blocked',
    repair.status === 'blocked',
    recovery.status === 'blocked' && input.recovery?.regressionDetected === true,
    payment.status === 'payment-findings',
  ].filter(Boolean).length;

  return {
    schema_version: 1,
    status: blockingSignals ? 'attention-required' : 'healthy',
    blocking_signal_count: blockingSignals,
    layers: {
      integrity,
      cross_system: crossSystem,
      impossible_values: impossible,
      security: { ...security, risk_score: securityRiskScore(security) },
      test_impact: testImpact,
      repair_guard: repair,
      recovery,
      observability,
      pull_request: pullRequest,
      production,
      payment,
      incident_memory: { entries: memory.length, latest_recurrence: recurrence },
      correlation,
    },
  };
}
