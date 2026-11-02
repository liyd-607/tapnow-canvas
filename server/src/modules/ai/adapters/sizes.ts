/**
 * 将前端尺寸（WxH）映射为模型需要的比例/尺寸表示。
 *
 * 同时接受两种写法：
 *   - "1024x1024"（前端历史格式：gen.aspectRatio 里存的其实是像素尺寸）
 *   - "16:9"     （MCP tapnow_create_node / 人写的比例格式）
 *
 * 历史 bug：MCP 层传 "16:9" 时，下面的正则只认 "WxH"，静默回退 1:1，
 * 导致「指定 16:9 生成的图全是方的」。
 */

const WXH_RE = /^(\d+)\s*[x*X]\s*(\d+)$/;
const RATIO_RE = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/;

/** 归一化成宽高比；解析不了返回 null */
function parseRatio(size: string): number | null {
  const s = (size ?? '').trim();
  const m1 = WXH_RE.exec(s);
  if (m1) {
    const h = Number(m1[2]);
    if (!h) return null;
    return Number(m1[1]) / h;
  }
  const m2 = RATIO_RE.exec(s);
  if (m2) {
    const h = Number(m2[2]);
    if (!h) return null;
    return Number(m2[1]) / h;
  }
  return null;
}

/**
 * MiniMax image-01 使用 aspect_ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
 */
export function sizeToAspectRatio(size: string): string {
  const ratio = parseRatio(size);
  if (ratio === null) return '1:1';

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
  const ratio = parseRatio(size);
  if (ratio === null) return '1024*1024';

  // 档位有限：横屏 / 竖屏 / 方形
  if (Math.abs(ratio - 1) < 0.03) return '1024*1024';
  return ratio > 1 ? '1280*720' : '720*1280';
}
