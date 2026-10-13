import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { connectTestDatabase, clearTestDatabase } from "../helpers";
import {bulkQueue} from "../../src/server/ads/bulk/queue";
import { createQueues } from "../../src/server/publisher/queue";
import { AuthService } from "../../src/server/auth/service";
import { TeamService } from "../../src/server/team/service";

export default async function globalSetup() {
  const connection = connectTestDatabase();
  try {
    await clearTestDatabase(connection);
    const bulk=bulkQueue(true);
    try{await bulk.queue.obliterate({force:true});}finally{await bulk.queue.close();}
    const queues = createQueues(true);
    try {
      await queues.video.obliterate({ force: true });
      await queues.comment.obliterate({ force: true });
    } finally {
      await queues.video.close();
      await queues.comment.close();
    }
    const password = randomBytes(24).toString("hex");
    const owner = await new AuthService(connection.db).createOwner({
      name: "Chủ sở hữu E2E",
      email: "owner@e2e.test",
      password,
      workspaceName: "Nhóm Affiliate",
    });
    await new TeamService(connection.db).create(owner, {
      name: "Nhân viên Chỉ xem",
      email: "viewer@e2e.test",
      password,
      role: "VIEWER",
    });
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/e2e-fixture.json", JSON.stringify({ password }), {
      mode: 0o600,
    });
  } finally {
    await connection.pool.end();
  }
}
