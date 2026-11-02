/*
 * ===========================================
 * 经典资产包：内置的可复用素材种子数据
 * ===========================================
 * 图片复用本机已生成的成品（/media/images 下的真实产物），
 * 不依赖外部生成额度。seedClassics 按「用户 + 名称」幂等，
 * 重复调用不会产生重复资产。
 */

export interface ClassicAsset {
  name: string;
  type: 'CHARACTER' | 'PRODUCT' | 'STYLE' | 'REFERENCE';
  /** /media 下的资源 key，如 images/xxx.png（不含 host） */
  mediaKey: string;
  description: string;
  tags: string[];
}

export const CLASSIC_ASSETS: ClassicAsset[] = [
  // ---------- 角色 CHARACTER ----------
  {
    name: '守塔人·老年男性',
    type: 'CHARACTER',
    mediaKey: 'images/25ce9098-4446-4f49-a3f7-a0a45bb46506.png',
    description:
      '白发白须的老人，深色大衣，面容坚毅。适合灯塔/海洋/时间主题的故事，角色一致性参考。',
    tags: ['老人', '男主角', '写实', '海洋'],
  },
  {
    name: '舞会·红裙女子',
    type: 'CHARACTER',
    mediaKey: 'images/3ee9472b-4eda-4f18-8900-9c6a1f8dd5e2.png',
    description:
      '复古红裙卷发女子，暖金灯光下的侧脸。适合年代戏、舞会、情感戏份的女主角参考。',
    tags: ['女子', '女主角', '复古', '舞会'],
  },
  {
    name: '时空行者·逆光剪影',
    type: 'CHARACTER',
    mediaKey: 'images/5083eb2d-3b77-4efc-bf33-6324d85ef88b.jpg',
    description:
      '金色光柱中的西装男子背影，神秘感强。适合穿越、悬疑、时间旅行题材的主角参考。',
    tags: ['男子', '剪影', '逆光', '神秘'],
  },

  // ---------- 道具 PRODUCT ----------
  {
    name: '黄铜怀表',
    type: 'PRODUCT',
    mediaKey: 'images/b3ff4ebe-b0bd-4bd8-b6c2-34ab4fffde03.jpg',
    description:
      '复古黄铜怀表被双手捧起的特写，暖调怀旧。时间/记忆主题的核心道具。',
    tags: ['怀表', '道具特写', '复古', '时间'],
  },
  {
    name: '黄铜油灯',
    type: 'PRODUCT',
    mediaKey: 'images/7cdf122a-271d-4df6-a28f-b6ee6bd58a58.png',
    description:
      '老式黄铜油灯与转动旋钮的手部特写，金属质感强。守夜/航海/年代场景常用道具。',
    tags: ['油灯', '道具特写', '黄铜', '守夜'],
  },

  // ---------- 风格 STYLE ----------
  {
    name: '国家地理·极地延时风',
    type: 'STYLE',
    mediaKey: 'images/c17a207a-9285-406b-90f6-68ffcf9b44dc.png',
    description:
      '广角极地雪原 + 丝带状极光，国家地理式长曝光质感。作为风光镜头的风格样板引用。',
    tags: ['风光', '长曝光', '冷调', '极地'],
  },
  {
    name: '暖金复古·舞会光影',
    type: 'STYLE',
    mediaKey: 'images/8969b61a-d18c-4e35-b720-03bf026c7f6a.jpg',
    description:
      '暖金色散景 + 柔光人像，年代感舞会氛围。人物情感戏的风格样板。',
    tags: ['暖调', '散景', '年代感', '人像'],
  },
  {
    name: '黎明粉调·海面渐变',
    type: 'STYLE',
    mediaKey: 'images/bd7dc8ec-0f2b-4636-baec-76b5f0d0f656.png',
    description:
      '粉金晨光洒在海面与礁石上，色彩过渡柔和。收尾/空镜的风格样板。',
    tags: ['黎明', '粉调', '海面', '空镜'],
  },

  // ---------- 参考 REFERENCE ----------
  {
    name: '灯塔·风暴之夜',
    type: 'REFERENCE',
    mediaKey: 'images/7e5988a0-e51d-484c-b116-565514bb7a96.png',
    description:
      '暴风雨夜，灯塔光束切开雨幕，巨浪拍打黑色礁石。史诗感海洋场景参考。',
    tags: ['灯塔', '风暴', '大海', '夜景'],
  },
  {
    name: '灯塔·极光同框',
    type: 'REFERENCE',
    mediaKey: 'images/873484cc-6e31-4813-aba6-749afe7b7aba.png',
    description:
      '绿紫色极光倾泻在灯塔上方，光束与极光同框。奇幻/纪实混合场景参考。',
    tags: ['灯塔', '极光', '夜景', '广角'],
  },
  {
    name: '雪山极光穹顶',
    type: 'REFERENCE',
    mediaKey: 'images/ec3d6063-6cf0-4ee9-9743-4e53786ab537.png',
    description:
      '绿极光在雪山之巅汇成穹顶，星轨环绕。高原/极地大远景参考。',
    tags: ['雪山', '极光', '穹顶', '大远景'],
  },
  {
    name: '冰湖极光倒影',
    type: 'REFERENCE',
    mediaKey: 'images/82b8acfc-60a4-4ae4-a97f-ab71ba640c56.png',
    description:
      '极光在冰湖上形成完整倒影，蓝紫主调。镜面反射构图参考。',
    tags: ['冰湖', '倒影', '极光', '蓝紫调'],
  },
];

/** 组装出可直接访问的绝对地址（与上传产物同一 host 规则） */
export function classicAssetUrl(mediaKey: string): string {
  const base = process.env.SERVER_PUBLIC_URL || 'http://localhost:3001';
  return `${base}/media/${mediaKey}`;
}
