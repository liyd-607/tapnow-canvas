export interface User {
  id: string;
  phone: string;
  nickname?: string | null;
  avatar?: string | null;
  tapies: number;
  role: string;
  createdAt?: string;
}

export interface GenerationTask {
  id: string;
  userId: string;
  type: string;
  model: string;
  prompt: string;
  params?: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrls?: string[] | null;
  creditCost: number;
  errorMsg?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AIModel {
  id: string;
  name: string;
  creditCostPerImage: number;
}

export interface Canvas {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  thumbnail?: string | null;
  width: number;
  height: number;
  layers?: CanvasNode[] | null;
  settings?: Record<string, any> | null;
  generationTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NodeType = 'text' | 'image' | 'ai-text' | 'ai-image' | 'ai-video' | 'flow-image' | 'flow-video';

export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  generationTaskId?: string | null;
  content: {
    src?: string;
    text?: string;
    prompt?: string;
    referenceImage?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  type: string;
  config?: Record<string, any> | null;
  thumbnail?: string | null;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  userId: string;
  vision: string;
  status: string;
  progress: number;
  script?: any;
  shots?: any;
  resultUrls?: string[] | null;
  errorMsg?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  taskId?: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
