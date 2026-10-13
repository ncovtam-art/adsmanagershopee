import type { Role } from "../database/schema";
import { AppError } from "../http/errors";

export const permissions = [
  "workspace:read",
  "team:manage",
  "settings:write",
  "finance:read",
  "meta:manage",
  "donors:write",
  "products:write",
  "tracking:write",
  "commissions:manage",
  "publisher:write",
  "ads:write",
] as const;
export type Permission = (typeof permissions)[number];
export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

const grants: Record<Role, readonly Permission[]> = {
  OWNER: permissions,
  ADMIN: permissions,
  MANAGER: [
    "workspace:read",
    "finance:read",
    "donors:write",
    "products:write",
    "tracking:write",
    "publisher:write",
    "ads:write",
  ],
  MEDIA_BUYER: [
    "workspace:read",
    "finance:read",
    "donors:write",
    "products:write",
    "tracking:write",
    "publisher:write",
    "ads:write",
  ],
  UPLOADER: ["workspace:read", "products:write", "tracking:write", "publisher:write"],
  VIEWER: ["workspace:read"],
};

export function can(role: Role, permission: Permission) {
  return grants[role].includes(permission);
}
export function requirePermission(
  actor: Actor | null,
  permission: Permission,
): asserts actor is Actor {
  if (!actor || !actor.active)
    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "Vui lòng đăng nhập để tiếp tục.",
    );
  if (!can(actor.role, permission))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Bạn chưa có quyền thực hiện thao tác này. Vui lòng liên hệ quản trị viên.",
    );
}
