import { useState, useCallback } from 'react';
import {
  NodeId,
  TreeNode,
  selectNode,
  getSelectedNodes,
  clearSelection,
} from '../components/tree.js';

/**
 * useSelectedNodes Hook 配置选项
 */
export interface UseSelectedNodesOptions {
  /** 默认选中的节点ID列表 */
  defaultSelected?: NodeId[];
  /** 获取节点缓存的函数（用于 getSelectedNodes 提取完整节点对象） */
  getNodeCache?: () => Map<NodeId, TreeNode & { children?: NodeId[] }>;
}

/**
 * useSelectedNodes Hook 返回值
 */
export interface UseSelectedNodesReturn {
  /** 当前选中的节点ID集合 */
  selectedIds: Set<NodeId>;
  /** 选中/切换节点
   *  @param multiSelect - 是否多选模式（如 Ctrl+点击），默认 false（单选）
   */
  select: (nodeId: NodeId, multiSelect?: boolean) => void;
  /** 取消选中指定节点 */
  deselect: (nodeId: NodeId) => void;
  /** 判断节点是否已选中 */
  isSelected: (nodeId: NodeId) => boolean;
  /** 清空所有选中 */
  clearSelection: () => void;
  /** 获取选中的完整节点对象列表 */
  getSelectedNodeList: () => TreeNode[];
}

/**
 * 节点选中状态管理 Hook
 *
 * 纯前端状态，不涉及 API 调用。
 * 支持单选（默认点击）、多选（Ctrl + 点击）两种模式。
 *
 * @example
 * const { selectedIds, select, isSelected, clearSelection } = useSelectedNodes({
 *   getNodeCache: () => nodeCache,
 * });
 *
 * // 单选
 * select(nodeId);
 *
 * // 多选（Ctrl+点击）
 * select(nodeId, true);
 */
export function useSelectedNodes(
  options: UseSelectedNodesOptions = {}
): UseSelectedNodesReturn {
  const { defaultSelected = [], getNodeCache } = options;

  const [selectedIds, setSelectedIds] = useState<Set<NodeId>>(
    new Set(defaultSelected)
  );

  /**
   * 选中/切换节点
   *
   * - multiSelect = false（默认）：单选模式，替换为当前节点
   * - multiSelect = true：多选模式，切换当前节点
   *
   * 复用 tree.ts 的 selectNode() 纯函数逻辑
   */
  const select = useCallback((nodeId: NodeId, multiSelect: boolean = false) => {
    setSelectedIds(prev => selectNode(prev, nodeId, multiSelect));
  }, []);

  /**
   * 取消选中指定节点
   */
  const deselect = useCallback((nodeId: NodeId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  /**
   * 判断节点是否已选中
   */
  const isSelected = useCallback(
    (nodeId: NodeId): boolean => selectedIds.has(nodeId),
    [selectedIds]
  );

  /**
   * 清空所有选中
   */
  const clear = useCallback(() => {
    setSelectedIds(clearSelection());
  }, []);

  /**
   * 获取选中的完整节点对象列表
   * 需要传入 getNodeCache 才能从缓存中提取完整节点
   */
  const getSelectedNodeList = useCallback((): TreeNode[] => {
    if (!getNodeCache) return [];
    const cache = getNodeCache();
    // 将 Map 转为 NodeMap 格式供 tree.ts 工具函数使用
    const nodeMap: Record<NodeId, TreeNode> = {};
    cache.forEach((node, id) => {
      nodeMap[id] = node;
    });
    return getSelectedNodes(nodeMap, selectedIds);
  }, [getNodeCache, selectedIds]);

  return {
    selectedIds,
    select,
    deselect,
    isSelected,
    clearSelection: clear,
    getSelectedNodeList,
  };
}

export default useSelectedNodes;
