import axios from 'axios';
import api from './api';

export async function uploadMedia(file, { projectId = null, onProgress } = {}) {
  const { data: signed } = await api.post('/media/signature', {
    file_type: file.type || 'application/octet-stream',
    file_size: file.size,
  });
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signed.api_key);
  body.append('timestamp', signed.timestamp);
  body.append('folder', signed.folder);
  body.append('signature', signed.signature);
  const upload = await axios.post(
    `https://api.cloudinary.com/v1_1/${signed.cloud_name}/${signed.resource_type}/upload`,
    body,
    { timeout: 10 * 60_000, onUploadProgress: onProgress }
  );
  const completed = await api.post('/media/complete', {
    public_id: upload.data.public_id,
    version: upload.data.version,
    signature: upload.data.signature,
    secure_url: upload.data.secure_url,
    resource_type: signed.resource_type,
    original_filename: file.name,
    file_type: file.type || 'application/octet-stream',
    file_size: file.size,
    project_id: projectId,
    width: upload.data.width,
    height: upload.data.height,
    duration: upload.data.duration,
  });
  return completed.data;
}
