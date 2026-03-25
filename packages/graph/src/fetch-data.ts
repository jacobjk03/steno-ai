import type { GraphData, GraphNode, GraphLink } from './types.js';

interface SupabaseConfig {
  url: string;
  key: string;
  tenantId: string;
  maxNodes?: number;
}

async function supabaseGet(config: SupabaseConfig, table: string, query: string): Promise<any[]> {
  const res = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status}`);
  return res.json();
}

async function supabaseCount(config: SupabaseConfig, table: string, query: string): Promise<number> {
  const res = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
      'Prefer': 'count=exact',
      'Range-Unit': 'items',
      'Range': '0-0',
    },
  });
  const range = res.headers.get('content-range');
  if (range) {
    const total = range.split('/')[1];
    return total === '*' ? 0 : parseInt(total, 10);
  }
  return 0;
}

export async function fetchGraphData(config: SupabaseConfig): Promise<{ data: GraphData; totalFacts: number }> {
  const maxNodes = config.maxNodes || 500;

  // Fetch in parallel
  const [entities, edges, factEntities, totalFacts] = await Promise.all([
    supabaseGet(config, 'entities',
      `tenant_id=eq.${config.tenantId}&merge_target_id=is.null&select=id,canonical_name,name,entity_type&limit=${maxNodes}`
    ),
    supabaseGet(config, 'edges',
      `tenant_id=eq.${config.tenantId}&select=id,source_id,target_id,relation,edge_type,weight&limit=5000`
    ),
    supabaseGet(config, 'fact_entities', `select=entity_id&limit=10000`),
    supabaseCount(config, 'facts',
      `tenant_id=eq.${config.tenantId}&valid_until=is.null`
    ),
  ]);

  // Build fact count map
  const entityIdSet = new Set(entities.map((e: any) => e.id));
  const factCounts: Record<string, number> = {};
  for (const fe of factEntities) {
    if (entityIdSet.has(fe.entity_id)) {
      factCounts[fe.entity_id] = (factCounts[fe.entity_id] || 0) + 1;
    }
  }

  // Build nodes
  const nodes: GraphNode[] = entities.map((e: any) => ({
    id: e.id,
    name: e.canonical_name || e.name || 'unknown',
    displayName: e.name || e.canonical_name || 'unknown',
    type: e.entity_type || 'concept',
    factCount: factCounts[e.id] || 0,
  }));

  // Build links
  const nodeIds = new Set(nodes.map(n => n.id));
  const links: GraphLink[] = edges
    .filter((e: any) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
    .map((e: any) => ({
      source: e.source_id,
      target: e.target_id,
      relation: e.relation,
      edgeType: e.edge_type,
      weight: parseFloat(e.weight) || 1,
    }));

  return { data: { nodes, links }, totalFacts };
}

export async function fetchFactsForEntity(config: SupabaseConfig, entityId: string): Promise<any[]> {
  const factLinks = await supabaseGet(config, 'fact_entities',
    `entity_id=eq.${entityId}&select=facts(id,content,importance)&limit=20`
  );
  return (factLinks || [])
    .map((fl: any) => fl.facts)
    .filter(Boolean)
    .sort((a: any, b: any) => (b.importance || 0) - (a.importance || 0));
}
