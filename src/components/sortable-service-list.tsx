"use client";

import { type ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReducedMotion } from "framer-motion";
import { GripVertical } from "lucide-react";
import type { Service } from "@/lib/types";
import { Button } from "./ui/button";

function SortableServiceRow({ service, disabled, children }: {
  service: Service;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: service.id, disabled });
  const reducedMotion = useReducedMotion();

  return <div
    ref={setNodeRef}
    className="admin-service-row"
    data-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition: reducedMotion ? "none" : transition }}
  >
    <Button
      ref={setActivatorNodeRef}
      type="button"
      variant="ghost"
      size="icon"
      className="service-drag-handle"
      disabled={disabled}
      {...attributes}
      {...listeners}
      aria-label={`调整 ${service.name} 的位置`}
      title="拖拽排序；或按空格选中、方向键移动、空格确认、Esc 取消"
    ><GripVertical /></Button>
    {children}
  </div>;
}

export function SortableServiceList({ services, disabled, onDraggingChange, onReorder, children }: {
  services: Service[];
  disabled: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onReorder: (services: Service[]) => void;
  children: (service: Service) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const name = (id: string | number) => services.find(service => service.id === id)?.name ?? "服务";

  return <DndContext
    id="service-order"
    sensors={sensors}
    collisionDetection={closestCenter}
    accessibility={{
      screenReaderInstructions: { draggable: "按空格选中服务，使用上下方向键调整位置，再按空格确认，按 Escape 取消。" },
      announcements: {
        onDragStart: ({ active }) => `已选中 ${name(active.id)}。`,
        onDragOver: ({ active, over }) => over ? `${name(active.id)} 移至第 ${services.findIndex(service => service.id === over.id) + 1} 位。` : "已移出列表。",
        onDragEnd: ({ active, over }) => over ? `${name(active.id)} 已放置到第 ${services.findIndex(service => service.id === over.id) + 1} 位。` : "已取消排序。",
        onDragCancel: () => "已取消排序。",
      },
    }}
    onDragStart={() => onDraggingChange(true)}
    onDragCancel={() => onDraggingChange(false)}
    onDragEnd={({ active, over }) => {
      onDraggingChange(false);
      if (disabled || !over || active.id === over.id) return;
      const from = services.findIndex(service => service.id === active.id);
      const to = services.findIndex(service => service.id === over.id);
      if (from !== -1 && to !== -1) onReorder(arrayMove(services, from, to));
    }}
  >
    <SortableContext items={services.map(service => service.id)} strategy={verticalListSortingStrategy}>
      {services.map(service => <SortableServiceRow key={service.id} service={service} disabled={disabled || services.length < 2}>
        {children(service)}
      </SortableServiceRow>)}
    </SortableContext>
  </DndContext>;
}
