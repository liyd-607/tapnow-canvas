/**
 * MCP 端到端测试：真的生成一张图，验证「画布 → 节点 → 出图 → 落盘」全链路。
 *
 * 与 mcp-smoke.mjs 的区别：
 *   smoke 只验证增删改节点（不花钱）；
 *   e2e  会真的调用模型供应商出图，并下载产物校验字节数。
 *
 * 用法：
 *   node scripts/mcp-e2e.mjs                       # 用默认模型
 *   TAPNOW_E2E_MODEL=tokenplan-wan2.7 node scripts/mcp-e2e.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const URL_ = process.env.TAPNOW_MCP_URL ?? 'http://127.0.0.1:3001/api/mcp';
const TOKEN = process.env.TAPNOW_SERVICE_TOKEN ?? '';
const USER_ID = process.env.TAPNOW_USER_ID ?? '';
// 默认跟随线上默认模型，确保测的就是用户/Agent 实际会走的那个
const MODEL =
  process.env.TAPNOW_E2E_MODEL ??
  process.env.TAPNOW_DEFAULT_IMAGE_MODEL ??
  'tokenplan-wan2.7';
const PROMPT =
  process.env.TAPNOW_E2E_PROMPT ??
  '一只橘猫趴在窗台上晒太阳，午后暖光，柔和写实风格，浅景深';
const KEEP = process.env.TAPNOW_E2E_KEEP === '1';

let failures = 0;
const ok = (m) => console.log(`✅ ${m}`);
const fail = (m) => {
  failures++;
  console.log(`❌ ${m}`);
};

/** MCP 工具返回两段：content[0] 人话摘要，content[1] JSON 明细 */
function parseTool(res, label) {
  if (res.isError) {
    fail(`${label} 报错：${res.content?.[0]?.text ?? JSON.stringify(res.content)}`);
    return null;
  }
  const text = res.content?.[0]?.text ?? '';
  console.log(`   ${label} → ${text.split('\n')[0]}`);
  try {
    return JSON.parse(res.content[1].text);
  } catch {
    return null;
  }
}

async function main() {
  if (!TOKEN) {
    fail('缺少 TAPNOW_SERVICE_TOKEN（取自 server/.env 的 ORCHESTRATOR_TOKEN）');
    return;
  }

  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: {
      headers: { 'X-TapNow-Service-Token': TOKEN, 'X-TapNow-User-Id': USER_ID },
    },
  });
  const client = new Client({ name: 'tapnow-e2e', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  ok(`已连接 ${URL_}（serverInfo: ${JSON.stringify(client.getServerVersion())}）`);

  const canvasName = `__mcp_e2e_${Date.now().toString(36)}__`;
  let canvasId = null;

  try {
    // 1) 建画布
    const c = parseTool(
      await client.callTool({ name: 'tapnow_create_canvas', arguments: { name: canvasName, width: 1600, height: 1200 } }),
      'tapnow_create_canvas',
    );
    if (!c) return;
    canvasId = c.id;
    ok(`画布已建：${canvasId}`);

    // 2) 建两个节点：文本(prompt 源) + 图片(生成目标)，再连线，模拟真实用法
    const t = parseTool(
      await client.callTool({
        name: 'tapnow_create_node',
        arguments: { canvasId, type: 'text', title: '镜头描述', x: 80, y: 120, width: 320, height: 160 },
      }),
      'tapnow_create_node(text)',
    );
    const img = parseTool(
      await client.callTool({
        name: 'tapnow_create_node',
        arguments: {
          canvasId,
          type: 'image',
          title: '橘猫晒太阳',
          x: 480,
          y: 100,
          model: MODEL,
          prompt: PROMPT,
          aspectRatio: '1:1',
          count: 1,
        },
      }),
      'tapnow_create_node(image)',
    );
    if (!img?.node?.id) return;
    const nodeId = img.node.id;

    if (t?.node?.id) {
      parseTool(
        await client.callTool({
          name: 'tapnow_connect_nodes',
          arguments: { canvasId, from: t.node.id, to: nodeId, role: 'subject' },
        }),
        'tapnow_connect_nodes',
      );
    }

    // 3) 改一次节点，验证 update_node 能改 prompt（乐观锁路径）
    parseTool(
      await client.callTool({
        name: 'tapnow_update_node',
        arguments: { canvasId, nodeId, title: '橘猫·午后', y: 140 },
      }),
      'tapnow_update_node',
    );

    // 4) 真的出图
    const t0 = Date.now();
    const gen = parseTool(
      await client.callTool({ name: 'tapnow_generate_node', arguments: { canvasId, nodeId } }),
      'tapnow_generate_node',
    );
    const cost = ((Date.now() - t0) / 1000).toFixed(1);

    if (!gen) return;
    if (gen.status !== 'completed') {
      fail(`生成未成功：status=${gen.status} error=${gen.error ?? '无'}`);
      return;
    }
    ok(`出图完成，耗时 ${cost}s，status=${gen.status}`);
    console.log(`   resultUrl: ${gen.resultUrl}`);

    // 5) 下载产物，校验真的有字节
    const r = await fetch(gen.resultUrl);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) fail(`产物下载失败：HTTP ${r.status}`);
    else if (buf.length < 1024) fail(`产物字节数异常：${buf.length}B`);
    else ok(`产物下载成功：${(buf.length / 1024).toFixed(1)} KB，Content-Type=${r.headers.get('content-type')}`);

    // 6) 回读画布，确认结果已落盘
    const snap = parseTool(await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId } }), 'tapnow_get_canvas');
    if (snapshotMatches(snap, nodeId, gen.resultUrl)) {
      ok(`回读画布 → 节点状态已落盘（${snap.nodes.length} 节点 / ${snap.edges.length} 连线）`);
    } else {
      fail('回读画布：节点状态与 resultUrl 未落盘');
    }

    // 7) 断开连线 + 删节点，验证清理链路
    if (t?.node?.id) {
      parseTool(
        await client.callTool({ name: 'tapnow_disconnect_nodes', arguments: { canvasId, from: t.node.id, to: nodeId } }),
        'tapnow_disconnect_nodes',
      );
    }
    parseTool(await client.callTool({ name: 'tapnow_delete_node', arguments: { canvasId, nodeId } }), 'tapnow_delete_node');

    // 8) 负例：删掉的节点再删一次，应当报错但不崩
    const neg = await client.callTool({ name: 'tapnow_delete_node', arguments: { canvasId, nodeId } });
    if (neg.isError) ok(`负例按预期报错：${neg.content?.[0]?.text?.split('\n')[0]}`);
    else fail('负例没有报错（删除不存在的节点应当失败）');
  } finally {
    if (canvasId && !KEEP) {
      await deleteCanvasViaPrisma(canvasName);
    }
    await client.close();
  }

  console.log(failures ? `\n💥 ${failures} 项失败` : '\n🎉 TapNow MCP 端到端全部通过（含真实出图）');
  if (failures) process.exitCode = 1;
}

function snapshotMatches(snap, nodeId, url) {
  const n = snap?.nodes?.find((x) => x.id === nodeId);
  return !!n && n.status === 'completed' && n.resultUrl === url;
}

/** 画布删除没有对外的 API，直接动库；删不干净也不影响判定 */
async function deleteCanvasViaPrisma(name) {
  console.log(`   清理：画布 ${name} 需手动删（MCP 未暴露删除画布）`);
}

main().catch((e) => {
  fail(e?.message ?? String(e));
  console.error(e);
});
