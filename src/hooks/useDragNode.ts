import { useState, useCallback } from 'react';
import { NodeId, ParentId, TreeNode } from '../components/tree.js';

/**
 * useDragNode Hook 配置选项
 */
export interface UseDragNodeOptions {
  /** 获取节点缓存的函数 */
  getNodeCache: () => Map<NodeId, TreeNode & { children?: NodeId[] }>;
  /** 移动节点回调（调用 API） */
  onMove: (nodeId: NodeId, newParentId: ParentId, insertIndex: number) => Promise<void>;
  /** 移动成功后刷新相关节点 */
  onRefresh?: (nodeId: ParentId) => Promise<void>;
  /** 是否启用拖拽，默认 true */
  enabled?: boolean;
}

/**
 * 拖拽状态
 */
export interface DragState {
  /** 正在被拖拽的节点 ID */
  draggingId: NodeId | null;
  /** 当前悬停的目标节点 ID */
  overId: NodeId | null;
  /** 相对目标节点的插入位置 */
  dropPosition: 'before' | 'after' | 'inside' | null;
}

/**
 * useDragNode Hook 返回值
 */
export interface UseDragNodeReturn {
  /** 当前拖拽状态 */
  dragState: DragState;
  /** 判断是否可以拖放到目标节点 */
  isDropAllowed: (targetId: NodeId) => boolean;
  /** 拖拽开始事件处理 */
  onDragStart: (nodeId: NodeId, e: React.DragEvent) => void;
  /** 拖拽悬停事件处理 */
  onDragOver: (nodeId: NodeId, e: React.DragEvent) => void;
  /** 拖拽离开事件处理 */
  onDragLeave: () => void;
  /** 放置事件处理 */
  onDrop: (targetId: NodeId) => Promise<void>;
  /** 拖拽结束事件处理 */
  onDragEnd: () => void;
}

/**
 * 树节点拖拽 Hook
 *
 * 基于 HTML5 Drag and Drop API 实现树节点拖拽排序与移动。
 * 前端做循环引用预判 + 后端做兜底校验。
 *
 * 与 VirtualTree 配合使用，在 TreeNodeItem 上绑定对应的事件处理函数。
 */
export function useDragNode(options: UseDragNodeOptions): UseDragNodeReturn {
  const { getNodeCache, onMove, onRefresh, enabled = true } = options;

  const [dragState, setDragState] = useState<DragState>({
    draggingId: null,
    overId: null,
    dropPosition: null,
  });

  /**
   * 判断 targetId 是否是 ancestorId 的后代节点
   * 在 nodeCache 中沿 children 关系向下遍历
   */
  const isDescendant = useCallback(
    (ancestorId: NodeId, targetId: NodeId): boolean => {
      const cache = getNodeCache();
      const visited = new Set<NodeId>();

      function dfs(id: NodeId): boolean {
        if (visited.has(id)) return false;
        visited.add(id);

        const node = cache.get(id);
        if (!node?.children) return false;

        for (const childId of node.children) {
          if (childId === targetId) return true;
          if (dfs(childId)) return true;
        }
        return false;
      }

      return dfs(ancestorId);
    },
    [getNodeCache]
  );

  /**
   * 判断是否允许放置到目标节点
   * - 不能拖到自己身上
   * - 不能拖到自己的后代节点上
   */
  const isDropAllowed = useCallback(
    (targetId: NodeId): boolean => {
      const { draggingId } = dragState;
      if (!draggingId) return false;
      if (targetId === draggingId) return false;
      if (isDescendant(draggingId, targetId)) return false;
      return true;
    },
    [dragState, isDescendant]
  );

  /**
   * 根据鼠标位置计算相对目标节点的插入位置
   */
  const calcDropPosition = useCallback(
    (
      draggingId: NodeId,
      targetId: NodeId,
      e: React.DragEvent
    ): 'before' | 'after' | 'inside' | null => {
      // 不能放到自身（闭包可能有 stale 问题，此处做二次兜底）
      if (targetId === draggingId) return null;

      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = y / rect.height;

      const cache = getNodeCache();
      const node = cache.get(targetId);

      if (ratio < 0.33) return 'before';
      if (ratio > 0.67) return 'after';

      // 中间区域：仅当目标有子节点（或允许有子节点）时才能放入内部
      if (node?.hasChildren) return 'inside';

      // 没有子节点则回退为 after
      return 'after';
    },
    [getNodeCache]
  );

  /**
   * 获取目标节点在兄弟节点中的索引
   */
  const getSiblingIndex = useCallback(
    (nodeId: NodeId): number => {
      const cache = getNodeCache();
      const node = cache.get(nodeId);
      if (!node) return -1;

      const parentId = node.parentId;

      // 收集同 parentId 的所有兄弟
      const siblings: { id: NodeId; sortOrder: number }[] = [];
      cache.forEach((n, id) => {
        if (n.parentId === parentId) {
          siblings.push({ id, sortOrder: (n as any).sortOrder ?? 0 });
        }
      });

      siblings.sort((a, b) => a.sortOrder - b.sortOrder);
      return siblings.findIndex(s => s.id === nodeId);
    },
    [getNodeCache]
  );

  /**
   * 拖拽开始
   */
  const onDragStart = useCallback(
    (nodeId: NodeId, e: React.DragEvent): void => {
      if (!enabled) return;

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(nodeId));

      setDragState({
        draggingId: nodeId,
        overId: null,
        dropPosition: null,
      });
    },
    [enabled]
  );

  /**
   * 拖拽悬停在目标节点上
   * 必须调用 e.preventDefault() 才能触发 drop 事件
   */
  const onDragOver = useCallback(
    (nodeId: NodeId, e: React.DragEvent): void => {
      if (!dragState.draggingId) return;

      e.preventDefault();
      e.stopPropagation();

      if (!isDropAllowed(nodeId)) {
        setDragState(prev => ({ ...prev, overId: nodeId, dropPosition: null }));
        return;
      }

      const position = calcDropPosition(dragState.draggingId!, nodeId, e);
      setDragState(prev => ({ ...prev, overId: nodeId, dropPosition: position }));
    },
    [dragState.draggingId, isDropAllowed, calcDropPosition]
  );

  /**
   * 拖拽离开目标节点
   */
  const onDragLeave = useCallback((): void => {
    setDragState(prev => ({ ...prev, overId: null, dropPosition: null }));
  }, []);

  /**
   * 放置节点
   */
  const onDrop = useCallback(
    async (targetId: NodeId): Promise<void> => {
      const { draggingId, dropPosition } = dragState;
      if (!draggingId || !dropPosition) return;

      const cache = getNodeCache();
      const targetNode = cache.get(targetId);
      if (!targetNode) return;

      let newParentId: ParentId;
      let insertIndex: number;

      if (dropPosition === 'inside') {
        // 放入目标内部 → 成为目标的子节点，追加到末尾
        newParentId = targetId;
        insertIndex = -1;
      } else {
        // before / after → 与目标同级
        newParentId = targetNode.parentId;
        const targetIndex = getSiblingIndex(targetId);
        insertIndex = dropPosition === 'before' ? targetIndex : targetIndex + 1;
      }

      // 先重置状态（避免移动过程中视觉残留）
      setDragState({ draggingId: null, overId: null, dropPosition: null });

      try {
        await onMove(draggingId, newParentId, insertIndex);
        // 刷新原父节点和新父节点的子节点
        if (onRefresh) {
          const draggedNode = cache.get(draggingId);
          if (draggedNode) {
            // 需要刷新的是原父节点（已在缓存中，但需要 re-render）
            await onRefresh(draggedNode.parentId);
          }
          if (newParentId !== draggedNode?.parentId) {
            await onRefresh(newParentId);
          }
        }
      } catch (error) {
        console.error('Failed to move node:', error);
      }
    },
    [dragState, getNodeCache, getSiblingIndex, onMove, onRefresh]
  );

  /**
   * 拖拽结束
   */
  const onDragEnd = useCallback((): void => {
    setDragState({ draggingId: null, overId: null, dropPosition: null });
  }, []);

  return {
    dragState,
    isDropAllowed,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  };
}

export default useDragNode;
