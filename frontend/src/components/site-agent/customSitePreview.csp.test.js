import { describe, it, expect } from 'vitest';
import { buildCustomSitePreviewDocument } from './customSitePreview';

describe('custom-site preview document', () => {
  it('includes frame-ancestors in its CSP for production parity', () => {
    const doc = buildCustomSitePreviewDocument({ html: '<p>hi</p>', css: '', js: '' }, {});
    expect(doc).toMatch(/frame-ancestors 'self'/);
  });
});
