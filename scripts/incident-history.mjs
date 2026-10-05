function stable(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

export function makeIncidentKey({ workflow, classification, signatures = [], businessRules = [], integrityRules = [] }) {
  return [
    stable(workflow),
    stable(classification),
    [...signatures].map(stable).sort().join('|'),
    [...businessRules].sort().join('|'),
    [...integrityRules].sort().join('|'),
  ].join('::');
}

export function recordIncident(history = [], incident) {
  const key = makeIncidentKey(incident);
  const current = history.find(item => item.key === key);

  if (!current) {
    return [{
      key,
      count: 1,
      first_seen: incident.seenAt || null,
      last_seen: incident.seenAt || null,
    }, ...history];
  }

  return history.map(item => item.key === key
    ? { ...item, count: Number(item.count || 0) + 1, last_seen: incident.seenAt || item.last_seen }
    : item);
}

export function classifyRecurrence(entry = {}, threshold = 3) {
  return Number(entry.count || 0) >= threshold ? 'recurring' : 'rare';
}
