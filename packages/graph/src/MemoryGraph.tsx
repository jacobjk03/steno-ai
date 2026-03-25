import { useEffect, useRef, useState, useCallback } from 'react';
import type { MemoryGraphProps, GraphData, GraphNode, Fact } from './types.js';
import { TYPE_COLORS, EDGE_COLORS, DEFAULT_COLOR } from './types.js';
import { fetchGraphData, fetchFactsForEntity } from './fetch-data.js';

export function MemoryGraph({
  supabaseUrl,
  supabaseKey,
  tenantId,
  variant = 'console',
  width = '100%',
  height = '100vh',
  backgroundColor = '#08080f',
  onNodeClick,
  showFilters = true,
  showStats = true,
  showFactPanel = true,
  maxNodes = 500,
  className,
}: MemoryGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [fullData, setFullData] = useState<GraphData>({ nodes: [], links: [] });
  const [totalFacts, setTotalFacts] = useState(0);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedFacts, setSelectedFacts] = useState<Fact[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  const config = { url: supabaseUrl, key: supabaseKey, tenantId, maxNodes };
  const zoom = variant === 'console' ? 0.8 : 0.5;

  // Load data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchGraphData(config);
        if (cancelled) return;
        setFullData(result.data);
        setGraphData(result.data);
        setTotalFacts(result.totalFacts);
        const types = new Set(result.data.nodes.map(n => n.type));
        setEnabledTypes(types);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabaseUrl, supabaseKey, tenantId]);

  // Initialize 3D graph
  useEffect(() => {
    if (loading || error || !containerRef.current || graphData.nodes.length === 0) return;

    let ForceGraph3D: any;
    let THREE: any;

    (async () => {
      // Dynamic import for SSR safety
      const fg = await import('3d-force-graph');
      ForceGraph3D = fg.default;
      THREE = await import('three');

      if (!containerRef.current) return;

      // Clear previous
      if (graphRef.current) {
        containerRef.current.innerHTML = '';
      }

      const graph = ForceGraph3D()(containerRef.current)
        .backgroundColor(backgroundColor)
        .width(containerRef.current.clientWidth)
        .height(containerRef.current.clientHeight)
        .graphData({ nodes: [...graphData.nodes], links: [...graphData.links] })
        .nodeVal((n: any) => Math.max(2, Math.sqrt(n.factCount + 1) * 2.5))
        .nodeColor((n: any) => TYPE_COLORS[n.type] || DEFAULT_COLOR)
        .nodeOpacity(0.92)
        .nodeLabel('')
        .nodeThreeObject((node: any) => {
          const group = new THREE.Group();
          const size = Math.max(3, Math.sqrt(node.factCount + 1) * 2.5);
          const color = TYPE_COLORS[node.type] || DEFAULT_COLOR;

          // Glowing sphere
          const geo = new THREE.SphereGeometry(size, 16, 16);
          const mat = new THREE.MeshPhongMaterial({
            color, emissive: color, emissiveIntensity: 0.4,
            transparent: true, opacity: 0.88,
          });
          group.add(new THREE.Mesh(geo, mat));

          // Text label
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          const text = node.displayName || node.name;
          const fontSize = 28;
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          const tw = ctx.measureText(text).width;
          canvas.width = tw + 20;
          canvas.height = fontSize + 10;
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = '#e0e0e8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, canvas.width / 2, canvas.height / 2);

          const texture = new THREE.CanvasTexture(canvas);
          const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.85 });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(canvas.width / 8, canvas.height / 8, 1);
          sprite.position.y = size + 5;
          group.add(sprite);

          return group;
        })
        .linkColor((l: any) => EDGE_COLORS[l.edgeType] || '#333344')
        .linkWidth((l: any) => Math.max(0.3, l.weight * 0.8))
        .linkOpacity(0.35)
        .linkDirectionalParticles((l: any) => l.weight > 0.5 ? 2 : 1)
        .linkDirectionalParticleWidth(1.2)
        .linkDirectionalParticleColor((l: any) => EDGE_COLORS[l.edgeType] || '#444455')
        .linkLabel((l: any) => `${l.relation} (${l.edgeType})`)
        .onNodeHover((node: any, prevNode: any) => {
          if (node) {
            // We'll handle tooltip via state
            setTooltip({ node, x: 0, y: 0 });
          } else {
            setTooltip(null);
          }
          containerRef.current!.style.cursor = node ? 'pointer' : 'default';
        })
        .onNodeClick(async (node: any) => {
          setSelectedNode(node);
          if (onNodeClick) {
            setFactsLoading(true);
            const facts = await fetchFactsForEntity(config, node.id);
            setSelectedFacts(facts);
            setFactsLoading(false);
            onNodeClick(node, facts);
          } else if (showFactPanel) {
            setFactsLoading(true);
            const facts = await fetchFactsForEntity(config, node.id);
            setSelectedFacts(facts);
            setFactsLoading(false);
          }
        });

      // Forces
      graph.d3Force('charge')?.strength(-180);
      graph.d3Force('link')?.distance(60);

      // Lighting
      const scene = graph.scene();
      scene.add(new THREE.AmbientLight(0x222233, 2));
      const dirLight = new THREE.DirectionalLight(0x6666aa, 1);
      dirLight.position.set(100, 200, 100);
      scene.add(dirLight);

      // Zoom to fit
      setTimeout(() => graph.zoomToFit(1000, 50), 2000);

      graphRef.current = graph;
    })();

    return () => {
      if (graphRef.current?._destructor) graphRef.current._destructor();
    };
  }, [loading, error, graphData, backgroundColor]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        graphRef.current.width(containerRef.current.clientWidth);
        graphRef.current.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter logic
  const applyFilters = useCallback(() => {
    const term = search.toLowerCase();
    const filteredNodes = fullData.nodes.filter(n => {
      if (!enabledTypes.has(n.type)) return false;
      if (term && !n.name.toLowerCase().includes(term) && !n.displayName.toLowerCase().includes(term)) return false;
      return true;
    });
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = fullData.links.filter(l => nodeIds.has(l.source as string) && nodeIds.has(l.target as string));
    setGraphData({ nodes: filteredNodes, links: filteredLinks });
  }, [fullData, search, enabledTypes]);

  useEffect(() => { applyFilters(); }, [search, enabledTypes, applyFilters]);

  // Update graph data when filters change
  useEffect(() => {
    if (graphRef.current && !loading) {
      graphRef.current.graphData({ nodes: [...graphData.nodes], links: [...graphData.links] });
    }
  }, [graphData]);

  const toggleType = (type: string) => {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const entityTypes = [...new Set(fullData.nodes.map(n => n.type))].sort();

  if (error) {
    return (
      <div className={`steno-graph-error ${className || ''}`} style={{ width, height, background: backgroundColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5555', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Failed to load graph</div>
          <div style={{ fontSize: 13, color: '#888' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`steno-graph ${className || ''}`} style={{ position: 'relative', width, height, background: backgroundColor, overflow: 'hidden' }}>
      {/* Loading */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ textAlign: 'center', color: '#888', fontFamily: 'system-ui' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #1a1a2e', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'steno-spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            Loading graph...
          </div>
        </div>
      )}

      {/* Graph container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Stats panel */}
      {showStats && !loading && (
        <div className="steno-graph-stats">
          <div className="steno-graph-panel-title">Memory Stats</div>
          <div className="steno-graph-stat"><span>Entities</span><strong>{fullData.nodes.length}</strong></div>
          <div className="steno-graph-stat"><span>Edges</span><strong>{fullData.links.length}</strong></div>
          <div className="steno-graph-stat"><span>Facts</span><strong>{totalFacts}</strong></div>
          <div className="steno-graph-stat steno-graph-stat-sep"><span>Visible</span><strong>{graphData.nodes.length}</strong></div>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && !loading && (
        <div className="steno-graph-filters">
          <div className="steno-graph-panel-title">Filters</div>
          <input
            type="text"
            placeholder="Search entities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="steno-graph-search"
          />
          <div className="steno-graph-section-title">Entity Types</div>
          {entityTypes.map(type => (
            <label key={type} className="steno-graph-filter-item">
              <input
                type="checkbox"
                checked={enabledTypes.has(type)}
                onChange={() => toggleType(type)}
              />
              <span className="steno-graph-dot" style={{ background: TYPE_COLORS[type] || DEFAULT_COLOR }} />
              {type} ({fullData.nodes.filter(n => n.type === type).length})
            </label>
          ))}
        </div>
      )}

      {/* Fact panel */}
      {showFactPanel && selectedNode && (
        <div className={`steno-graph-fact-panel ${selectedNode ? 'open' : ''}`}>
          <button className="steno-graph-close" onClick={() => setSelectedNode(null)}>&times;</button>
          <h3>{selectedNode.displayName || selectedNode.name}</h3>
          <div className="steno-graph-entity-type">{selectedNode.type}</div>

          <div className="steno-graph-section-title">Facts ({selectedFacts.length})</div>
          {factsLoading ? (
            <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>
          ) : selectedFacts.length === 0 ? (
            <div style={{ color: '#666', fontSize: 12 }}>No facts found</div>
          ) : (
            selectedFacts.map((f, i) => (
              <div key={i} className="steno-graph-fact">
                {f.content}
                <div className="steno-graph-fact-score">importance: {parseFloat(String(f.importance || 0)).toFixed(2)}</div>
              </div>
            ))
          )}

          <div className="steno-graph-section-title">Relationships</div>
          {fullData.links
            .filter(l => {
              const sid = typeof l.source === 'object' ? (l.source as any).id : l.source;
              const tid = typeof l.target === 'object' ? (l.target as any).id : l.target;
              return sid === selectedNode.id || tid === selectedNode.id;
            })
            .map((e, i) => {
              const src = fullData.nodes.find(n => n.id === (typeof e.source === 'object' ? (e.source as any).id : e.source));
              const tgt = fullData.nodes.find(n => n.id === (typeof e.target === 'object' ? (e.target as any).id : e.target));
              return (
                <div key={i} className="steno-graph-edge">
                  {src?.displayName || '?'} <span className="steno-graph-arrow">&rarr;</span> <strong>{e.relation}</strong> <span className="steno-graph-arrow">&rarr;</span> {tgt?.displayName || '?'}
                </div>
              );
            })}
        </div>
      )}

      <style>{`
        @keyframes steno-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
