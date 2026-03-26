# @steno-ai/graph

3D knowledge graph visualizer for Steno. React + Three.js component that renders entities and relationships in an interactive force-directed graph.

## Install

```bash
npm install @steno-ai/graph
```

## Usage

```tsx
import { MemoryGraph, fetchGraphData } from '@steno-ai/graph';
import '@steno-ai/graph/styles.css';

const data = await fetchGraphData(apiUrl, userId);

<MemoryGraph
  data={data}
  onNodeClick={(node) => console.log(node)}
/>
```

## Exports

| Export | Description |
|--------|-------------|
| `MemoryGraph` | React component for 3D graph rendering |
| `fetchGraphData` | Fetch graph data from Steno API |
| `fetchFactsForEntity` | Fetch facts linked to an entity |
| `TYPE_COLORS` | Color map for entity types |

## Part of [Steno](https://github.com/SankrityaT/steno-ai)

The memory layer for AI agents.
