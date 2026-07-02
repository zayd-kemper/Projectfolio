import api from './api';

export async function waitForJob(jobId, { onProgress, timeoutMs = 10 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await api.get(`/jobs/${jobId}`);
    onProgress?.(data.job.progress || 0, data.job);
    if (data.job.status === 'completed') return data.job.result;
    if (data.job.status === 'failed') throw new Error(data.job.error || 'Background job failed.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Background job timed out. It may still finish in the background.');
}

export const resolveJobResponse = (response, options) => (
  response.data?.job_id ? waitForJob(response.data.job_id, options) : response.data
);
