export const SELF_HEALING_ROLLBACK_VERSION = 1;

const OPERATOR_REPAIR_PREFIX = 'operator/self-heal-';
const DEFAULT_MAX_AGE_HOURS = 24;

function toMs(value) {
  const ms = new Date(value ?? 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function hasIncidentReference(body, issueNumber) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return false;
  const text = String(body ?? '');
  return new RegExp('(?:Incident|incident)\\s*[:#—-]\\s*#?' + issueNumber + '\\b').test(text);
}

export function isMergedRepairCandidate({
  pullRequest,
  issueNumber,
  incidentRun,
  now = Date.now(),
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
}) {
  const mergeMs = toMs(pullRequest?.merged_at);
  const incidentMs = toMs(incidentRun?.updated_at);
  const nowMs = toMs(now);

  if (
    !pullRequest ||
    pullRequest.base?.ref !== 'main' ||
    pullRequest.head?.ref?.startsWith(OPERATOR_REPAIR_PREFIX) !== true ||
    !(pullRequest.merged === true || Boolean(pullRequest.merged_at)) ||
    typeof pullRequest.merge_commit_sha !== 'string' ||
    !/^[0-9a-f]{7,40}$/i.test(pullRequest.merge_commit_sha)
  ) {
    return false;
  }

  if (!incidentRun || incidentRun.head_branch !== 'main' || incidentRun.conclusion !== 'failure') {
    return false;
  }

  if (!mergeMs || !incidentMs || !nowMs) return false;
  if (mergeMs > incidentMs || mergeMs > nowMs) return false;

  const ageMs = incidentMs - mergeMs;
  const maxAgeMs = Number(maxAgeHours) * 60 * 60 * 1000;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || ageMs > maxAgeMs) return false;

  return hasIncidentReference(pullRequest.body, issueNumber);
}

export function selectRollbackCandidate({
  pullRequests = [],
  issueNumber,
  incidentRun,
  now = Date.now(),
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
}) {
  return [...pullRequests]
    .filter((pullRequest) =>
      isMergedRepairCandidate({
        pullRequest,
        issueNumber,
        incidentRun,
        now,
        maxAgeHours,
      })
    )
    .sort((a, b) => toMs(b.merged_at) - toMs(a.merged_at))
    .map((pullRequest) => ({
      pull_request_number: pullRequest.number,
      pull_request_url: pullRequest.html_url || null,
      merge_commit_sha: pullRequest.merge_commit_sha,
      merged_at: pullRequest.merged_at,
      head_branch: pullRequest.head.ref,
      title: pullRequest.title || 'Self-Healing repair',
    }))[0] || null;
}

export function buildRollbackBranchName({ runId, mergeCommitSha }) {
  const safeRunId = Number(runId);
  const safeSha = String(mergeCommitSha || '').toLowerCase();
  if (!Number.isSafeInteger(safeRunId) || safeRunId <= 0) {
    throw new Error('runId invalide.');
  }
  if (!/^[0-9a-f]{7,40}$/.test(safeSha)) {
    throw new Error('mergeCommitSha invalide.');
  }
  return 'operator/self-heal-rollback-' + safeRunId + '-' + safeSha.slice(0, 12);
}

export function buildRollbackTitle({ repairPrNumber }) {
  return 'revert(automation): rollback self-healing repair #' + Number(repairPrNumber);
}

export function renderRollbackMarker() {
  return '<!-- nrj-self-healing-rollback -->';
}
