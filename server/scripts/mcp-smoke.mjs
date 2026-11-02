/**
 * MCP 冒烟测试：用官方 SDK 客户端连 TapNow 的 MCP 端点。
 *
 * 目的：验证「WorkBuddy 真实会走的路径」可用 —— 不是用 curl 模拟，
 * 而是真正跑一遍 StreamableHTTPClientTransport + Client。
 *
 * 用法：
 *   node scripts/mcp-smoke.mjs
 *   TAPNOW_MCP_URL=http://127.0.0.1:3001/api/mcp node scripts/mcp-smoke.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const URL_ = process.env.TAPNOW_MCP_URL ?? 'http://127.0.0.1:3001/api/mcp';
const TOKEN = process.env.TAPNOW_SERVICE_TOKEN ?? '';
const USER_ID = process.env.TAPNOW_USER_ID ?? '';

function ok(msg) {
  console.log(`✅ ${msg}`);
}
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
}

async function main() {
  if (!TOKEN) {
    fail('缺少 TAPNOW_SERVICE_TOKEN（取自 server/.env 的 ORCHESTRATOR_TOKEN）');
    return;
  }

  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: {
      headers: {
        'X-TapNow-Service-Token': TOKEN,
        'X-TapNow-User-Id': USER_ID,
      },
    },
  });

  const client = new Client({ name: 'tapnow-smoke', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
  } catch (e) {
    fail(`连接失败：${e?.message ?? e}`);
    return;
  }
  ok(`已连接 ${URL_}（serverInfo: ${JSON.stringify(client.getServerVersion())}）`);

  // 1) 工具清单
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.log(`   工具 ${names.length} 个：${names.join(', ')}`);
  const expected = [
    'tapnow_list_canvases',
    'tapnow_get_canvas',
    'tapnow_create_canvas',
    'tapnow_create_node',
    'tapnow_update_node',
    'tapnow_delete_node',
    'tapnow_connect_nodes',
    'tapnow_disconnect_nodes',
    'tapnow_generate_node',
    'tapnow_run_graph',
    'tapnow_list_models',
  ];
  const missing = expected.filter((n) => !names.includes(n));
  if (missing.length) fail(`缺少工具：${missing.join(', ')}`);
  else ok(`工具齐全（${expected.length}/${expected.length}）`);

  // 2) 只读调用
  const canvases = await client.callTool({ name: 'tapnow_list_canvases', arguments: { pageSize: 3 } });
  if (canvases.isError) fail(`tapnow_list_canvases 报错：${JSON.stringify(canvases.content)}`);
  else ok(`tapnow_list_canvases → ${canvases.content[0].text.split('\n')[0]}`);

  const models = await client.callTool({ name: 'tapnow_list_models', arguments: {} });
  if (models.isError) fail(`tapnow_list_models 报错`);
  else ok(`tapnow_list_models → ${models.content[0].text.slice(0, 120)}`);

  // 3) 闭环写测：create_node → get_canvas → delete_node
  const first = JSON.parse(canvases.content[1].text).canvases[0];
  const canvasId = first.id;
  const before = JSON.parse(
    (await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId } })).content[1].text,
  );

  const created = await client.callTool({
    name: 'tapnow_create_node',
    arguments: {
      canvasId,
      type: 'image',
      title: '__mcp_smoke__',
      x: 1200,
      y: 1200,
      prompt: 'smoke test',
      model: 'minimax-image',
    },
  });
  if (created.isError) {
    fail(`tapnow_create_node 报错：${JSON.stringify(created.content)}`);
    return;
  }
  const nodeId = JSON.parse(created.content[1].text).node.id;
  ok(`tapnow_create_node → ${nodeId}`);

  const after = JSON.parse(
    (await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId } })).content[1].text,
  );
  if (after.nodes.length !== before.nodes.length + 1) {
    fail(`节点数不对：${before.nodes.length} → ${after.nodes.length}`);
  } else {
    ok(`tapnow_get_canvas → 节点 ${before.nodes.length} → ${after.nodes.length}`);
  }

  const removed = await client.callTool({
    name: 'tapnow_delete_node',
    arguments: { canvasId, nodeId },
  });
  if (removed.isError) fail(`tapnow_delete_node 报错`);
  else ok(`tapnow_delete_node → ${nodeId} 已删除`);

  const final = JSON.parse(
    (await client.callTool({ name: 'tapnow_get_canvas', arguments: { canvasId } })).content[1].text,
  );
  if (final.nodes.length !== before.nodes.length) {
    fail(`清理失败，残留节点：${final.nodes.length}`);
  } else {
    ok(`清理完成，画布回到 ${final.nodes.length} 个节点（无残留）`);
  }

  await client.close();
  console.log('\n🎉 TapNow MCP 冒烟测试全部通过');
}

main().catch((e) => {
  fail(e?.message ?? String(e));
  console.error(e);
});
