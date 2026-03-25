import { createClient } from '@supabase/supabase-js';

export interface GraphNode {
  id: string;
  name: string;
  displayName: string;
  type: string;
  factCount: number;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: string;
  edgeType: string;
  weight: number;
}

export interface Fact {
  id: string;
  content: string;
  importance: number;
}

export const TYPE_COLORS: Record<string, string> = {
  person: '#6366f1',
  organization: '#22c55e',
  location: '#ef4444',
  technology: '#a855f7',
  concept: '#f59e0b',
  event: '#eab308',
};

export const EDGE_COLORS: Record<string, string> = {
  associative: '#6677cc',
  causal: '#dd6688',
  temporal: '#66cc88',
  hierarchical: '#cccc66',
  contradictory: '#ef4444',
};

export const DEFAULT_COLOR = '#3a3a50';

function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function fetchGraphData(url: string, key: string, tenantId: string) {
  const sb = createClient(url, key);

  const [entRes, edgRes, feRes, factRes] = await Promise.all([
    sb.from('entities').select('id,canonical_name,name,entity_type').eq('tenant_id', tenantId).is('merge_target_id', null).limit(500),
    sb.from('edges').select('id,source_id,target_id,relation,edge_type,weight').eq('tenant_id', tenantId).limit(5000),
    sb.from('fact_entities').select('entity_id').limit(10000),
    sb.from('facts').select('id').eq('tenant_id', tenantId).is('valid_until', null).limit(2000),
  ]);

  const entities = entRes.data || [];
  const edges = edgRes.data || [];
  const factEntities = feRes.data || [];
  const totalFacts = factRes.data?.length || 0;

  // Build fact count per entity
  const eids = new Set(entities.map(e => e.id));
  const fc: Record<string, number> = {};
  factEntities.forEach(fe => { if (eids.has(fe.entity_id)) fc[fe.entity_id] = (fc[fe.entity_id] || 0) + 1; });

  const nodes: GraphNode[] = entities.map(e => ({
    id: e.id,
    name: e.canonical_name || e.name || '?',
    displayName: capitalize(e.name || e.canonical_name || '?'),
    type: e.entity_type || 'concept',
    factCount: fc[e.id] || 0,
  }));

  const nodeIds = new Set(nodes.map(n => n.id));
  const links: GraphLink[] = edges
    .filter(e => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
    .map(e => ({
      source: e.source_id,
      target: e.target_id,
      relation: e.relation,
      edgeType: e.edge_type,
      weight: parseFloat(e.weight) || 1,
    }));

  return { nodes, links, totalFacts };
}

export async function fetchFactsForEntity(url: string, key: string, entityId: string): Promise<Fact[]> {
  const sb = createClient(url, key);
  const { data } = await sb.from('fact_entities').select('facts(id,content,importance)').eq('entity_id', entityId).limit(30);
  return (data || []).map((d: any) => d.facts).filter(Boolean).sort((a: Fact, b: Fact) => (b.importance || 0) - (a.importance || 0));
}
