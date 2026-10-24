import { apiClient } from './client';

export const uploadApi = {
  image: (file: File): Promise<{ url: string; key: string; size: number; mimeType: string }> => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post('/upload/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
};
