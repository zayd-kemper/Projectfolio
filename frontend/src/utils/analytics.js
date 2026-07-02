export const recordPublicView = ({ subjectType, subjectId, projectId = null }) => {
  if (!subjectId || document.visibilityState === 'prerender') return;
  const payload = JSON.stringify({ subjectType, subjectId, projectId });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/view', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/analytics/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {});
};
