/**
 * Coarse activity / audit trail used by the product timeline. Fine-grained
 * stock changes already live in `inventory_movements`; this captures catalog
 * events (create / update / archive / duplicate / price change).
 */
import { getDb } from "./db";
import type { ActivityEntry } from "./types";

export interface ActivityInput {
  entity_type: ActivityEntry["entity_type"];
  entity_id: number;
  action: string;
  detail?: string | null;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO activity_log (entity_type, entity_id, action, detail)
     VALUES ($1, $2, $3, $4)`,
    [input.entity_type, input.entity_id, input.action, input.detail ?? null],
  );
}

export async function listActivity(
  entityType: ActivityEntry["entity_type"],
  entityId: number,
  limit = 100,
): Promise<ActivityEntry[]> {
  const db = await getDb();
  return db.select<ActivityEntry[]>(
    `SELECT * FROM activity_log
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY id DESC LIMIT $3`,
    [entityType, entityId, limit],
  );
}
