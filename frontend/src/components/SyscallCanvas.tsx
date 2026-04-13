import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  Controls,
} from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface SyscallEvent {
  type: string;
  name?: string;
  number?: number;
  args?: { name: string; type: string; raw_value: number; str_value?: string }[];
  ret?: number;
  is_exit?: boolean;
}

interface SyscallCanvasProps {
  events: SyscallEvent[];
}

// Node style presets
const NODE_STYLES = {
  process: {
    background: 'linear-gradient(135deg, #004821, #006833)',
    border: '1px solid #4dfe90',
    color: '#4dfe90',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '11px',
    fontWeight: 'bold',
    borderRadius: '8px',
    padding: '8px 14px',
    boxShadow: '0 0 20px rgba(77,254,144,0.2)',
    minWidth: '130px',
    textAlign: 'center' as const,
  },
  fd: {
    background: '#111',
    border: '1px solid #494847',
    color: '#adaaaa',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '10px',
    borderRadius: '6px',
    padding: '6px 12px',
    minWidth: '110px',
    textAlign: 'center' as const,
  },
  fdActive: {
    background: '#0d1f2d',
    border: '1px solid #7ce6ff',
    color: '#7ce6ff',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '10px',
    borderRadius: '6px',
    padding: '6px 12px',
    minWidth: '110px',
    textAlign: 'center' as const,
  },
  memory: {
    background: '#1a1200',
    border: '1px solid #f59e0b',
    color: '#f59e0b',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '10px',
    borderRadius: '6px',
    padding: '6px 12px',
    minWidth: '110px',
    textAlign: 'center' as const,
  },
};

export default function SyscallCanvas({ events }: SyscallCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    // Build lookup: syscall enter events indexed by sequence position
    // so we can match enter→exit pairs for openat
    const enterEvents: Map<string, SyscallEvent> = new Map();

    // Track open FDs: fdNum → filename
    const openFds: Map<number, string> = new Map();
    openFds.set(0, 'stdin');
    openFds.set(1, 'stdout');
    openFds.set(2, 'stderr');

    // Track memory events
    let mmapCount = 0;
    let brkCount = 0;

    // Edge deduplication counter — each new edge gets a unique suffix
    let edgeSeq = 0;

    const calculatedNodes: Node[] = [
      {
        id: 'proc',
        position: { x: 310, y: 60 },
        data: { label: '⚙ Active Process' },
        style: NODE_STYLES.process,
      },
      {
        id: 'fd-0',
        position: { x: 80, y: 220 },
        data: { label: 'FD 0 · stdin' },
        style: NODE_STYLES.fd,
      },
      {
        id: 'fd-1',
        position: { x: 310, y: 220 },
        data: { label: 'FD 1 · stdout' },
        style: NODE_STYLES.fd,
      },
      {
        id: 'fd-2',
        position: { x: 540, y: 220 },
        data: { label: 'FD 2 · stderr' },
        style: NODE_STYLES.fd,
      },
    ];

    const dynamicEdges: Edge[] = [];

    // First pass: build state from all events
    events.forEach((ev, i) => {
      if (!ev.name) return;

      const key = `${ev.name}-${i}`;

      if (!ev.is_exit) {
        enterEvents.set(key, ev);
      }

      // Track open/openat — when the exit returns a valid fd
      if ((ev.name === 'openat' || ev.name === 'open') && ev.is_exit && ev.ret !== undefined && ev.ret > 2) {
        const fd = ev.ret;
        if (!openFds.has(fd)) {
          // Find the matching enter event to get the filename
          let fname = `fd${fd}`;
          // Scan backwards for the matching enter
          for (let j = i - 1; j >= 0; j--) {
            const candidate = events[j];
            if (candidate.name === ev.name && !candidate.is_exit) {
              const pathArg = candidate.args?.find(a => a.name === 'pathname' || a.name === 'filename');
              if (pathArg?.str_value) {
                // Extract basename
                const parts = pathArg.str_value.split('/');
                fname = parts[parts.length - 1] || pathArg.str_value;
              }
              break;
            }
          }
          openFds.set(fd, fname);

          const col = Math.floor(fd / 3);
          const row = fd % 3;
          calculatedNodes.push({
            id: `fd-${fd}`,
            position: { x: 80 + row * 230, y: 380 + col * 120 },
            data: { label: `FD ${fd} · ${fname}` },
            style: NODE_STYLES.fdActive,
          });
        }
      }

      // Track mmap — add memory node
      if (ev.name === 'mmap' && !ev.is_exit) {
        mmapCount++;
        const mmapId = `mmap-${mmapCount}`;
        if (!calculatedNodes.find(n => n.id === mmapId)) {
          calculatedNodes.push({
            id: mmapId,
            position: { x: 620 + (mmapCount - 1) * 140, y: 60 },
            data: { label: `mmap #${mmapCount}` },
            style: NODE_STYLES.memory,
          });
        }
      }

      // Track brk — heap node
      if (ev.name === 'brk' && !ev.is_exit && brkCount === 0) {
        brkCount++;
        calculatedNodes.push({
          id: 'heap',
          position: { x: 0, y: 60 },
          data: { label: '◈ Heap (brk)' },
          style: NODE_STYLES.memory,
        });
      }
    });

    // Second pass: generate edges for the LAST few relevant events
    // (show the most recent data flow — last write/read/open)
    const recentEvents = events.slice(-20);

    recentEvents.forEach((ev) => {
      if (!ev.name || ev.is_exit) return;

      if (ev.name === 'write') {
        const fdArg = ev.args?.find(a => a.name === 'fd');
        const fd = fdArg?.raw_value ?? 1;
        const targetId = `fd-${fd}`;
        if (calculatedNodes.find(n => n.id === targetId)) {
          dynamicEdges.push({
            id: `write-${edgeSeq++}`,
            source: 'proc',
            target: targetId,
            animated: true,
            label: 'write',
            labelStyle: { fill: '#4dfe90', fontSize: 10, fontFamily: 'JetBrains Mono' },
            style: { stroke: '#4dfe90', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#4dfe90', width: 12, height: 12 },
          });
        }
      }

      if (ev.name === 'read') {
        const fdArg = ev.args?.find(a => a.name === 'fd');
        const fd = fdArg?.raw_value ?? 0;
        const sourceId = `fd-${fd}`;
        if (calculatedNodes.find(n => n.id === sourceId)) {
          dynamicEdges.push({
            id: `read-${edgeSeq++}`,
            source: sourceId,
            target: 'proc',
            animated: true,
            label: 'read',
            labelStyle: { fill: '#7ce6ff', fontSize: 10, fontFamily: 'JetBrains Mono' },
            style: { stroke: '#7ce6ff', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#7ce6ff', width: 12, height: 12 },
          });
        }
      }

      if (ev.name === 'mmap') {
        const latestMmap = `mmap-${mmapCount}`;
        if (calculatedNodes.find(n => n.id === latestMmap)) {
          dynamicEdges.push({
            id: `mmap-edge-${edgeSeq++}`,
            source: 'proc',
            target: latestMmap,
            animated: true,
            label: 'mmap',
            labelStyle: { fill: '#f59e0b', fontSize: 10, fontFamily: 'JetBrains Mono' },
            style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '4 2' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 12, height: 12 },
          });
        }
      }

      if (ev.name === 'brk' && calculatedNodes.find(n => n.id === 'heap')) {
        dynamicEdges.push({
          id: `brk-edge-${edgeSeq++}`,
          source: 'proc',
          target: 'heap',
          animated: true,
          label: 'brk',
          labelStyle: { fill: '#f59e0b', fontSize: 10, fontFamily: 'JetBrains Mono' },
          style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '4 2' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 12, height: 12 },
        });
      }
    });

    return { nodes: calculatedNodes, edges: dynamicEdges };
  }, [events]);

  return (
    <div className="w-full h-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={true}
          panOnScroll={false}
        >
          <Background
            color="#1a1a1a"
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
          />
          <Controls
            showInteractive={false}
            style={{
              background: '#111',
              border: '1px solid #262626',
              borderRadius: '6px',
            }}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
