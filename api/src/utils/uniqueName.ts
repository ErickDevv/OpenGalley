import type { PoolClient } from "pg";

export async function uniqueProjectName(
  client: PoolClient,
  baseName: string,
  excludeId?: string
): Promise<string> {
  const likePattern = baseName + " (%";
  const query = excludeId
    ? `SELECT name FROM projects WHERE id <> $1 AND (name = $2 OR (name LIKE $3 AND RIGHT(name,1) = ')'))`
    : `SELECT name FROM projects WHERE name = $1 OR (name LIKE $2 AND RIGHT(name,1) = ')')`;
  const params: unknown[] = excludeId
    ? [excludeId, baseName, likePattern]
    : [baseName, likePattern];

  const { rows } = await client.query(query, params);

  const taken = new Set<string>();
  const prefix = baseName + " (";
  for (const row of rows) {
    const n = row.name as string;
    if (n === baseName) {
      taken.add(n);
    } else if (n.startsWith(prefix) && n.endsWith(")")) {
      const inner = n.slice(prefix.length, -1);
      if (/^\d+$/.test(inner)) taken.add(n);
    }
  }

  if (!taken.has(baseName)) return baseName;
  let n = 1;
  while (taken.has(`${baseName} (${n})`)) n++;
  return `${baseName} (${n})`;
}
