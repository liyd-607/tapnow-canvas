import { apiClient } from './client';

export type AssetType = 'CHARACTER' | 'PRODUCT' | 'STYLE' | 'REFERENCE';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  url: string;
  thumbnail?: string | null;
  description?: string | null;
  tags?: string[];
  usageCount: number;
  createdAt: string;
}

export interface CreateAssetDto {
  name: string;
  type: AssetType;
  url: string;
  thumbnail?: string;
  description?: string;
  tags?: string[];
}

export const assetsApi = {
  list: (type?: string, keyword?: string): Promise<Asset[]> =>
    apiClient.get('/assets', { params: { type, keyword } }).then((r) => r.data),

  create: (dto: CreateAssetDto): Promise<Asset> =>
    apiClient.post('/assets', dto).then((r) => r.data),

  update: (id: string, dto: Partial<CreateAssetDto>): Promise<Asset> =>
    apiClient.put(`/assets/${id}`, dto).then((r) => r.data),

  remove: (id: string) =>
    apiClient.delete(`/assets/${id}`).then((r) => r.data),
};
