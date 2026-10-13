import { connectionConfig } from "@/server/meta/service";
import { api } from "@/server/http/api";
import {
  databaseHealth,
  activeUserCount,
  activeSessionCount,
  auditCount,
} from "@/server/database/read-models";

export const GET = api(
  async () => {
    await databaseHealth();
    const [users, sessions, audits] = await Promise.all([
      activeUserCount(),
      activeSessionCount(),
      auditCount(),
    ]);
    return {
      database: "connected",
      activeUsers: users,
      activeSessions: sessions,
      auditEntries: audits,
      checkedAt: new Date().toISOString(),
      integrations: {
        meta: connectionConfig(),
        shopee: "MANUAL_TRACKING_CSV",
        telegram: "NOT_IMPLEMENTED",
      },
    };
  },
  { permission: "team:manage" },
);
