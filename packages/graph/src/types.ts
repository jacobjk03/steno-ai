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

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Fact {
  id: string;
  content: string;
  importance: number;
}

export interface MemoryGraphProps {
  /** Supabase project URL */
  supabaseUrl: string;
  /** Supabase key (anon or service role) */
  supabaseKey: string;
  /** Tenant ID to visualize */
  tenantId: string;
  /** Visual variant */
  variant?: 'console' | 'embedded';
  /** Container width (default: '100%') */
  width?: string | number;
  /** Container height (default: '100vh') */
  height?: string | number;
  /** Background color (default: '#08080f') */
  backgroundColor?: string;
  /** Called when a node is clicked */
  onNodeClick?: (node: GraphNode, facts: Fact[]) => void;
  /** Show built-in filter panel (default: true) */
  showFilters?: boolean;
  /** Show built-in stats panel (default: true) */
  showStats?: boolean;
  /** Show built-in fact panel on click (default: true) */
  showFactPanel?: boolean;
  /** Max nodes to display (default: 500) */
  maxNodes?: number;
  /** Custom class name for the container */
  className?: string;
}

export const TYPE_COLORS: Record<string, string> = {
  person: '#4488ff',
  organization: '#44dd88',
  location: '#ff5555',
  technology: '#aa66ff',
  concept: '#ff9944',
  event: '#ffdd44',
};

export const EDGE_COLORS: Record<string, string> = {
  associative: '#5566aa',
  causal: '#aa5566',
  temporal: '#55aa66',
  hierarchical: '#aaaa55',
  contradictory: '#ff3344',
};

export const DEFAULT_COLOR = '#555566';
