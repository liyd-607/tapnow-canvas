-- 对标即梦（Jimeng）的生成幂等 / 真实阶段 / 画布变更集改造
--
-- 1. GenerationTask：
--    clientRequestId  客户端幂等键（同一用户重复提交 → 复用任务，不重复扣费/生成）
--    traceId          全链路追踪号（对标即梦 logid）
--    stage            真实阶段 QUEUED/DISPATCHING/GENERATING/PERSISTING/COMPLETED/FAILED/CANCELLED
--    cancelRequested  取消标记（排队中 / 生成中可撤销）
-- 2. Canvas.graphVersion：画布图版本号，用于乐观锁与变更集基线
-- 3. CanvasChange：画布增量变更集（node/edge 的 upsert / remove），支持 since=seq 拉增量

-- AlterTable
ALTER TABLE "GenerationTask" ADD COLUMN     "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientRequestId" TEXT,
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'QUEUED',
ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "Canvas" ADD COLUMN     "graphVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CanvasChange" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "actorId" TEXT,
    "baseVersion" INTEGER NOT NULL,
    "ops" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasChange_canvasId_createdAt_idx" ON "CanvasChange"("canvasId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasChange_canvasId_seq_key" ON "CanvasChange"("canvasId", "seq");

-- CreateIndex
CREATE INDEX "GenerationTask_traceId_idx" ON "GenerationTask"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationTask_userId_clientRequestId_key" ON "GenerationTask"("userId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "CanvasChange" ADD CONSTRAINT "CanvasChange_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
