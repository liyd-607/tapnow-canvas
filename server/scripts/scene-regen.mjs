/**
 * 重新生成画布上已有的分镜节点（不新建节点、不改布局、不动连线）。
 *
 * 与 scene-run.mjs 的区别：
 *   scene-run   建节点 → 出图 → 连线（首次铺场景）
 *   scene-regen 读现有节点 → 原地重新出图 → 对比新旧画幅（重跑 / 换模型 / 验证修复）
 *
 * 用法：
 *   node scripts/scene-regen.mjs                      # 重跑全部画布的匹配分镜
 *   node scripts/scene-regen.mjs --canvas <id>        # 只跑一个画布
 *   node scripts/scene-regen.mjs --filter 灯塔         # 只跑标题含关键词的节点
 *   node scripts/scene-regen.mjs --model tokenplan-wan2.7   # 换模型重跑
 *
 * 旧图不会丢：generate 会往 node.versions 里追加一条历史版本，resultUrl 指向新图。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const URL_ = process.env.TAPNOW_MCP_URL ?? 'http://127.0.0.1:3001/api/mcp';
const TOKEN = process.env.TAPNOW_SERVICE_TOKEN ?? '';
const USER_ID = process.env.TAPNOW_USER_ID ?? '';
const OUT_DIR = process.env.TAPNOW_OUT_DIR ?? '/tmp/tapnow-regen';

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ONLY_CANVAS = argOf('--canvas');
const FILTER = argOf('--filter');
const MODEL_OVERRIDE = argOf('--model');

/** 要重跑的画布与其中要重跑的节点标题（不填 titles 表示该画布第二行的灯塔分镜） */
const TARGETS = [
  {
    canvasId: 'cmvkj945q000gte4xmxv5oax7',
    label: '时光怀表',
    titles: [
      '特写·最后一盏灯',
      '中景·守塔日志的最后一页',
      '全景·螺旋楼梯上的独行',
      '特写·灯灭后的第一缕晨光',
    ],
  },
  {
    canvasId: 'cmvkjboai000rte4xtvkkwdc0',
    label: '冰岛极光',
    titles: ['大远景·风暴里唯一的灯', '全景·灯塔与极光同框', '中景·光束扫过冰海', '大远景·熄灯与黎明'],
  },
];

function parse(res) {
  if (res.isError) throw new Error(res.content?.[0]?.text ?? 'unknown MCP error');
  return JSON.parse(res.content[1].text);
}

/** 读图片真实像素尺寸（PNG 头，避免装依赖） */
function pngSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
  }
  // JPEG：扫 SOF 段
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), type: 'jpeg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(outPath));
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(outPath);
  return { bytes: buf.length, ...(pngSize(buf) ?? { w: 0, h: 0, type: '?' }) };
}

async function main() {
  if (!TOKEN) throw new Error('缺少 TAPNOW_SERVICE_TOKEN');

  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { 'X-TapNow-Service-Token': TOKEN, 'X-TapNow-User-Id': USER_ID } },
  });
  const client = new Client({ name: 'scene-regen', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  await mkdir(OUT_DIR, { recursive: true });

  // 清掉上一轮产物，避免新旧混淆
  for (const f of await readdir(OUT_DIR).catch(() => [])) {
    if (f.endsWith('.png')) await (await import('node:fs/promises')).unlink(`${OUT_DIR}/${f}`).catch(() => {});
  }

  const report = [];

  for (const target of TARGETS) {
    if (ONLY_CANVAS && target.canvasId !== ONLY_CANVAS) continue;
    console.log(`\n━━━ ${target.label} ━━━`);

    const graph = parse(
      await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId: target.canvasId } }),
    );
    const all = graph.nodes ?? [];
    const picked = [];
    for (const t of target.titles) {
      if (FILTER && !t.includes(FILTER)) continue;
      const node = all.find((n) => n.title === t) ?? all.find((n) => n.title?.includes(t));
      if (!node) {
        console.log(`  ⚠️  找不到节点：${t}`);
        continue;
      }
      picked.push({ title: t, nodeId: node.id, oldUrl: node.resultUrl, oldSize: `${node.width}x${node.height}` });
    }
    console.log(`  匹配到 ${picked.length} 个节点，画布共 ${all.length} 个`);

    for (const shot of picked) {
      // 先下载旧图存底（万一新图不理想，能看到对比）
      let oldPixels = null;
      if (shot.oldUrl) {
        try {
          const safe = shot.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
          oldPixels = await download(shot.oldUrl, `${OUT_DIR}/OLD_${safe}.png`);
        } catch {
          /* 旧图下载失败无所谓 */
        }
      }
      shot.oldPixels = oldPixels ? `${oldPixels.w}x${oldPixels.h}` : null;

      // 换模型（可选）
      if (MODEL_OVERRIDE) {
        await client.callTool({
          name: 'tapnow_update_node',
          arguments: { canvasId: target.canvasId, nodeId: shot.nodeId, model: MODEL_OVERRIDE },
        });
      }

      const t0 = Date.now();
      try {
        const g = parse(
          await client.callTool(
            { name: 'tapnow_generate_node', arguments: { canvasId: target.canvasId, nodeId: shot.nodeId } },
            undefined,
            { timeout: 180_000 },
          ),
        );
        shot.seconds = ((Date.now() - t0) / 1000).toFixed(1);
        shot.status = g.status;
        shot.resultUrl = g.resultUrl;
        shot.error = g.error;

        if (g.status === 'completed' && g.resultUrl) {
          const safe = shot.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
          const info = await download(g.resultUrl, `${OUT_DIR}/NEW_${safe}.png`);
          shot.newPixels = `${info.w}x${info.h}`;
          shot.bytes = info.bytes;
          console.log(
            `  ✅ ${shot.title}  ${shot.seconds}s  ${info.w}x${info.h}` +
              (shot.oldPixels ? `  （旧 ${shot.oldPixels}）` : ''),
          );
        } else {
          console.log(`  ❌ ${shot.title}  ${shot.seconds}s  ${g.error ?? g.status}`);
        }
      } catch (e) {
        shot.status = 'error';
        shot.error = e.message;
        console.log(`  ❌ ${shot.title}  异常：${e.message}`);
      }
    }

    report.push({ ...target, shots: picked });
  }

  // 汇总
  console.log('\n════════ 汇总 ════════');
  for (const r of report) {
    const ok = r.shots.filter((s) => s.status === 'completed').length;
    console.log(`${r.label}：${ok}/${r.shots.length} 成功`);
    for (const s of r.shots) {
      const tag = s.status === 'completed' ? '✅' : '❌';
      const kb = s.bytes ? ` ${(s.bytes / 1024).toFixed(0)}KB` : '';
      console.log(
        `  ${tag} ${s.title}  ${s.oldPixels ?? '-'} → ${s.newPixels ?? s.error ?? s.status}${kb}`,
      );
    }
  }
  console.log(`\n产物：${OUT_DIR}（OLD_ / NEW_ 前缀可对比）`);

  await client.close();
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
});
