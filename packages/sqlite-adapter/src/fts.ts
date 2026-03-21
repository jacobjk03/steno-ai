import type Database from 'better-sqlite3';

/**
 * Insert a fact into the FTS5 index.
 */
export function indexFact(db: Database.Database, factId: string, content: string): void {
  db.prepare('INSERT INTO facts_fts (fact_id, content) VALUES (?, ?)')
    .run(factId, content);
}

/**
 * Remove a fact from the FTS5 index.
 */
export function removeFact(db: Database.Database, factId: string): void {
  db.prepare('DELETE FROM facts_fts WHERE fact_id = ?').run(factId);
}

/**
 * Search FTS5. Returns matching fact IDs with BM25 rank scores.
 * FTS5 rank values are negative (more negative = better match),
 * so we negate them to return positive scores.
 */
export function searchFTS(
  db: Database.Database,
  query: string,
  limit: number,
): Array<{ factId: string; rank: number }> {
  // Sanitize the query for FTS5 — wrap each term in double quotes to avoid syntax errors
  const sanitized = query
    .replace(/['"]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"`)
    .join(' ');

  if (!sanitized) return [];

  const rows = db
    .prepare(
      `SELECT fact_id, rank FROM facts_fts
       WHERE facts_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(sanitized, limit) as Array<{ fact_id: string; rank: number }>;

  return rows.map((row) => ({
    factId: row.fact_id,
    rank: -row.rank, // negate: FTS5 rank is negative, more negative = better
  }));
}
