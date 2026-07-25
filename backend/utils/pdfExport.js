// Portfolio PDF export storage + delivery.
//
// Cloudinary disables CDN delivery of PDF/ZIP files by default (a raw PDF
// secure_url returns 401 even when signed). To deliver reliably we store the
// export as an *authenticated* raw asset and hand back a signed URL for the
// download API, which is not subject to the CDN PDF-delivery restriction.

const EXPORT_FOLDER = 'projectfolio/exports';
const DOWNLOAD_TTL_SECONDS = 60 * 60;

async function uploadPdfExport(cloudinary, pdf, { username }) {
  const publicId = `${EXPORT_FOLDER}/${username}-portfolio.pdf`;
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', type: 'authenticated', public_id: publicId, overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(pdf);
  });
  const url = cloudinary.utils.private_download_url(uploaded.public_id, '', {
    resource_type: 'raw',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS,
  });
  return { url, filename: `${username}-portfolio.pdf`, public_id: uploaded.public_id };
}

module.exports = { uploadPdfExport };
