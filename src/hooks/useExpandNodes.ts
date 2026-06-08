import { useState, useRef, useCallback, useMemo } from 'react';
import { NodeId, TreeNode, VisiableNode } from '../components/tree.js';

/**
 * useExpandNodes Hook 配置选项
 */
export interface UseExpandNodesOptions {
  /** 加载子节点的异步函数 */
  loadChildren: (parentId: NodeId) => Promise<TreeNode[]>;
  /** 初始根节点列表 */
  rootNodes: TreeNode[];
  /** 默认展开的节点ID列表 */
  defaultExpanded?: NodeId[];
  /** 子节点加载完成回调（用于外部 hook 注入级联逻辑，如自动勾选） */
  onChildrenLoaded?: (parentId: NodeId, children: TreeNode[]) => void;
}

/**
 * useExpandNodes Hook 返回值
 */
export interface UseExpandNodesReturn {
  /** 当前可见节点列表（扁平化，已计算层级） */
  visibleNodes: VisiableNode[];
  /** 已展开节点ID集合 */
  expandedNodes: Set<NodeId>;
  /** 获取节点缓存（供 useSelectedNodes / useCheckedNodes 使用） */
  getNodeCache: () => Map<NodeId, TreeNode & { children?: NodeId[] }>;
  /** 展开指定节点 */
  expand: (nodeId: NodeId) => Promise<void>;
  /** 折叠指定节点 */
  collapse: (nodeId: NodeId) => void;
  /** 切换展开/折叠状态 */
  toggle: (nodeId: NodeId) => Promise<void>;
  /** 展开所有节点（谨慎使用，大数据量时性能差） */
  expandAll: () => Promise<void>;
  /** 折叠所有节点 */
  collapseAll: () => void;
  /** 判断节点是否已展开 */
  isExpanded: (nodeId: NodeId) => boolean;
  /** 获取指定节点的已加载子节点 */
  getNodeChildren: (nodeId: NodeId) => TreeNode[];
  /** 重新加载指定节点的子节点 */
  refreshChildren: (nodeId: NodeId) => Promise<void>;
}

/**
 * 带展开状态的树节点 Hook
 * 管理树节点的展开/折叠状态，支持按需加载子节点
 */
export function useExpandNodes(options: UseExpandNodesOptions): UseExpandNodesReturn {
  const { loadChildren, rootNodes, defaultExpanded = [], onChildrenLoaded } = options;

  // 节点缓存：存储所有已加载的节点及其子节点ID列表
  const nodeCache = useRef<Map<NodeId, TreeNode & { children?: NodeId[] }>>(new Map());

  // 展开状态集合
  const [expandedNodes, setExpandedNodes] = useState<Set<NodeId>>(new Set(defaultExpanded));

  // 初始化根节点到缓存
  const initializeRootNodes = useCallback(() => {
    rootNodes.forEach(node => {
      if (!nodeCache.current.has(node.id)) {
        nodeCache.current.set(node.id, { ...node, children: undefined });
      }
    });
  }, [rootNodes]);

  // 构建可见节点列表
  const buildVisibleNodes = useCallback((): VisiableNode[] => {
    const result: VisiableNode[] = [];

    function traverse(nodeId: NodeId, level: number): void {
      const node = nodeCache.current.get(nodeId);
      if (!node) return;

      const isNodeExpanded = expandedNodes.has(nodeId);

      // 添加当前节点
      result.push({
        id: node.id,
        name: node.name,
        hasChildren: node.hasChildren,
        parentId: node.parentId,
        level,
        isLeaf: !node.hasChildren,
        sortOrder: (node as any).sortOrder ?? 0,
        expanded: isNodeExpanded,
      });

      // 如果已展开且有子节点，按 sortOrder 排序后递归遍历
      if (isNodeExpanded && node.children && node.children.length > 0) {
        const sortedChildren = [...node.children].sort((a, b) => {
          const nodeA = nodeCache.current.get(a);
          const nodeB = nodeCache.current.get(b);
          return ((nodeA as any)?.sortOrder ?? 0) - ((nodeB as any)?.sortOrder ?? 0);
        });
        sortedChildren.forEach(childId => {
          traverse(childId, level + 1);
        });
      }
    }

    // 从根节点开始遍历，按 sortOrder 排序
    const sortedRoots = [...rootNodes].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    sortedRoots.forEach(node => {
      traverse(node.id, 0);
    });

    return result;
  }, [rootNodes, expandedNodes]);

  // 可见节点列表（根据展开状态动态计算）
  const visibleNodes = useMemo(() => {
    initializeRootNodes();
    return buildVisibleNodes();
  }, [initializeRootNodes, buildVisibleNodes]);

  /**
   * 展开节点
   */
  const expand = useCallback(async (nodeId: NodeId): Promise<void> => {
    if (expandedNodes.has(nodeId)) return;

    const node = nodeCache.current.get(nodeId);
    if (!node) return;

    // 如果子节点未加载，先加载
    if (!node.children && node.hasChildren) {
      try {
        const children = await loadChildren(nodeId);
        // 缓存子节点，按 sortOrder 排序
        const sorted = [...children].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        sorted.forEach(child => {
          nodeCache.current.set(child.id, { ...child, children: undefined });
        });
        // 更新父节点的子节点ID列表（已排序）
        node.children = sorted.map(child => child.id);

        // 通知外部：子节点已加载（用于级联勾选等场景）
        if (onChildrenLoaded) {
          onChildrenLoaded(nodeId, sorted);
        }
      } catch (error) {
        console.error(`Failed to load children for node ${nodeId}:`, error);
        return;
      }
    }

    // 添加到展开集合
    setExpandedNodes(prev => new Set([...prev, nodeId]));
  }, [expandedNodes, loadChildren]);

  /**
   * 折叠节点
   */
  const collapse = useCallback((nodeId: NodeId): void => {
    if (!expandedNodes.has(nodeId)) return;

    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, [expandedNodes]);

  /**
   * 切换展开/折叠状态
   */
  const toggle = useCallback(async (nodeId: NodeId): Promise<void> => {
    if (expandedNodes.has(nodeId)) {
      collapse(nodeId);
    } else {
      await expand(nodeId);
    }
  }, [expandedNodes, expand, collapse]);

  /**
   * 展开所有节点（递归加载所有子节点）
   * 注意：大数据量时性能较差，谨慎使用
   */
  const expandAll = useCallback(async (): Promise<void> => {
    const toExpand: NodeId[] = [];

    async function traverseAndExpand(nodeId: NodeId): Promise<void> {
      const node = nodeCache.current.get(nodeId);
      if (!node) return;

      toExpand.push(nodeId);

      // 加载子节点
      if (node.hasChildren && !node.children) {
        try {
          const children = await loadChildren(nodeId);
          const sorted = [...children].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          sorted.forEach(child => {
            nodeCache.current.set(child.id, { ...child, children: undefined });
          });
          node.children = sorted.map(child => child.id);

          if (onChildrenLoaded) {
            onChildrenLoaded(nodeId, sorted);
          }
        } catch (error) {
          console.error(`Failed to load children for node ${nodeId}:`, error);
          return;
        }
      }

      // 递归展开子节点
      if (node.children) {
        for (const childId of node.children) {
          await traverseAndExpand(childId);
        }
      }
    }

    // 从根节点开始
    for (const node of rootNodes) {
      await traverseAndExpand(node.id);
    }

    setExpandedNodes(new Set(toExpand));
  }, [rootNodes, loadChildren]);

  /**
   * 折叠所有节点
   */
  const collapseAll = useCallback((): void => {
    setExpandedNodes(new Set());
  }, []);

  /**
   * 判断节点是否已展开
   */
  const isExpanded = useCallback((nodeId: NodeId): boolean => {
    return expandedNodes.has(nodeId);
  }, [expandedNodes]);

  /**
   * 获取指定节点的已加载子节点
   */
  const getNodeChildren = useCallback((nodeId: NodeId): TreeNode[] => {
    const node = nodeCache.current.get(nodeId);
    if (!node || !node.children) return [];

    return node.children
      .map(childId => nodeCache.current.get(childId))
      .filter((child): child is TreeNode => child !== undefined);
  }, []);

  /**
   * 重新加载指定节点的子节点
   */
  const refreshChildren = useCallback(async (nodeId: NodeId): Promise<void> => {
    const node = nodeCache.current.get(nodeId);
    if (!node) return;

    try {
      const children = await loadChildren(nodeId);
      // 清除旧的子节点缓存
      if (node.children) {
        node.children.forEach(childId => {
          nodeCache.current.delete(childId);
        });
      }
      // 缓存新的子节点
      children.forEach(child => {
        nodeCache.current.set(child.id, { ...child, children: undefined });
      });
      node.children = children.map(child => child.id);

      // 触发重新渲染
      setExpandedNodes(prev => new Set(prev));
    } catch (error) {
      console.error(`Failed to refresh children for node ${nodeId}:`, error);
    }
  }, [loadChildren]);

  return {
    visibleNodes,
    expandedNodes,
    getNodeCache: () => nodeCache.current,
    expand,
    collapse,
    toggle,
    expandAll,
    collapseAll,
    isExpanded,
    getNodeChildren,
    refreshChildren,
  };
}

export default useExpandNodes;
