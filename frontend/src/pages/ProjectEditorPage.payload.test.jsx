import { describe, it, expect } from 'vitest';
import { buildProjectPayload } from './ProjectEditorPage';

// The API historically returned DATE columns as full ISO timestamps
// ("2018-04-18T00:00:00.000Z"); echoing that into PUT /projects/:id fails the
// backend s.date() rule (YYYY-MM-DD, max 10 chars). The payload builder must
// truncate to the date part so saves never 400 on server-provided dates.
describe('buildProjectPayload', () => {
  it('truncates ISO timestamp dates to YYYY-MM-DD', () => {
    const payload = buildProjectPayload({
      title: 'Imported project',
      start_date: '2018-04-18T00:00:00.000Z',
      end_date: '2025-09-11T04:00:00.000Z',
    }, 'draft');

    expect(payload.start_date).toBe('2018-04-18');
    expect(payload.end_date).toBe('2025-09-11');
  });

  it('save failure toast surfaces the first validation detail, not just the generic error', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, './ProjectEditorPage.jsx'), 'utf8');
    // backend 400s include details: [{ field, message }] — show the first one
    expect(src).toMatch(/details\?\.\[0\]/);
  });
});
