import { useEffect, useRef, useCallback } from 'react';
import type { GraphNode, GraphLink } from '../lib/supabase';
import { TYPE_COLORS, EDGE_COLORS, DEFAULT_COLOR } from '../lib/supabase';

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null, event?: MouseEvent) => void;
}

export function ForceGraph({ nodes, links, onNodeClick, onNodeHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  const initGraph = useCallback(async () => {
    if (!containerRef.current || nodes.length === 0) return;

    const ForceGraph3D = (await import('3d-force-graph')).default;
    const THREE = await import('three');

    if (graphRef.current) {
      containerRef.current.innerHTML = '';
    }

    const graph = ForceGraph3D()(containerRef.current)
      .backgroundColor('#06060e')
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight)
      .graphData({ nodes: [...nodes], links: [...links] })
      // Nodes
      .nodeVal((n: any) => Math.max(1.5, Math.sqrt(n.factCount + 1) * 2))
      .nodeColor((n: any) => TYPE_COLORS[n.type] || DEFAULT_COLOR)
      .nodeOpacity(0.95)
      .nodeLabel('')
      .nodeThreeObject((node: any) => {
        const group = new THREE.Group();
        const size = Math.max(2.5, Math.sqrt(node.factCount + 1) * 2);
        const color = TYPE_COLORS[node.type] || DEFAULT_COLOR;

        // Outer glow
        const glowGeo = new THREE.SphereGeometry(size * 1.8, 12, 12);
        const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06 });
        group.add(new THREE.Mesh(glowGeo, glowMat));

        // Core sphere
        const geo = new THREE.SphereGeometry(size, 24, 24);
        const mat = new THREE.MeshPhongMaterial({
          color, emissive: color, emissiveIntensity: 0.5,
          transparent: true, opacity: 0.95, shininess: 100,
        });
        group.add(new THREE.Mesh(geo, mat));

        // Label
        if (node.factCount > 0 || node.name === 'user') {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          const text = node.displayName;
          const fontSize = 24;
          const scale = 2;
          ctx.font = `500 ${fontSize}px "Geist", "Inter", -apple-system, sans-serif`;
          const textWidth = ctx.measureText(text).width;
          const padX = 10, padY = 6;
          canvas.width = (textWidth + padX * 2) * scale;
          canvas.height = (fontSize + padY * 2) * scale;
          ctx.scale(scale, scale);

          // Text with subtle shadow
          ctx.font = `500 ${fontSize}px "Geist", "Inter", -apple-system, sans-serif`;
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, (textWidth + padX * 2) / 2, (fontSize + padY * 2) / 2);

          const texture = new THREE.CanvasTexture(canvas);
          texture.needsUpdate = true;
          const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.88, depthTest: false });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(canvas.width / 16, canvas.height / 16, 1);
          sprite.position.y = size + 3;
          sprite.renderOrder = 999;
          group.add(sprite);
        }

        return group;
      })
      // Edges
      .linkColor((l: any) => EDGE_COLORS[l.edgeType] || '#222233')
      .linkWidth((l: any) => Math.max(0.4, l.weight * 1))
      .linkOpacity(0.45)
      .linkCurvature(0.12)
      .linkDirectionalParticles(2)
      .linkDirectionalParticleWidth(1.5)
      .linkDirectionalParticleSpeed(0.005)
      .linkDirectionalParticleColor((l: any) => EDGE_COLORS[l.edgeType] || '#333')
      .linkLabel((l: any) => l.relation)
      // Interactions
      .onNodeHover((node: any) => onNodeHover(node || null))
      .onNodeClick((node: any) => onNodeClick(node));

    // Physics
    graph.d3Force('charge')?.strength(-150);
    graph.d3Force('link')?.distance(50);

    // Lighting
    const scene = graph.scene();
    scene.add(new THREE.AmbientLight(0x111122, 3));
    const dirLight = new THREE.DirectionalLight(0x8888cc, 0.8);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    setTimeout(() => graph.zoomToFit(1200, 60), 2500);
    graphRef.current = graph;
  }, [nodes, links, onNodeClick, onNodeHover]);

  useEffect(() => { initGraph(); }, [initGraph]);

  // Resize handler
  useEffect(() => {
    const resize = () => {
      if (graphRef.current && containerRef.current) {
        graphRef.current.width(containerRef.current.clientWidth);
        graphRef.current.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
