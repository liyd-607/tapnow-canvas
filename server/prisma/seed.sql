# ===========================================
# 数据库初始化脚本
# ===========================================

-- 创建默认租户
INSERT INTO "Tenant" (id, name, slug, plan, status, "createdAt", "updatedAt")
VALUES (
  'default-tenant',
  '默认租户',
  'default',
  'FREE',
  'ACTIVE',
  NOW(),
  NOW()
) ON CONFLICT (slug) DO NOTHING;

-- 创建管理员用户 (密码: admin123, BCrypt 加密)
INSERT INTO "User" (id, "tenantId", phone, password, nickname, role, status, "createdAt", "updatedAt")
VALUES (
  'admin-user',
  'default-tenant',
  '13800138000',
  '$2b$10$YourHashedPasswordHere',
  '管理员',
  'OWNER',
  'ACTIVE',
  NOW(),
  NOW()
) ON CONFLICT ("tenantId", phone) DO NOTHING;

-- 创建默认 AI 模型
INSERT INTO "AIModel" (id, name, type, "modelKey", "creditCost", enabled, "createdAt", "updatedAt")
VALUES
  ('model-dalle3', 'DALL-E 3', 'IMAGE', 'dall-e-3', 10, true, NOW(), NOW()),
  ('model-midjourney', 'Midjourney', 'IMAGE', 'midjourney', 8, true, NOW(), NOW()),
  ('model-sd', 'Stable Diffusion', 'IMAGE', 'stable-diffusion', 5, true, NOW(), NOW()),
  ('model-sora', 'Sora', 'VIDEO', 'sora', 50, true, NOW(), NOW()),
  ('model-kling', '可灵', 'VIDEO', 'kling', 30, true, NOW(), NOW()),
  ('model-gpt4', 'GPT-4', 'TEXT', 'gpt-4', 5, true, NOW(), NOW()),
  ('model-claude', 'Claude', 'TEXT', 'claude', 5, true, NOW(), NOW())
ON CONFLICT ("modelKey") DO UPDATE SET
  name = EXCLUDED.name,
  "creditCost" = EXCLUDED."creditCost",
  enabled = EXCLUDED.enabled;

-- 创建默认配额
INSERT INTO "TenantQuota" (id, "tenantId", resource, limit, used, "createdAt", "updatedAt")
VALUES
  ('quota-images', 'default-tenant', 'images_per_month', 50, 0, NOW(), NOW()),
  ('quota-videos', 'default-tenant', 'videos_per_month', 10, 0, NOW(), NOW()),
  ('quota-storage', 'default-tenant', 'storage_gb', 1, 0, NOW(), NOW()),
  ('quota-members', 'default-tenant', 'members', 3, 1, NOW(), NOW())
ON CONFLICT ("tenantId", resource) DO UPDATE SET
  limit = EXCLUDED.limit;
