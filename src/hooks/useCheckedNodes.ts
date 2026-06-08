import { useState, useCallback } from 'react';
import {
  NodeId,
  TreeNode,
  ChildrenMap,
  checkNode,
} from '../components/tree.js';

/**
 * useCheckedNodes Hook 配置选项
 */
export interface UseCheckedNodesOptions {
  /** 获取节点缓存的函数（必须，用于级联操作） */
  getNodeCache: () => Map<NodeId, TreeNode & { children?: NodeId[] }>;
  /** 默认勾选的节点ID列表 */
  defaultChecked?: NodeId[];
  /** 是否级联（同时勾选/取消子节点 + 向上更新父节点状态），默认 true */
  cascade?: boolean;
}

/**
 * useCheckedNodes Hook 返回值
 */
export interface UseCheckedNodesReturn {
  /** 当前勾选的节点ID集合 */
  checkedIds: Set<NodeId>;
  /** 切换节点的勾选状态（级联） */
  toggleCheck: (nodeId: NodeId) => void;
  /** 勾选指定节点（级联） */
  check: (nodeId: NodeId) => void;
  /** 取消勾选指定节点（级联） */
  uncheck: (nodeId: NodeId) => void;
  /** 清空所有勾选 */
  clearCheck: () => void;
  /** 判断节点是否已勾选 */
  isChecked: (nodeId: NodeId) => boolean;
  /** 判断节点是否为半选状态（部分子节点勾选） */
  isIndeterminate: (nodeId: NodeId) => boolean;
  /** 获取勾选的完整节点对象列表 */
  getCheckedNodeList: () => TreeNode[];
}

/**
 * 节点勾选状态管理 Hook
 *
 * 纯前端状态，不涉及 API 调用。
 * 支持级联勾选：勾选/取消父节点时自动处理所有子节点；
 * 子节点变化时自动更新祖先节点的全选/半选/未选状态。
 *
 * 复用 tree.ts 的 checkNode() 纯函数逻辑。
 *
 * @example
 * const { checkedIds, toggleCheck, isChecked, isIndeterminate } = useCheckedNodes({
 *   getNodeCache: () => nodeCache,
 * });
 */
export function useCheckedNodes(
  options: UseCheckedNodesOptions
): UseCheckedNodesReturn {
  const { getNodeCache, defaultChecked = [], cascade = true } = options;

  const [checkedIds, setCheckedIds] = useState<Set<NodeId>>(
    new Set(defaultChecked)
  );

  /**
   * 从 nodeCache 动态构建 nodeMap（Record 格式供 tree.ts 使用）
   */
  const buildNodeMap = useCallback(() => {
    const map: Record<NodeId, TreeNode & { children?: NodeId[] }> = {};
    const cache = getNodeCache();
    cache.forEach((node, id) => {
      map[id] = node;
    });
    return map;
  }, [getNodeCache]);

  /**
   * 从 nodeCache 动态构建 childrenMap
   */
  const buildChildrenMap = useCallback(() => {
    const map: ChildrenMap = {};
    const cache = getNodeCache();
    cache.forEach((node, id) => {
      const pid = node.parentId;
      if (!map[pid]) {
        map[pid] = [];
      }
      map[pid].push(id);
    });
    return map;
  }, [getNodeCache]);

  /**
   * 切换节点的勾选状态
   *
   * cascade = true 时：
   *   1. 勾选当前 → 递归勾选所有子节点 → 向上更新祖先状态
   *   2. 取消当前 → 递归取消所有子节点 → 向上更新祖先状态
   */
  const toggleCheck = useCallback((nodeId: NodeId) => {
    if (cascade) {
      setCheckedIds(prev => {
        const nodeMap = buildNodeMap();
        const childrenMap = buildChildrenMap();
        return checkNode(nodeMap, childrenMap, prev, nodeId, true);
      });
    } else {
      setCheckedIds(prev => {
        const next = new Set(prev);
        next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
        return next;
      });
    }
  }, [cascade, buildNodeMap, buildChildrenMap]);

  /**
   * 勾选指定节点（级联）
   */
  const check = useCallback((nodeId: NodeId) => {
    if (checkedIds.has(nodeId)) return;

    if (cascade) {
      setCheckedIds(prev => {
        const nodeMap = buildNodeMap();
        const childrenMap = buildChildrenMap();
        // 先移除以触发勾选逻辑（checkNode 内部处理 has → delete, !has → add）
        const temp = new Set(prev);
        temp.delete(nodeId);
        return checkNode(nodeMap, childrenMap, temp, nodeId, true);
      });
    } else {
      setCheckedIds(prev => new Set([...prev, nodeId]));
    }
  }, [checkedIds, cascade, buildNodeMap, buildChildrenMap]);

  /**
   * 取消勾选指定节点（级联）
   */
  const uncheck = useCallback((nodeId: NodeId) => {
    if (!checkedIds.has(nodeId)) return;

    if (cascade) {
      setCheckedIds(prev => {
        const nodeMap = buildNodeMap();
        const childrenMap = buildChildrenMap();
        // checkNode 内部 .has(nodeId) → delete，触发级联取消
        return checkNode(nodeMap, childrenMap, prev, nodeId, true);
      });
    } else {
      setCheckedIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  }, [checkedIds, cascade, buildNodeMap, buildChildrenMap]);

  /**
   * 清空所有勾选
   */
  const clearCheck = useCallback(() => {
    setCheckedIds(new Set());
  }, []);

  /**
   * 判断节点是否已勾选
   */
  const isChecked = useCallback(
    (nodeId: NodeId): boolean => checkedIds.has(nodeId),
    [checkedIds]
  );

  /**
   * 判断节点是否为半选状态
   *
   * 半选 = 部分子节点勾选了，但非全部。
   * 有子节点 + 至少一个子节点勾选 + 不是全部子节点勾选 = 半选
   */
  const isIndeterminate = useCallback(
    (nodeId: NodeId): boolean => {
      const cache = getNodeCache();
      const node = cache.get(nodeId);
      if (!node?.children || node.children.length === 0) {
        return false;
      }

      const children = node.children;
      const someChecked = children.some(cid => checkedIds.has(cid));
      const allChecked = children.every(cid => checkedIds.has(cid));

      return someChecked && !allChecked;
    },
    [getNodeCache, checkedIds]
  );

  /**
   * 获取勾选的完整节点对象列表
   */
  const getCheckedNodeList = useCallback((): TreeNode[] => {
    const cache = getNodeCache();
    const result: TreeNode[] = [];
    checkedIds.forEach(id => {
      const node = cache.get(id);
      if (node) result.push(node);
    });
    return result;
  }, [getNodeCache, checkedIds]);

  return {
    checkedIds,
    toggleCheck,
    check,
    uncheck,
    clearCheck,
    isChecked,
    isIndeterminate,
    getCheckedNodeList,
  };
}

export default useCheckedNodes;
