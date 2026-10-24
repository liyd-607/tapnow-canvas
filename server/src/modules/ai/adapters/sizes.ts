/**
 * 将前端尺寸（WxH）映射为模型需要的比例/尺寸表示。
 */

/**
 * MiniMax image-01 使用 aspect_ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
 */
export function sizeToAspectRatio(size: string): string {
  const match = /^(\d+)\s*[x*X]\s*(\d+)$/.exec(size.trim());
  if (!match) return '1:1';
  const w = Number(match[1]);
  const h = Number(match[2]);

  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.03) return '1:1';
  if (Math.abs(ratio - 16 / 9) < 0.08) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.08) return '9:16';
  if (Math.abs(ratio - 4 / 3) < 0.06) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.06) return '3:4';
  // 兜底：按宽高方向给最接近的常见比例
  return ratio > 1 ? '16:9' : ratio < 1 ? '9:16' : '1:1';
}

/**
 * 阿里 multimodal-generation（wan 系列）parameters.size 使用 "1024*1024" 格式。
 * 若传入模型不支持的任意尺寸，回退到最接近的常见档位。
 */
export function sizeToWanSize(size: string): string {
  const match = /^(\d+)\s*[x*X]\s*(\d+)$/.exec(size.trim());
  if (!match) return '1024*1024';
  const w = Number(match[1]);
  const h = Number(match[2]);

  // 竖屏 / 横屏 / 方形常用档位
  if (w === h) return '1024*1024';
  if (w > h) return '1280*720';
  return '720*1280';
}
