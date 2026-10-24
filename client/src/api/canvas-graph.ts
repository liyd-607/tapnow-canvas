export type CanvasNodeType = 'text' | 'image' | 'video' | 'media' | 'group' | 'editor';

export interface CanvasNodeReference {
  nodeId: string;
  role: 'subject' | 'image' | 'firstFrame' | 'lastFrame';
}

export interface CanvasGenerationParams {
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  count?: number;
  subjectType?: 'character' | 'product';
  referenceStrength?: number;
  [key: string]: any;
}

export interface CanvasNodeVersion {
  id: string;
  resultUrl: string;
  prompt: string;
  model: string;
  params?: Record<string, any>;
  createdAt: string;
}

export interface CanvasGraphNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  title?: string;
  gen?: CanvasGenerationParams;
  references?: CanvasNodeReference[];
  resultUrl?: string | null;
  status: 'idle' | 'generating' | 'completed' | 'failed';
  error?: string | null;
  versions: CanvasNodeVersion[];

  /** 是否折叠（折叠态只显示封面+徽章） */
  collapsed?: boolean;

  /** 所属分组 id（空表示未分组） */
  groupId?: string;
}

export interface CanvasGraphEdge {
  id: string;
  from: string;
  to: string;
  role?: CanvasNodeReference['role'];
}

export interface CanvasGraph {
  nodes: CanvasGraphNode[];
  edges: CanvasGraphEdge[];
}
