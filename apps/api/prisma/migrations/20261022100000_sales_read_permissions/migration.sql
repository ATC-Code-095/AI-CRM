-- 数据迁移：给内置销售类角色补充读取权限（与 packages/shared ROLE_PERMISSION_SEED 一致）
--   销售经理 / 销售 / 客服：field_definition:read（查看与填写自定义字段）
--   销售：goal:read（查看目标配额）
-- 只对系统内置角色追加，不删除任何已有权限；重复执行无副作用。
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON (r."code" IN ('SALES_MANAGER', 'SALES_REP', 'SERVICE_AGENT') AND p."code" = 'field_definition:read')
  OR (r."code" = 'SALES_REP' AND p."code" = 'goal:read')
WHERE r."isSystem" = true
  AND r."deletedAt" IS NULL
ON CONFLICT DO NOTHING;
