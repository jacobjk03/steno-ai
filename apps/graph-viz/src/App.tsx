import { useState, useEffect, useMemo, useCallback } from 'react';
import { ForceGraph } from './components/ForceGraph';
import { StatsPanel } from './components/StatsPanel';
import { FilterPanel } from './components/FilterPanel';
import { FactPanel } from './components/FactPanel';
import { EdgeLegend } from './components/EdgeLegend';
import { Tooltip } from './components/Tooltip';
import { fetchGraphData, fetchFactsForEntity } from './lib/supabase';
import type { GraphNode, GraphLink, Fact } from './lib/supabase';

// Dev config — in production this would come from auth/API
const DEV_CONFIG = {
  url: 'https://zhqcetwuecedebrbawxl.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpocWNldHd1ZWNlZGVicmJhd3hsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEzNjI0MywiZXhwIjoyMDg5NzEyMjQzfQ.-X67FxdhU1kd2jhUeZb8UXta8tSMe0TPLa-XgOJD8rY',
  tenant: '00000000-0000-0000-0000-000000000001',
};

function getConfig() {
  const saved = localStorage.getItem('steno_gv_key');
  if (saved) {
    return {
      url: localStorage.getItem('steno_gv_url') || DEV_CONFIG.url,
      key: saved,
      tenant: localStorage.getItem('steno_gv_tenant') || DEV_CONFIG.tenant,
    };
  }
  // Auto-use dev config
  return DEV_CONFIG;
}

export function App() {
  const [config, setConfig] = useState(getConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [allLinks, setAllLinks] = useState<GraphLink[]>([]);
  const [totalFacts, setTotalFacts] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());

  // Interaction
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedFacts, setSelectedFacts] = useState<Fact[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const needsConfig = !config.url || !config.key;

  // Track mouse for tooltip
  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Load data
  useEffect(() => {
    if (needsConfig) return;
    setLoading(true);
    setError(null);
    fetchGraphData(config.url, config.key, config.tenant)
      .then(({ nodes, links, totalFacts }) => {
        setAllNodes(nodes);
        setAllLinks(links);
        setTotalFacts(totalFacts);
        setEnabledTypes(new Set(nodes.map(n => n.type)));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [config, needsConfig]);

  // Save config to localStorage when URL param provided
  useEffect(() => {
    if (config.url && config.key) {
      localStorage.setItem('steno_gv_url', config.url);
      localStorage.setItem('steno_gv_key', config.key);
      localStorage.setItem('steno_gv_tenant', config.tenant);
    }
  }, [config]);

  // Filtered data
  const { filteredNodes, filteredLinks } = useMemo(() => {
    const term = search.toLowerCase();
    const fn = allNodes.filter(n => {
      if (!enabledTypes.has(n.type)) return false;
      if (term && !n.name.includes(term) && !n.displayName.toLowerCase().includes(term)) return false;
      return true;
    });
    const ids = new Set(fn.map(n => n.id));
    const fl = allLinks.filter(l => ids.has(l.source as string) && ids.has(l.target as string));
    return { filteredNodes: fn, filteredLinks: fl };
  }, [allNodes, allLinks, search, enabledTypes]);

  // Entity types with counts
  const typeStats = useMemo(() => {
    const map: Record<string, number> = {};
    allNodes.forEach(n => { map[n.type] = (map[n.type] || 0) + 1; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => ({ type, count }));
  }, [allNodes]);

  const edgeTypes = useMemo(() =>
    [...new Set(allLinks.map(l => l.edgeType))].sort(),
  [allLinks]);

  const toggleType = useCallback((type: string) => {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback(async (node: GraphNode) => {
    setSelectedNode(node);
    setFactsLoading(true);
    try {
      const facts = await fetchFactsForEntity(config.url, config.key, node.id);
      setSelectedFacts(facts);
    } catch {
      setSelectedFacts([]);
    }
    setFactsLoading(false);
  }, [config]);

  const handleSaveConfig = (url: string, key: string, tenant: string) => {
    setConfig({ url, key, tenant });
  };

  // ─── Config Screen ───
  if (needsConfig) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-[400px] rounded-2xl border border-white/[0.06] bg-[rgba(12,12,20,0.9)] p-8 shadow-2xl">
          <h2 className="mb-1 text-xl font-semibold">
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Steno Memory Graph
            </span>
          </h2>
          <p className="mb-6 text-sm text-[#555]">Connect to your Supabase instance</p>
          <form onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            handleSaveConfig(fd.get('url') as string, fd.get('key') as string, fd.get('tenant') as string);
          }}>
            <label className="mb-1 block text-[11px] text-[#555]">Supabase URL</label>
            <input name="url" defaultValue="https://zhqcetwuecedebrbawxl.supabase.co" className="mb-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/60" />
            <label className="mb-1 block text-[11px] text-[#555]">Supabase Key</label>
            <input name="key" type="password" className="mb-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/60" />
            <label className="mb-1 block text-[11px] text-[#555]">Tenant ID</label>
            <input name="tenant" defaultValue="00000000-0000-0000-0000-000000000001" className="mb-5 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/60" />
            <button type="submit" className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600">
              Connect
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#16162a] border-t-indigo-400" />
        <p className="text-sm text-[#555]">Loading memory graph...</p>
      </div>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-red-400">Failed to load graph</div>
          <div className="mt-2 text-sm text-[#555]">{error}</div>
          <button onClick={() => setConfig({ url: '', key: '', tenant: '' })} className="mt-4 rounded-lg bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10">
            Reconfigure
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Graph ───
  return (
    <div className="h-screen w-screen">
      <ForceGraph
        nodes={filteredNodes}
        links={filteredLinks}
        onNodeClick={handleNodeClick}
        onNodeHover={setHoveredNode}
      />

      <StatsPanel
        entities={allNodes.length}
        edges={allLinks.length}
        facts={totalFacts}
        visible={filteredNodes.length}
      />

      <FilterPanel
        types={typeStats}
        enabledTypes={enabledTypes}
        onToggleType={toggleType}
        search={search}
        onSearch={setSearch}
      />

      <EdgeLegend types={edgeTypes} />

      <Tooltip node={hoveredNode} position={mousePos} />

      <FactPanel
        node={selectedNode}
        facts={selectedFacts}
        edges={allLinks}
        allNodes={allNodes}
        loading={factsLoading}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
