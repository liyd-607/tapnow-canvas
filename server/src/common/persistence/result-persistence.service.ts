import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../modules/storage/storage.service';

/**
 * 生成结果持久化助手。
 *
 * 外部 AI 模型（MiniMax / DashScope 等）返回的多为带签名的临时 URL，
 * 约 24 小时后失效。本服务在生成成功后把结果拉取并转存到自有存储，
 * 返回可长期访问的 URL。
 */
@Injectable()
export class ResultPersistenceService {
  private readonly logger = new Logger(ResultPersistenceService.name);

  constructor(private storage: StorageService) {}

  /**
   * 把一批外部结果 URL 转存到自有存储。
   * 已属于本机 /media 的地址会原样保留；单个失败回退为原 URL，不阻断整体。
   */
  async persistBatch(
    urls: string[],
    options: { kind?: 'image' | 'video' | 'audio' } = {},
  ): Promise<string[]> {
    const kind = options.kind || 'image';
    const out: string[] = [];

    for (const url of urls) {
      try {
        out.push(await this.persistOne(url, kind));
      } catch (e) {
        this.logger.warn(`转存失败，保留原地址: ${url} -> ${(e as Error).message}`);
        out.push(url);
      }
    }

    return out;
  }

  async persistOne(url: string, kind: 'image' | 'video' | 'audio' = 'image'): Promise<string> {
    if (!url) return url;

    // 数据 URI 或已在本机存储，无需转存
    if (url.startsWith('data:') || url.startsWith('/media') || url.includes('/media/')) {
      return url;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载结果失败: HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());

    const ext = this.resolveExt(url, contentType, kind);
    const folder = kind === 'video' ? 'videos' : kind === 'audio' ? 'audios' : 'images';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const result = await this.storage.uploadBuffer(buffer, filename, contentType || 'application/octet-stream', folder);
    return result.url;
  }

  private resolveExt(url: string, contentType: string, kind: 'image' | 'video' | 'audio'): string {
    const mimeExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'audio/aac': 'aac',
    };
    if (contentType && mimeExt[contentType]) return mimeExt[contentType];

    const pathPart = url.split('?')[0];
    const fromUrl = pathPart.split('.').pop()?.toLowerCase();
    if (fromUrl && /^[a-z0-9]{2,4}$/.test(fromUrl)) return fromUrl;

    if (kind === 'video') return 'mp4';
    if (kind === 'audio') return 'wav';
    return 'jpg';
  }
}
