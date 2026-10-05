const topology = {
  version: 1,
  fanout: {
    pull_request: ['CI', 'CodeQL', 'Dependency Review', 'PR Quality', 'PR Labels', 'Project Report'],
    push_main: ['CI', 'Project Report', 'Drive Sync', 'Notion Sync'],
    critical_workflow_completed: ['Incident Guard'],
    ci_completed: ['Automation Dashboard'],
    deployment_status: ['Deployment Safety Net', 'Vercel Browser E2E'],
    incident_opened: ['AI-Assisted Diagnosis', 'Self-Healing'],
    self_healing_pr: ['Self-Healing Repair Verification'],
  },
  safety_boundaries: [
    'Incident Guard',
    'AI-Assisted Diagnosis',
    'Self-Healing',
    'Self-Healing Repair Verification',
    'Safe Rollback',
  ],
  optimization_candidates: [
    'Project Report post-merge run',
    'Measured scheduled workflow load',
  ],
};

export function getAutomationTopology() {
  return structuredClone(topology);
}
