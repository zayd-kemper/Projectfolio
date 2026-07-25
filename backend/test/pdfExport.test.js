const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadPdfExport } = require('../utils/pdfExport');

// Cloudinary blocks CDN delivery of PDFs, so exports must be stored as an
// authenticated raw asset and delivered through the download API.
const fakeCloudinary = (capture) => ({
  uploader: {
    upload_stream: (opts, cb) => {
      capture.uploadOpts = opts;
      return { end: (buf) => { capture.uploadedBytes = buf; cb(null, { public_id: opts.public_id, secure_url: 'https://res.cloudinary.com/demo/raw/authenticated/x.pdf' }); } };
    },
  },
  utils: {
    private_download_url: (publicId, format, options) => {
      capture.downloadArgs = { publicId, format, options };
      return `https://api.cloudinary.com/v1_1/demo/raw/download?public_id=${encodeURIComponent(publicId)}&type=${options.type}`;
    },
  },
});

test('uploadPdfExport stores the PDF as an authenticated raw asset and returns a download-API url', async () => {
  const cap = {};
  const result = await uploadPdfExport(fakeCloudinary(cap), Buffer.from('%PDF-1.4'), { username: 'ada-lovelace' });

  assert.equal(cap.uploadOpts.type, 'authenticated', 'authenticated type bypasses the PDF CDN-delivery block');
  assert.equal(cap.uploadOpts.resource_type, 'raw');
  assert.equal(cap.downloadArgs.options.type, 'authenticated');
  assert.equal(cap.downloadArgs.options.resource_type, 'raw');
  assert.match(result.url, /api\.cloudinary\.com\/.*\/download/, 'delivers via the download API, not the blocked CDN');
  assert.equal(result.filename, 'ada-lovelace-portfolio.pdf');
});
