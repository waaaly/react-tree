import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getTreeRootNodes,
  getTreeChildren,
  searchTreeNodes,
  moveTreeNode,
} from '../api/tree.js';
import { useExpandNodes } from '../hooks/useExpandNodes.js';
import { useSelectedNodes } from '../hooks/useSelectedNodes.js';
import { useCheckedNodes } from '../hooks/useCheckedNodes.js';
import { useDragNode } from '../hooks/useDragNode.js';
import './VirtualTree.css';
import { VisiableNode,  NodeId, TreeNode } from './tree.js';

interface VirtualTreeProps {
  itemHeight?: number;
  containerHeight?: number;
}

const VirtualTree: React.FC<VirtualTreeProps> = ({
  itemHeight = 32,
  containerHeight = 600
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [performance, setPerformance] = useState({ loadTime: 0, renderTime: 0 });
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const loadStartTime = useRef<number>(0);
  const isSearchMode = searchKeyword.length > 0;

  // Shift 范围选择的锚点
  const anchorNodeRef = useRef<string | number | null>(null);

  // 搜索功能状态
  const [searchResults, setSearchResults] = useState<VisiableNode[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 用 ref 延迟绑定 getNodeCache（useCheckedNodes 先于 useExpandNodes 调用）
  const getNodeCacheRef = useRef<(() => Map<NodeId, TreeNode & { children?: Array<NodeId> }>) | null>(null);

  // 使用 useCheckedNodes Hook 管理勾选状态（需要在 useExpandNodes 之前调用，供 onChildrenLoaded 闭包使用）
  const {
    checkedIds,
    toggleCheck,
    isChecked,
    isIndeterminate,
    check,
  } = useCheckedNodes({
    getNodeCache: () => getNodeCacheRef.current?.() ?? new Map(),
  });

  // 使用 useExpandNodes Hook 管理展开状态
  const {
    visibleNodes,
    toggle,
    expandAll,
    collapseAll,
    isExpanded,
    getNodeCache,
    loadingNodes,
    refreshChildren,
  } = useExpandNodes({
    rootNodes,
    loadChildren: async (parentId) => {
      return await getTreeChildren(parentId, 1000, 0);
    },
    onChildrenLoaded: (parentId, children) => {
      // 父节点已勾选 → 新加载的子节点自动勾选
      if (isChecked(parentId)) {
        children.forEach(child => check(child.id));
      }
    },
  });

  // useExpandNodes 返回后，将真实的 getNodeCache 写入 ref
  getNodeCacheRef.current = getNodeCache;

  // 使用 useSelectedNodes Hook 管理选中状态
  const {
    selectedIds,
    select,
    deselect,
    isSelected,
    clearSelection,
  } = useSelectedNodes({
    getNodeCache,
  });

  // 使用 useDragNode Hook 管理拖拽排序与移动
  const {
    dragState,
    isDropAllowed,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  } = useDragNode({
    getNodeCache,
    onMove: async (nodeId, newParentId, insertIndex) => {
      await moveTreeNode(nodeId, newParentId, insertIndex);
    },
    onRefresh: async (parentId) => {
      if (parentId === 'root') {
        const roots = await getTreeRootNodes(1000, 0);
        setRootNodes(roots);
      } else {
        await refreshChildren(parentId);
      }
    },
  });

  // 初始化加载根节点
  useEffect(() => {
    const init = async () => {
      setIsInitializing(true);
      try {
        const roots = await getTreeRootNodes(1000, 0);
        setRootNodes(roots);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // 虚拟滚动计算
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const bufferSize = 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
  const endIndex = Math.min(
    isSearchMode ? searchResults.length : visibleNodes.length,
    startIndex + visibleCount + bufferSize * 2
  );

  const handleSearch = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const keyword = e.target.value;
    setSearchKeyword(keyword);

    if (keyword.length === 0) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    loadStartTime.current = Date.now();

    try {
      const results = await searchTreeNodes(keyword, 1000);
      const loadTime = Date.now() - loadStartTime.current;
      setSearchResults(results);
      setPerformance(prev => ({ ...prev, loadTime }));
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 当前显示的节点列表（搜索模式或正常模式）
  const displayNodes = isSearchMode ? searchResults : visibleNodes;
  const displayCount = displayNodes.length;

  const visibleSlice = displayNodes.slice(startIndex, endIndex);
  const totalHeight = displayCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const start = Date.now();
    setScrollTop(e.currentTarget.scrollTop);
    const renderTime = Date.now() - start;
    setPerformance(prev => ({ ...prev, renderTime }));
  }, []);

  const handleToggleExpand = useCallback(async (node: VisiableNode) => {
    if (isSearchMode) return; // 搜索模式下禁用展开/折叠
    await toggle(node.id);
  }, [toggle, isSearchMode]);

  const handleExpandAll = useCallback(async () => {
    setLoading(true);
    try {
      await expandAll();
    } finally {
      setLoading(false);
    }
  }, [expandAll]);

  const handleCollapseAll = useCallback(() => {
    collapseAll();
  }, [collapseAll]);

  /**
   * 节点点击处理（支持单选、Ctrl多选、Shift范围选择）
   */
  const handleNodeClick = useCallback((nodeId: string | number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd + 点击：不连续多选切换
      select(nodeId, true);
      anchorNodeRef.current = nodeId;
    } else if (e.shiftKey && anchorNodeRef.current != null) {
      // Shift + 点击：范围选择
      const flatIds = visibleNodes.map(n => n.id);
      const anchorIdx = flatIds.indexOf(anchorNodeRef.current);
      const currentIdx = flatIds.indexOf(nodeId);
      if (anchorIdx !== -1 && currentIdx !== -1) {
        const [from, to] = anchorIdx < currentIdx
          ? [anchorIdx, currentIdx]
          : [currentIdx, anchorIdx];
        // 清除旧选择，选中范围内的所有节点
        clearSelection();
        for (let i = from; i <= to; i++) {
          select(flatIds[i], true);
        }
      }
    } else {
      // 普通点击：如果已选中则取消，否则单选
      if (isSelected(nodeId)) {
        deselect(nodeId);
        anchorNodeRef.current = null;
      } else {
        select(nodeId, false);
        anchorNodeRef.current = nodeId;
      }
    }
  }, [visibleNodes, select, deselect, isSelected, clearSelection]);

  /**
   * 点击容器空白区域取消所有选中
   */
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // 只在点击到容器本身（而非子节点）时清空选择
    if (e.target === e.currentTarget) {
      clearSelection();
      anchorNodeRef.current = null;
    }
  }, [clearSelection]);

  if (isInitializing) {
    return (
      <div className="virtual-tree-container">
        <div className="loading-indicator">初始化中...</div>
      </div>
    );
  }

  return (
    <div className="virtual-tree-container">
      <div className="tree-toolbar">
        <input
          type="text"
          placeholder="搜索节点..."
          value={searchKeyword}
          onChange={handleSearch}
          className="search-input"
        />
        <div className="tree-actions">
          {!isSearchMode && (
            <>
              <button onClick={handleExpandAll} className="btn-text">
                全部展开
              </button>
              <button onClick={handleCollapseAll} className="btn-text">
                全部折叠
              </button>
            </>
          )}
        </div>
        <div className="performance-info">
          <span>加载: {performance.loadTime.toFixed(1)}ms</span>
          <span>渲染: {performance.renderTime.toFixed(2)}ms</span>
          <span>总数: {displayCount}</span>
          <span>选中: {selectedIds.size}</span>
          <span>勾选: {checkedIds.size}</span>
          {isSearchMode && <span className="search-badge">搜索模式</span>}
        </div>
      </div>

      {(loading || isSearching) && (
        <div className="loading-indicator">
          {isSearching ? '搜索中...' : '加载中...'}
        </div>
      )}

      <div
        ref={containerRef}
        className="tree-scroll-container"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
        onClick={handleContainerClick}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleSlice.map((node) => (
              <TreeNodeItem
                key={node.id}
                node={node}
                isExpanded={isExpanded(node.id)}
                isLoading={loadingNodes.has(node.id)}
                isSelected={isSelected(node.id)}
                isChecked={isChecked(node.id)}
                isIndeterminate={isIndeterminate(node.id)}
                isSearchMode={isSearchMode}
                isDragging={dragState.draggingId === node.id}
                isDragOver={dragState.overId === node.id}
                dropPosition={dragState.overId === node.id ? dragState.dropPosition : null}
                isDropDisabled={dragState.overId === node.id && !isDropAllowed(node.id)}
                style={{
                  height: itemHeight,
                  paddingLeft: `${node.level * 20 + 10}px`
                }}
                onToggle={() => handleToggleExpand(node)}
                onClick={(e) => handleNodeClick(node.id, e)}
                onCheckToggle={(nodeId) => toggleCheck(nodeId)}
                onDragStart={(e) => onDragStart(node.id, e)}
                onDragOver={(e) => onDragOver(node.id, e)}
                onDragLeave={onDragLeave}
                onDrop={() => onDrop(node.id)}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface TreeNodeItemProps {
  node: VisiableNode;
  isExpanded: boolean;
  isLoading: boolean;
  isSelected: boolean;
  isChecked: boolean;
  isIndeterminate: boolean;
  isSearchMode: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  dropPosition: 'before' | 'after' | 'inside' | null;
  isDropDisabled: boolean;
  style: React.CSSProperties;
  onToggle: () => void;
  onClick: (e: React.MouseEvent) => void;
  onCheckToggle: (nodeId: string | number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  isExpanded,
  isLoading,
  isSelected,
  isChecked,
  isIndeterminate,
  isSearchMode,
  isDragging,
  isDragOver,
  dropPosition,
  isDropDisabled,
  style,
  onToggle,
  onClick,
  onCheckToggle,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const showExpandIcon = !isSearchMode && node.hasChildren;

  const levelClass = `tree-level-${Math.min(node.level, 5)}`;
  const checkClass = isIndeterminate ? 'indeterminate' : isChecked ? 'checked' : '';

  // 拖拽视觉样式
  const dragOverClass = isDragOver && !isDropDisabled && dropPosition
    ? `drag-over-${dropPosition}`
    : '';
  const dragDisabledClass = isDropDisabled ? 'drop-disabled' : '';

  return (
    <div
      className={`tree-node ${isSelected ? 'selected' : ''} ${levelClass} ${isDragging ? 'dragging' : ''} ${dragOverClass} ${dragDisabledClass}`}
      style={style}
      draggable={!isSearchMode}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span
        className={`expand-icon ${showExpandIcon ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''} ${isLoading ? 'loading' : ''}`}
        onClick={e => {
          e.stopPropagation();
          if (showExpandIcon && !isLoading) onToggle();
        }}
      >
        {isLoading ? '⏳' : showExpandIcon ? (isExpanded ? '▼' : '▶') : ''}
      </span>
      <span
        className={`node-checkbox ${checkClass}`}
        onClick={e => {
          e.stopPropagation();
          onCheckToggle(node.id);
        }}
      >
        {isIndeterminate ? '-' : isChecked ? '✓' : ''}
      </span>
      <span className="node-name">{node.name}</span>
      <span className="node-meta">ID: {node.id}</span>
    </div>
  );
};

export default VirtualTree;
