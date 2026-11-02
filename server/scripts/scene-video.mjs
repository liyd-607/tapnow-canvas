/**
 * 给画布上已有的图片分镜接视频节点（图生视频）。
 *
 * 流程：每个 image 节点下方建一个 video 节点 → 连线（video 节点的入边自动作为 firstFrame）
 *      → 逐个生成 → 下载 mp4 核对时长/体积。
 *
 * 用法：
 *   node scripts/scene-video.mjs --canvas <id>            # 该画布第二行全部分镜
 *   node scripts/scene-video.mjs --canvas <id> --limit 1  # 只跑前 1 个（先验效果，省额度）
 *   node scripts/scene-video.mjs --canvas <id> --dry      # 只建节点+连线，不出视频
 *   node scripts/scene-video.mjs --model tokenplan-wan3.0-video
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writeFile, mkdir, readdir, unlink, readFile } from 'node:fs/promises';

const URL_ = process.env.TAPNOW_MCP_URL ?? 'http://127.0.0.1:3001/api/mcp';
const TOKEN = process.env.TAPNOW_SERVICE_TOKEN ?? '';
const USER_ID = process.env.TAPNOW_USER_ID ?? '';
const OUT_DIR = process.env.TAPNOW_VIDEO_DIR ?? '/tmp/tapnow-video';

const argv = process.argv.slice(2);
const argOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ONLY_CANVAS = argOf('--canvas');
const LIMIT = Number(argOf('--limit') ?? 0) || 0;
const DRY = argv.includes('--dry');
// 图生视频优先：首帧沿用分镜图，画面可控
const MODEL = argOf('--model') ?? 'tokenplan-happyhorse-i2v';
// 显式指定模型 / --force 时强制重新生成（换模型必然要重跑，不能复用旧产物）
const FORCE = argv.includes('--force') || !!argOf('--model');

/**
 * 每个镜头的视频提示词：只写「怎么动」，不重复描述画面内容
 *（画面已由首帧图片给定，重复描述反而容易让模型改画面）
 */
const MOTION = {
  特写·最后一盏灯: '手指缓慢而有节奏地转动黄铜旋钮，灯芯逐渐被拧出、火苗一点点变亮，暖黄光影在掌纹上流动。镜头极缓慢推近。',
  中景·守塔日志的最后一页: '老人执笔在纸上缓慢书写，笔尖划动，煤油灯火苗轻微摇曳。窗外暴雨斜扫，远处一道闪电短暂照亮房间。镜头缓慢横移。',
  全景·螺旋楼梯上的独行: '老人提灯沿螺旋楼梯缓慢下行，提灯随步伐轻轻摆动，光晕在弧形墙面上一层层滑过。镜头随之缓慢下移跟随。',
  特写·灯灭后的第一缕晨光: '晨光缓慢变强，老人睫毛轻颤后缓缓睁眼，嘴角浮起微笑。菲涅尔透镜的玻璃棱纹折射出细碎光斑缓慢转动。镜头极缓慢推近。',
  大远景·风暴里唯一的灯: '巨浪一次次拍击礁石炸开白雾，灯塔光束缓慢旋转扫过雨幕。云层快速流动，海浪持续翻涌。镜头缓慢前进推近灯塔。',
  全景·灯塔与极光同框: '极光光幕缓慢流动、翻卷、明暗脉动，星空轻微闪烁，海面绿光随之荡开。镜头极缓慢上摇展现极光全貌。',
  中景·光束扫过冰海: '暖白光束匀速旋转扫过海面，被扫过的浪尖依次亮起又暗下，浮冰在幽蓝反光中缓慢漂移。镜头缓缓跟随光束横摇。',
  大远景·熄灯与黎明: '海面微波缓慢起伏，薄云被晨光染暖并缓缓流动，灯塔静立不动。镜头极缓慢后拉，展现完整海平线与天空。',
};

function parse(res) {
  if (res.isError) throw new Error(res.content?.[0]?.text ?? 'unknown MCP error');
  return JSON.parse(res.content[1].text);
}

/** 读 mp4 时长（moov/mvhd），零依赖 */
function mp4Duration(buf) {
  let i = 0;
  while (i < buf.length - 8) {
    const size = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    if (size < 8) break;
    if (type === 'moov') {
      let j = i + 8;
      while (j < i + size - 8) {
        const s2 = buf.readUInt32BE(j);
        const t2 = buf.toString('ascii', j + 4, j + 8);
        if (s2 < 8) break;
        if (t2 === 'mvhd') {
          const ver = buf[j + 8];
          if (ver === 0) {
            const timescale = buf.readUInt32BE(j + 20);
            const duration = buf.readUInt32BE(j + 24);
            return timescale ? duration / timescale : null;
          }
          const timescale = buf.readUInt32BE(j + 28);
          const duration = Number(buf.readBigUInt64BE(j + 32));
          return timescale ? duration / timescale : null;
        }
        j += s2;
      }
      break;
    }
    i += size;
  }
  return null;
}

async function main() {
  if (!TOKEN) throw new Error('缺少 TAPNOW_SERVICE_TOKEN');
  if (!ONLY_CANVAS) throw new Error('请用 --canvas <id> 指定画布');

  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { 'X-TapNow-Service-Token': TOKEN, 'X-TapNow-User-Id': USER_ID } },
  });
  const client = new Client({ name: 'scene-video', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of await readdir(OUT_DIR).catch(() => [])) {
    if (f.endsWith('.mp4')) await unlink(`${OUT_DIR}/${f}`).catch(() => {});
  }

  const graph = parse(await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId: ONLY_CANVAS } }));
  // 只取有成品图的图片节点，取最下面一行（y 最大的一行）
  const images = (graph.nodes ?? []).filter((n) => n.type === 'image' && n.resultUrl);
  const maxY = Math.max(...images.map((n) => n.y));
  let row = images.filter((n) => Math.abs(n.y - maxY) < 120).sort((a, b) => a.x - b.x);
  if (LIMIT) row = row.slice(0, LIMIT);
  console.log(`画布「${graph.canvas?.name ?? ONLY_CANVAS}」最下面一行 ${row.length} 个图片节点 → 接视频\n`);

  const made = [];
  // 刷新 graph，识别已存在的视频节点（重复跑时复用，不重复建）
  const fresh = parse(await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId: ONLY_CANVAS } }));
  const videoTitle = (t) => `视频·${t.replace(/^[^·]*·/, '')}`;
  const existingVideos = new Map((fresh.nodes ?? []).filter((n) => n.type === 'video').map((n) => [n.title, n]));

  for (const img of row) {
    const motion = MOTION[img.title] ?? '画面主体保持自然、克制的细微动作，镜头缓慢推进，电影感。';
    const t = videoTitle(img.title);
    let videoNode = existingVideos.get(t);
    if (videoNode) {
      console.log(`  复用已有视频节点 ${videoNode.id}  ${t}`);
    } else {
      const v = parse(
        await client.callTool({
          name: 'tapnow_create_node',
          arguments: {
            canvasId: ONLY_CANVAS,
            type: 'video',
            title: t,
            x: img.x,
            y: img.y + img.height + 70,
            width: img.width,
            height: Math.round(img.width * (9 / 16)) + 44,
            model: MODEL,
            prompt: motion,
            aspectRatio: '16:9',
            count: 1,
          },
        }),
      );
      videoNode = v.node;
      console.log(`  建节点 ${videoNode.id}  ${t}`);
    }
    // 确保连线存在（image → video，video 节点的入边自动成为 firstFrame）
    const linked = (fresh.edges ?? []).some((e) => e.from === img.id && e.to === videoNode.id);
    if (!linked) {
      await client.callTool({
        name: 'tapnow_connect_nodes',
        arguments: { canvasId: ONLY_CANVAS, from: img.id, to: videoNode.id },
      });
    }
    made.push({
      title: img.title,
      imageId: img.id,
      nodeId: videoNode.id,
      prompt: videoNode.gen?.prompt || motion,
      model: videoNode.gen?.model,
      done: videoNode.status === 'completed' && !!videoNode.resultUrl,
    });
  }

  if (DRY) {
    console.log('\nDRY 完成（只建节点与连线）');
    await client.close();
    return;
  }

  const report = [];
  for (const shot of made) {
    // 已完成的直接重新下载产物，不重复生成（重复跑安全；换模型/--force 时除外）
    if (shot.done && !FORCE) {
      try {
        const graph2 = parse(
          await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId: ONLY_CANVAS } }),
        );
        const n = graph2.nodes.find((x) => x.id === shot.nodeId);
        if (n?.resultUrl) {
          const res = await fetch(n.resultUrl);
          const buf = Buffer.from(await res.arrayBuffer());
          const safe = shot.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
          const path = `${OUT_DIR}/${safe}.mp4`;
          await writeFile(path, buf);
          shot.status = 'completed';
          shot.resultUrl = n.resultUrl;
          shot.localPath = path;
          shot.bytes = buf.length;
          shot.duration = mp4Duration(buf);
          shot.reused = true;
          console.log(`  ↩︎  ${shot.title} 已完成，直接复用产物 ${path}`);
        }
      } catch {
        /* 复用失败则走重新生成 */
      }
      if (shot.status === 'completed') {
        report.push(shot);
        continue;
      }
      shot.status = undefined;
    }

    // 换模型：先把节点模型改掉，再生成
    if (shot.model !== MODEL) {
      await client.callTool({
        name: 'tapnow_update_node',
        arguments: { canvasId: ONLY_CANVAS, nodeId: shot.nodeId, model: MODEL },
      });
      console.log(`  模型 ${shot.model ?? '-'} → ${MODEL}`);
    }

    const t0 = Date.now();
    try {
      const g = parse(
        await client.callTool(
          { name: 'tapnow_generate_node', arguments: { canvasId: ONLY_CANVAS, nodeId: shot.nodeId } },
          undefined,
          { timeout: 600_000 },
        ),
      );
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      shot.status = g.status;
      shot.resultUrl = g.resultUrl;
      shot.error = g.error;

      if (g.status === 'completed' && g.resultUrl) {
        const res = await fetch(g.resultUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        const safe = shot.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
        const path = `${OUT_DIR}/${safe}.mp4`;
        await writeFile(path, buf);
        shot.localPath = path;
        shot.bytes = buf.length;
        shot.duration = mp4Duration(buf);
        console.log(
          `  ✅ ${shot.title}  ${sec}s  ${(buf.length / 1024 / 1024).toFixed(1)}MB` +
            (shot.duration ? `  ${shot.duration.toFixed(1)}s` : ''),
        );
      } else {
        console.log(`  ❌ ${shot.title}  ${sec}s  ${g.error ?? g.status}`);
      }
    } catch (e) {
      shot.status = 'error';
      shot.error = e.message;
      console.log(`  ❌ ${shot.title}  异常：${e.message}`);
    }
    report.push(shot);
  }

  console.log('\n════════ 汇总 ════════');
  const ok = report.filter((r) => r.status === 'completed').length;
  console.log(`${ok}/${report.length} 成功（模型 ${MODEL}）`);
  report.forEach((r) => {
    const tag = r.status === 'completed' ? '✅' : '❌';
    const d = r.duration ? `${r.duration.toFixed(1)}s` : '';
    console.log(`  ${tag} ${r.title}  ${d}  ${r.error ?? ''}`);
  });
  console.log(`产物：${OUT_DIR}`);

  await client.close();
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
});
