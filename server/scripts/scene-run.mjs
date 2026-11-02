/**
 * 场景批量生成：把一个场景的分镜铺到多个画布上，逐个真实出图。
 *
 * 用法：
 *   node scripts/scene-run.mjs            # 跑全部
 *   node scripts/scene-run.mjs --dry      # 只建节点不出图（省额度）
 *
 * 设计取舍：
 *   - 先建完所有节点，再逐个生成，最后才连线 —— 生成阶段不带参考图，
 *     避免镜头之间互相污染画面；连线只表达分镜顺序。
 *   - 串行生成：同一画布并发写图会抢乐观锁，且供应商有速率限制。
 *   - 单张失败不中断整批，最后统一重试一次。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writeFile, mkdir } from 'node:fs/promises';

const URL_ = process.env.TAPNOW_MCP_URL ?? 'http://127.0.0.1:3001/api/mcp';
const TOKEN = process.env.TAPNOW_SERVICE_TOKEN ?? '';
const USER_ID = process.env.TAPNOW_USER_ID ?? '';
const MODEL = process.env.TAPNOW_E2E_MODEL ?? process.env.TAPNOW_DEFAULT_IMAGE_MODEL ?? 'tokenplan-wan2.7';
const DRY = process.argv.includes('--dry');
const OUT_DIR = process.env.TAPNOW_OUT_DIR ?? '/tmp/tapnow-scene';

// y=560 把新分镜放在现有那一行（y≈0、高 400）的正下方，不重叠
const ROW_Y = 560;
const NODE_W = 340;
const NODE_H = 260;

const SCENES = [
  {
    canvasId: 'cmvkj945q000gte4xmxv5oax7',
    label: '时光怀表',
    // 这个画布是温情叙事向，所以同一场景往「情感/人物」上写
    shots: [
      {
        title: '特写·最后一盏灯',
        x: -80,
        prompt:
          '电影感特写，一双布满皱纹与老茧的手正缓慢转动黄铜灯塔灯芯的旋钮，铜件被摩挲出温润包浆。昏黄灯光从侧面照亮手背纹理，背景是虚化的铸铁灯座。胶片质感，暖橙色调，柔和伦勃朗光，35mm 镜头，极高细节。',
      },
      {
        title: '中景·守塔日志的最后一页',
        x: 360,
        prompt:
          '电影感中景，白发守塔人坐在灯塔顶层的旧木桌前，就着一盏煤油灯写日志。磨损的深蓝呢子制服，肩上披着旧毛毯。窗外是暴雨与翻涌的海。暖黄灯光与窗外冷蓝雷光形成冷暖对比，浅景深，胶片颗粒，怀旧氛围。',
      },
      {
        title: '全景·螺旋楼梯上的独行',
        x: 880,
        prompt:
          '电影感全景，一位白发老人独自走下灯塔的螺旋铁楼梯，手扶冰冷铁栏，一盏提灯在身侧轻轻摇晃。斑驳墙面，光影层层投在弧形墙上。仰角构图，橙黄提灯与深蓝阴影交替，孤独而克制的情绪，怀旧电影质感。',
      },
      {
        title: '特写·灯灭后的第一缕晨光',
        x: 1380,
        prompt:
          '电影感特写，守塔人饱经风霜的侧脸，身旁巨大的菲涅尔透镜已停止转动。一缕清晨柔光穿过玻璃落在他的脸上，他闭眼微笑，皱纹被光勾亮。背景虚化成淡金色光斑，85mm 镜头，柔和自然光，极致细腻的皮肤纹理。',
      },
    ],
  },
  {
    canvasId: 'cmvkjboai000rte4xtvkkwdc0',
    label: '冰岛极光下的雪山延时摄影',
    // 这个画布是风光大片向，同一场景往「史诗/自然」上写
    shots: [
      {
        title: '大远景·风暴里唯一的灯',
        x: -560,
        prompt:
          '国家地理摄影风格，8k 超高画质。暴风雨夜的黑色玄武岩海岸，一座孤零零的白色灯塔伫立在悬崖边缘，强烈光束切开雨幕与飞沫。十几米高的巨浪拍打礁石炸成白雾，灯塔的光是画面唯一的暖色。冷蓝青灰色调，长曝光，史诗级压迫感。',
      },
      {
        title: '全景·灯塔与极光同框',
        x: 140,
        prompt:
          '国家地理摄影风格，8k 超高画质。冰岛海岸的白色灯塔位于前景，天空被绿色与紫色极光完全占据，光幕如瀑布倾泻而下，几乎触到灯塔顶端。海面反射微弱绿光，星空清晰可辨。广角，极高动态范围，宇宙尺度的震撼。',
      },
      {
        title: '中景·光束扫过冰海',
        x: 820,
        prompt:
          '国家地理摄影风格，8k 超高画质。略高俯拍，暖白旋转光束斜扫过漆黑海面，被扫到的浪尖瞬间被照亮。前景是覆着薄冰的黑色礁石，远处浮冰泛幽蓝。慢门长曝光，光束形成柔和光锥，冷峻、静谧、极致质感。',
      },
      {
        title: '大远景·熄灯与黎明',
        x: 1260,
        prompt:
          '国家地理摄影风格，8k 超高画质。黎明时分风暴已过，海面平静如镜。灯塔已熄灯，塔身在粉金晨光中呈柔和的白。天空从玫瑰金过渡到淡蓝，薄云被染暖，海面倒影完整对称。宁静释然，长焦压缩，极高画质。',
      },
    ],
  },
];

function parse(res) {
  if (res.isError) throw new Error(res.content?.[0]?.text ?? 'unknown MCP error');
  return JSON.parse(res.content[1].text);
}

async function main() {
  if (!TOKEN) throw new Error('缺少 TAPNOW_SERVICE_TOKEN');

  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { 'X-TapNow-Service-Token': TOKEN, 'X-TapNow-User-Id': USER_ID } },
  });
  const client = new Client({ name: 'scene-run', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  console.log(`已连接（模型 ${MODEL}${DRY ? '，DRY 只建节点' : ''}）\n`);

  await mkdir(OUT_DIR, { recursive: true });
  const report = [];

  for (const scene of SCENES) {
    console.log(`\n━━━ ${scene.label} ━━━`);

    // 1) 建节点
    const created = [];
    for (const shot of scene.shots) {
      const r = parse(
        await client.callTool({
          name: 'tapnow_create_node',
          arguments: {
            canvasId: scene.canvasId,
            type: 'image',
            title: shot.title,
            x: shot.x,
            y: ROW_Y,
            width: NODE_W,
            height: NODE_H,
            model: MODEL,
            prompt: shot.prompt,
            aspectRatio: '16:9',
            count: 1,
          },
        }),
      );
      created.push({ ...shot, nodeId: r.node.id });
      console.log(`  建节点 ${r.node.id}  ${shot.title}`);
    }

    if (DRY) {
      report.push({ scene: scene.label, shots: created.map((c) => ({ ...c, status: 'dry' })) });
      continue;
    }

    // 2) 逐个出图
    for (const shot of created) {
      const t0 = Date.now();
      try {
        const g = parse(
          await client.callTool({
            name: 'tapnow_generate_node',
            arguments: { canvasId: scene.canvasId, nodeId: shot.nodeId },
          }, { timeout: 180_000 }),
        );
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        shot.status = g.status;
        shot.resultUrl = g.resultUrl;
        shot.error = g.error;
        shot.seconds = sec;
        if (g.status === 'completed' && g.resultUrl) {
          console.log(`  ✅ ${shot.title}  ${sec}s  ${g.resultUrl.split('/').pop()}`);
        } else {
          console.log(`  ❌ ${shot.title}  ${sec}s  ${g.error ?? g.status}`);
        }
      } catch (e) {
        shot.status = 'error';
        shot.error = e.message;
        console.log(`  ❌ ${shot.title}  异常：${e.message}`);
      }
    }

    // 3) 按分镜顺序连线，表达叙事顺序
    for (let i = 0; i < created.length - 1; i++) {
      try {
        await client.callTool({
          name: 'tapnow_connect_nodes',
          arguments: { canvasId: scene.canvasId, from: created[i].nodeId, to: created[i + 1].nodeId },
        });
      } catch (e) {
        console.log(`  连线失败 ${i}→${i + 1}：${e.message}`);
      }
    }
    console.log(`  已按顺序连线 ${created.length - 1} 条`);

    report.push({ scene: scene.label, canvasId: scene.canvasId, shots: created });
  }

  // 4) 失败重试一次
  const failed = report.flatMap((r) =>
    (r.shots ?? []).filter((s) => s.status && s.status !== 'completed' && s.status !== 'dry'),
  );
  if (failed.length) {
    console.log(`\n重试 ${failed.length} 张失败图…`);
    for (const shot of failed) {
      const canvasId = report.find((r) => r.shots.includes(shot)).canvasId;
      try {
        const g = parse(
          await client.callTool({
            name: 'tapnow_generate_node',
            arguments: { canvasId, nodeId: shot.nodeId },
          }, { timeout: 180_000 }),
        );
        if (g.status === 'completed') {
          shot.status = 'completed';
          shot.resultUrl = g.resultUrl;
          console.log(`  ✅ 重试成功 ${shot.title}`);
        } else {
          console.log(`  ❌ 仍失败 ${shot.title}：${g.error ?? g.status}`);
        }
      } catch (e) {
        console.log(`  ❌ 重试异常 ${shot.title}：${e.message}`);
      }
    }
  }

  // 5) 下载产物，便于肉眼核对
  let saved = 0;
  if (!DRY) {
    for (const r of report) {
      for (const s of r.shots) {
        if (!s.resultUrl) continue;
        try {
          const res = await fetch(s.resultUrl);
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          const name = `${r.scene.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_')}_${s.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_')}.png`;
          await writeFile(`${OUT_DIR}/${name}`, buf);
          s.savedAs = `${OUT_DIR}/${name}`;
          s.bytes = buf.length;
          saved++;
        } catch {
          /* 下载失败不影响主流程 */
        }
      }
    }
  }

  // 6) 汇总
  console.log('\n════════ 汇总 ════════');
  for (const r of report) {
    const okN = r.shots.filter((s) => s.status === 'completed').length;
    console.log(`${r.scene}：${okN}/${r.shots.length} 成功`);
    for (const s of r.shots) {
      const tag = s.status === 'completed' ? '✅' : s.status === 'dry' ? '○' : '❌';
      const extra = s.bytes ? ` ${(s.bytes / 1024).toFixed(0)}KB` : '';
      console.log(`  ${tag} ${s.title}${s.seconds ? ` ${s.seconds}s` : ''}${extra}`);
    }
  }
  if (!DRY) console.log(`\n产物已存到 ${OUT_DIR}（${saved} 张）`);

  await client.close();
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
});
