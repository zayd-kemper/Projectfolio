const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/tiff', 'image/bmp', 'image/heic', 'image/heif',
  // Videos
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'video/x-matroska', 'video/mpeg', 'video/3gpp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // CAD & Engineering
  'application/acad', 'application/x-acad', 'application/autocad_dwg',
  'image/vnd.dwg', 'image/x-dwg', 'application/dxf',
  'model/stl', 'application/sla', 'application/vnd.ms-pki.stl',
  'application/octet-stream',
  // Code & text
  'text/plain', 'text/csv', 'text/html', 'text/css',
  'application/json', 'application/xml', 'text/xml',
  'application/javascript', 'text/x-python', 'text/x-matlab',
  // Archives
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/x-tar', 'application/gzip',
];

module.exports = { cloudinary, ALLOWED_TYPES };
