/**
 * Backfill event_date on facts that mention dates in their content but don't have event_date set.
 * Uses regex to extract dates from fact text — no LLM calls needed.
 *
 * Usage: set -a && source .env && set +a && bun scripts/backfill-dates.ts
 */

import { createSupabaseClient } from '../packages/supabase-adapter/src/index.ts';

const supabase = createSupabaseClient({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const client = (supabase as any);

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function extractDate(text: string): string | null {
  const lower = text.toLowerCase();

  // ISO date: 2026-03-20
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "March 20, 2026" or "March 20 2026" or "20 March 2026"
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    // "March 20, 2026"
    const m1 = lower.match(new RegExp(`${name}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(\\d{4})`));
    if (m1) return `${m1[2]}-${String(num).padStart(2, '0')}-${m1[1]!.padStart(2, '0')}`;

    // "20 March 2026"
    const m2 = lower.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}\\.?[,\\s]+(\\d{4})`));
    if (m2) return `${m2[2]}-${String(num).padStart(2, '0')}-${m2[1]!.padStart(2, '0')}`;

    // "March 2026" (month only, use 15th as midpoint)
    const m3 = lower.match(new RegExp(`(?:in|during|around|of)\\s+${name}\\.?\\s+(\\d{4})`));
    if (m3) return `${m3[1]}-${String(num).padStart(2, '0')}-15`;

    // "March 20" (no year — assume 2026)
    const m4 = lower.match(new RegExp(`${name}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s|,|$)`));
    if (m4) return `2026-${String(num).padStart(2, '0')}-${m4[1]!.padStart(2, '0')}`;
  }

  // "Q2 2026", "Q3 2026"
  const quarter = lower.match(/q([1-4])\s+(\d{4})/);
  if (quarter) {
    const month = (parseInt(quarter[1]!) - 1) * 3 + 2; // middle month of quarter
    return `${quarter[2]}-${String(month).padStart(2, '0')}-15`;
  }

  return null;
}

async function main() {
  // Get facts without event_date
  const { data: facts, error } = await client
    .from('facts')
    .select('id, content')
    .is('event_date', null)
    .not('tags', 'cs', '{"scratchpad"}')
    .order('created_at', { ascending: true });

  if (error) { console.error('Fetch error:', error.message); return; }
  console.log(`Found ${facts.length} facts without event_date`);

  let updated = 0;
  let skipped = 0;

  for (const fact of facts) {
    const date = extractDate(fact.content);
    if (!date) {
      skipped++;
      continue;
    }

    const { error } = await client
      .from('facts')
      .update({ event_date: date })
      .eq('id', fact.id);

    if (error) {
      console.error(`Failed ${fact.id}:`, error.message);
    } else {
      updated++;
    }
  }

  console.log(`Done: ${updated} updated, ${skipped} skipped (no date found)`);
}

main().catch(console.error);
