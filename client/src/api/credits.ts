import { apiClient } from './client';
import type { CreditTransaction, PaginatedResponse } from '../types';

export const creditsApi = {
  balance: (): Promise<{ balance: number }> =>
    apiClient.get('/credits/balance').then((r) => r.data),

  transactions: (page = 1, pageSize = 20): Promise<PaginatedResponse<CreditTransaction>> =>
    apiClient.get('/credits/transactions', { params: { page, pageSize } }).then((r) => r.data),
};
