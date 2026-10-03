"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { FileText, RotateCcw } from "lucide-react";
import { networkDiagramCanvasStyle, networkDiagramSizing as sizes } from "@albatextus/ui";
import { Button } from "./ui/button";
import { serviceGraph, type NetworkNode, type Position } from "./service-network-data";
import "./service-network.css";

function subscribeLayout(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const getMobile = () => window.matchMedia("(max-width: 760px)").matches;
const getServerLayout = () => false;

function frameSize(node: NetworkNode) { return node.graphic === "files" ? sizes.group : sizes.node; }

function connectionPath(from: Position, to: Position, fromSize: number, toSize: number) {
  const dx = to[0] + toSize / 2 - from[0] - fromSize / 2;
  const dy = to[1] + toSize / 2 - from[1] - fromSize / 2;
  if (Math.abs(dy) > Math.abs(dx) * .65) {
    const x1 = from[0] + fromSize / 2, x2 = to[0] + toSize / 2;
    const y1 = from[1] + (dy >= 0 ? fromSize : 0), y2 = to[1] + (dy >= 0 ? 0 : toSize);
    return `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
  }
  const x1 = from[0] + (dx >= 0 ? fromSize : 0), x2 = to[0] + (dx >= 0 ? 0 : toSize);
  const y1 = from[1] + fromSize / 2, y2 = to[1] + toSize / 2;
  return `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;
}

type Drag = { id: string; pointerId: number; origin: Position; start: Position; client: Position; moved: boolean };
const graph = serviceGraph();

export function ServiceNetwork() {
  const mobile = useSyncExternalStore(subscribeLayout, getMobile, getServerLayout);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const { nodes, edges } = graph;
  const { width, height } = mobile ? graph.mobile : graph.desktop;
  const layout = `${mobile ? "mobile" : "desktop"}:`;
  const position = (node: NetworkNode) => positions[layout + node.id] ?? (mobile ? node.mobile : node.desktop);
  const active = dragging ?? hovered ?? selected;
  const related = new Set([active, ...edges.filter(edge => edge.from === active || edge.to === active).flatMap(edge => [edge.from, edge.to])]);

  const activeService = nodes.find(node => node.id === active)?.serviceId;
  if (activeService) nodes.filter(node => node.serviceId === activeService).forEach(node => related.add(node.id));

  function activate(node: NetworkNode) {
    setSelected(value => value === node.id ? null : node.id);
  }

  function canvasPoint(clientX: number, clientY: number): Position | null {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }

  function moveNode(id: string, point: Position) {
    // Keep single nodes and larger file groups reachable on narrow screens.
    const margin = mobile ? 38 : 64;
    const size = frameSize(nodes.find(node => node.id === id)!);
    setPositions(current => ({ ...current, [layout + id]: [
      Math.max(margin, Math.min(point[0], width - size - margin)),
      Math.max(12, Math.min(point[1], height - size - 24)),
    ] }));
  }

  function startDrag(event: PointerEvent<SVGGElement>, node: NetworkNode) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    const start = canvasPoint(event.clientX, event.clientY);
    if (!start) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    drag.current = { id: node.id, pointerId: event.pointerId, origin: position(node), start, client: [event.clientX, event.clientY], moved: false };
  }

  function moveDrag(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.client[0], event.clientY - current.client[1]) < 5) return;
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    current.moved = true;
    suppressClick.current = true;
    setDragging(current.id);
    moveNode(current.id, [current.origin[0] + point[0] - current.start[0], current.origin[1] + point[1] - current.start[1]]);
  }

  function endDrag(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.type === "pointercancel") {
      moveNode(current.id, current.origin);
      suppressClick.current = true;
    }
    drag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function moveWithKeyboard(event: KeyboardEvent<SVGGElement>, node: NetworkNode) {
    if (drag.current) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(node);
      return;
    }
    const direction: Record<string, Position> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault();
    const [x, y] = position(node), step = event.shiftKey ? 24 : 8;
    moveNode(node.id, [x + delta[0] * step, y + delta[1] * step]);
  }

  return <main className="service-network-page" aria-label="服务组成图" onKeyDown={event => {
    if (event.key !== "Escape") return;
    const current = drag.current;
    if (current) {
      moveNode(current.id, current.origin);
      drag.current = null;
      suppressClick.current = true;
      setDragging(null);
      const target = svg.current?.querySelector<SVGGElement>(`[data-node-id="${current.id}"]`);
      if (target?.hasPointerCapture(current.pointerId)) target.releasePointerCapture(current.pointerId);
    } else { setSelected(null); setHovered(null); }
  }}>
    <div className="service-network-viewport" data-network-diagram-viewport>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} fill="none" role="group"
        aria-label="全部服务与内部构件"
        className="service-network-canvas" data-network-diagram-canvas data-view="expanded" style={networkDiagramCanvasStyle(width)}>
        <g className="service-network-lines" aria-hidden="true">
          {edges.map(edge => {
            const from = nodes.find(node => node.id === edge.from)!;
            const to = nodes.find(node => node.id === edge.to)!;
            return <path key={`${edge.from}-${edge.to}`} d={connectionPath(position(from), position(to), frameSize(from), frameSize(to))}
              data-from={edge.from} data-to={edge.to} data-kind={edge.kind}
              data-active={active === edge.from || active === edge.to} data-dimmed={Boolean(active && (!related.has(edge.from) || !related.has(edge.to)))} />;
          })}
        </g>
        {nodes.map(node => {
          const [x, y] = position(node);
          const size = frameSize(node);
          return <g key={node.id} transform={`translate(${x} ${y})`}
            className="service-network-node" data-node-id={node.id} data-service-id={node.serviceId} data-tone={node.tone}
            data-dimmed={Boolean(active && !related.has(node.id))} data-selected={selected === node.id} data-dragging={dragging === node.id}
            role="button" tabIndex={0} aria-label={node.name} aria-pressed={selected === node.id}
            aria-describedby="service-network-instructions"
            onPointerDown={event => startDrag(event, node)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)}
            onClick={() => { if (!suppressClick.current) activate(node); }} onKeyDown={event => moveWithKeyboard(event, node)}>
            <rect width={size} height={size} className="network-frame" />
            {[[0, 0], [size, 0], [0, size], [size, size]].map(([hx, hy]) => <rect key={`${hx}-${hy}`} x={hx - sizes.handle / 2} y={hy - sizes.handle / 2} width={sizes.handle} height={sizes.handle} className="network-handle" />)}
            {node.graphic === "files" ? [[33, 9], [9, 57], [57, 53]].map(([tx, ty], index) => {
              const Icon = index === 0 ? node.icon : FileText;
              return <g key={`${tx}-${ty}`} aria-hidden="true">
                <rect x={tx} y={ty} width={sizes.tile} height={sizes.tile} rx={sizes.radius} className="network-tile" />
                <Icon x={tx + (sizes.tile - sizes.icon) / 2} y={ty + (sizes.tile - sizes.icon) / 2} width={sizes.icon} height={sizes.icon} strokeWidth={1.5} />
              </g>;
            }) : <>
              <rect x={sizes.inset} y={sizes.inset} width={sizes.tile} height={sizes.tile} rx={sizes.radius} className="network-tile" />
              <node.icon x={(sizes.node - sizes.icon) / 2} y={(sizes.node - sizes.icon) / 2} width={sizes.icon} height={sizes.icon} strokeWidth={1.5} aria-hidden="true" />
            </>}
            {/* An HTML hit area makes touch-action apply in browsers that ignore it on SVG groups. */}
            <foreignObject x="-8" y="-8" width={size + 16} height={size + 16} aria-hidden="true">
              <div className="service-network-hitarea" />
            </foreignObject>
          </g>;
        })}
      </svg>
      <div className="service-network-reset"><Button variant="ghost" size="icon" aria-label="重置节点位置" onClick={() => {
        setPositions(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(layout))));
        setSelected(null); setHovered(null);
      }}><RotateCcw /></Button></div>
    </div>
    <p id="service-network-instructions" className="sr-only">所有服务及内部构件已展开。点击节点高亮关联，Escape 清除选择。拖动节点或使用方向键移动，Shift 加方向键加速。重置按钮恢复全部节点的位置。</p>
    <ul className="sr-only" aria-label="节点连接">{edges.map(edge => <li key={`${edge.from}-${edge.to}`}>{nodes.find(node => node.id === edge.from)?.name} → {nodes.find(node => node.id === edge.to)?.name}</li>)}</ul>
  </main>;
}
