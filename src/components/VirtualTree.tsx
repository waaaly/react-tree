import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getTreeRootNodes,
  getTreeChildren,
  moveTreeNode,
} from '../api/tree.js';
import { useExpandNodes } from '../hooks/useExpandNodes.js';
import { useSelectedNodes } from '../hooks/useSelectedNodes.js';
import { useCheckedNodes } from '../hooks/useCheckedNodes.js';
import { useDragNode } from '../hooks/useDragNode.js';
import { useSearchNodes } from '../hooks/useSearchNodes.js';
import { VisiableNode, NodeId, TreeNode } from './tree.js';
import type { SearchNode, SearchStrategy } from '../../shared/types.js';
import './VirtualTree.css';

interface VirtualTreeProps {
  itemHeight?: number;
  containerHeight?: number;
}

const VirtualTree: React.FC<VirtualTreeProps> = ({
  itemHeight = 32,
  containerHeight = 600,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [loading, setLoading] = useState(false);
  const [performance, setPerformance] = useState({ loadTime: 0, renderTime: 0 });
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Shift 范围选择的锚点
  const anchorNodeRef = useRef<string | number | null>(null);

  // 用 ref 延迟绑定 getNodeCache（useCheckedNodes 先于 useExpandNodes 调用）
  const getNodeCacheRef = useRef<(() => Map<NodeId, TreeNode & { children?: Array<NodeId> }>) | null>(null);

  // ==================== 搜索 Hook ====================

  const {
    keyword: searchKeyword,
    results: searchResults,
    totalCount: searchTotal,
    activeIndex,
    isSearching,
    strategy,
    mode: searchMode,
    isSearchMode,
    hasResults,
    hasMore,
    setKeyword: setSearchKeyword,
    triggerSearch,
    navigatePrev,
    navigateNext,
    setStrategy,
    setMode: setSearchMode,
    clearSearch,
  } = useSearchNodes({
    mode: 'realtime',
    debounceMs: 300,
    defaultStrategy: 'fuzzy',
    pageSize: 200,
  });

  // ==================== 勾选状态 ====================

  const {
    checkedIds,
    toggleCheck,
    isChecked,
    isIndeterminate,
    check,
  } = useCheckedNodes({
    getNodeCache: () => getNodeCacheRef.current?.() ?? new Map(),
  });

  // ==================== 展开状态 ====================

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
      if (isChecked(parentId)) {
        children.forEach(child => check(child.id));
      }
    },
  });

  getNodeCacheRef.current = getNodeCache;

  // ==================== 选中状态 ====================

  const {
    selectedIds,
    select,
    deselect,
    isSelected,
    clearSelection,
  } = useSelectedNodes({ getNodeCache });

  // ==================== 拖拽状态 ====================

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

  // ==================== 初始化 ====================

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
    console.log('init tree data');
    init();
  }, []);

  // ==================== 搜索结果自动展开父路径 ====================

  useEffect(() => {
    if (!isSearchMode || searchResults.length === 0) return;

    // 收集所有需要展开的父节点 ID
    const parentIds = new Set<NodeId>();
    searchResults.forEach(node => {
      node.parentPath?.forEach(ancestor => {
        if (ancestor.id !== node.id) {
          parentIds.add(ancestor.id);
        }
      });
    });

    // 逐个展开父路径节点
    parentIds.forEach(id => {
      if (!isExpanded(id)) {
        toggle(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, isSearchMode]);

  // ==================== 活跃搜索结果滚动到视图 ====================

  useEffect(() => {
    if (!isSearchMode || activeIndex < 0 || !containerRef.current) return;

    const targetY = activeIndex * itemHeight;
    const { scrollTop: st, clientHeight: ch } = containerRef.current;

    // 仅当目标不在可视区域内时才滚动
    if (targetY < st || targetY + itemHeight > st + ch) {
      containerRef.current.scrollTop = Math.max(0, targetY - ch / 2 + itemHeight / 2);
    }
  }, [activeIndex, isSearchMode, itemHeight]);

  // ==================== 虚拟滚动计算 ====================

  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const bufferSize = 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
  const endIndex = Math.min(
    isSearchMode ? searchResults.length : visibleNodes.length,
    startIndex + visibleCount + bufferSize * 2,
  );

  const displayNodes = isSearchMode ? searchResults : visibleNodes;
  const displayCount = displayNodes.length;

  const visibleSlice = displayNodes.slice(startIndex, endIndex);
  const totalHeight = displayCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  // ==================== 事件处理 ====================

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const start = Date.now();
    setScrollTop(e.currentTarget.scrollTop);
    const renderTime = Date.now() - start;
    setPerformance(prev => ({ ...prev, renderTime }));
  }, []);

  const handleToggleExpand = useCallback(async (node: VisiableNode | SearchNode) => {
    if (isSearchMode) return;
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

  const handleNodeClick = useCallback((nodeId: string | number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      select(nodeId, true);
      anchorNodeRef.current = nodeId;
    } else if (e.shiftKey && anchorNodeRef.current != null) {
      const flatIds = visibleNodes.map(n => n.id);
      const anchorIdx = flatIds.indexOf(anchorNodeRef.current);
      const currentIdx = flatIds.indexOf(nodeId);
      if (anchorIdx !== -1 && currentIdx !== -1) {
        const [from, to] = anchorIdx < currentIdx
          ? [anchorIdx, currentIdx]
          : [currentIdx, anchorIdx];
        clearSelection();
        for (let i = from; i <= to; i++) {
          select(flatIds[i], true);
        }
      }
    } else {
      if (isSelected(nodeId)) {
        deselect(nodeId);
        anchorNodeRef.current = null;
      } else {
        select(nodeId, false);
        anchorNodeRef.current = nodeId;
      }
    }
  }, [visibleNodes, select, deselect, isSelected, clearSelection]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      clearSelection();
      anchorNodeRef.current = null;
    }
  }, [clearSelection]);

  // ==================== 搜索输入处理 ====================

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKeyword(e.target.value);
  }, [setSearchKeyword]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchMode === 'manual') {
        triggerSearch();
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.key === 'ArrowUp') navigatePrev();
      else navigateNext();
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  }, [searchMode, triggerSearch, navigatePrev, navigateNext, clearSearch]);

  const handleClearSearch = useCallback(() => {
    clearSearch();
    searchInputRef.current?.focus();
  }, [clearSearch]);

  // ==================== 全局键盘快捷键 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // 不拦截输入框内的正常输入
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && isSearchMode) {
        clearSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchMode, clearSearch]);

  // ==================== 渲染 ====================

  if (isInitializing) {
    return (
      <div className="virtual-tree-container">
        <div className="loading-indicator">初始化中...</div>
      </div>
    );
  }

  return (
    <div className="virtual-tree-container">
      {/* ===== 搜索工具栏 ===== */}
      <div className="tree-toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder={searchMode === 'manual' ? '输入后按 Enter 搜索...' : '实时搜索节点...'}
            value={searchKeyword}
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            className="search-input"
          />
          {searchKeyword && (
            <button className="search-clear-btn" onClick={handleClearSearch} title="清空搜索 (Esc)">
              ✕
            </button>
          )}
        </div>

        <div className="search-controls">
          {/* 匹配策略下拉 */}
          <select
            className="strategy-select"
            value={strategy}
            onChange={e => setStrategy(e.target.value as SearchStrategy)}
            title="匹配策略"
          >
            <option value="fuzzy">模糊</option>
            <option value="exact">精确</option>
            <option value="regex">正则</option>
            <option value="pinyin">拼音</option>
          </select>

          {/* 搜索模式切换 */}
          <button
            className={`btn-text mode-toggle ${searchMode === 'manual' ? 'active' : ''}`}
            onClick={() => setSearchMode(searchMode === 'realtime' ? 'manual' : 'realtime')}
            title={searchMode === 'realtime' ? '实时搜索（输入即搜）' : '手动搜索（回车触发）'}
          >
            {searchMode === 'realtime' ? '⏱ 实时' : '↵ 手动'}
          </button>

          {/* 非搜索模式下的操作按钮 */}
          {!isSearchMode && (
            <>
              <button onClick={handleExpandAll} className="btn-text">展开全部</button>
              <button onClick={handleCollapseAll} className="btn-text">折叠全部</button>
            </>
          )}
        </div>
      </div>

      {/* ===== 搜索导航栏（有搜索结果时显示） ===== */}
      {isSearchMode && hasResults && !isSearching && (
        <div className="search-navbar">
          <span className="search-count">
            匹配 <strong>{activeIndex + 1}</strong> / {searchTotal} 个结果
            {hasMore && (
              <span className="search-hasmore">（已加载 {searchResults.length} 条，点击 ▼ 加载更多）</span>
            )}
          </span>
          <div className="search-nav-btns">
            <button className="btn-text" onClick={navigatePrev} title="上一个 (↑)">▲ 上一个</button>
            <button className="btn-text" onClick={navigateNext} title="下一个 (↓)">▼ 下一个</button>
          </div>
        </div>
      )}

      {/* ===== 加载状态 ===== */}
      {(loading || isSearching) && (
        <div className="loading-indicator">
          {isSearching ? '搜索中...' : '加载中...'}
        </div>
      )}

      {/* ===== 空结果状态 ===== */}
      {isSearchMode && !isSearching && !hasResults && (
        <div className="search-empty">
          <div className="search-empty-icon">🔍</div>
          <div className="search-empty-text">未找到匹配 &quot;{searchKeyword}&quot; 的节点</div>
          <div className="search-empty-hint">请尝试其他关键词或调整匹配策略</div>
        </div>
      )}

      {/* ===== 虚拟滚动树列表 ===== */}
      {(!isSearchMode || hasResults) && (
        <div
          ref={containerRef}
          className="tree-scroll-container"
          style={{ height: containerHeight }}
          onScroll={handleScroll}
          onClick={handleContainerClick}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleSlice.map((node) => {
                return (
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
                      paddingLeft: `${(node.level ?? 0) * 20 + 10}px`,
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
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== 性能信息 ===== */}
      <div className="performance-info">
        <span>加载: {performance.loadTime.toFixed(1)}ms</span>
        <span>渲染: {performance.renderTime.toFixed(2)}ms</span>
        <span>总数: {displayCount}</span>
        <span>选中: {selectedIds.size}</span>
        <span>勾选: {checkedIds.size}</span>
        {isSearchMode && <span className="search-badge">搜索模式</span>}
      </div>
    </div>
  );
};

// ==================== TreeNodeItem ====================

interface TreeNodeItemProps {
  node: VisiableNode | SearchNode;
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

/** 渲染带高亮的节点名称 */
function renderHighlightedName(name: string, matchRanges?: Array<{ start: number; end: number }>) {
  if (!matchRanges || matchRanges.length === 0) {
    return <span className="node-name">{name}</span>;
  }

  // 合并重叠区间
  const sorted = [...matchRanges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    if (merged.length === 0 || r.start > merged[merged.length - 1].end) {
      merged.push({ ...r });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    }
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  merged.forEach((r, i) => {
    if (r.start > lastEnd) {
      parts.push(<span key={`t-${i}`}>{name.slice(lastEnd, r.start)}</span>);
    }
    parts.push(
      <mark key={`h-${i}`} className="search-highlight">
        {name.slice(r.start, r.end)}
      </mark>
    );
    lastEnd = r.end;
  });
  if (lastEnd < name.length) {
    parts.push(<span key="t-end">{name.slice(lastEnd)}</span>);
  }

  return <span className="node-name">{parts}</span>;
}

/** 渲染父路径面包屑 */
function renderParentPath(parentPath?: Array<{ id: number | string; name: string }>) {
  if (!parentPath || parentPath.length <= 1) return null;

  return (
    <span className="search-parent-path" title={parentPath.map(p => p.name).join(' > ')}>
      {parentPath.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span className="path-sep"> › </span>}
          <span className="path-segment">{p.name}</span>
        </span>
      ))}
    </span>
  );
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
  const level = node.level ?? 0;

  const levelClass = `tree-level-${Math.min(level, 5)}`;
  const checkClass = isIndeterminate ? 'indeterminate' : isChecked ? 'checked' : '';

  const dragOverClass = isDragOver && !isDropDisabled && dropPosition
    ? `drag-over-${dropPosition}`
    : '';
  const dragDisabledClass = isDropDisabled ? 'drop-disabled' : '';

  // 搜索节点额外信息
  const searchNode = node as SearchNode;
  const isActive = isSearchMode && searchNode.active;
  const matchRanges = isSearchMode ? searchNode.matchRanges : undefined;
  const parentPath = isSearchMode ? searchNode.parentPath : undefined;

  return (
    <div
      className={`tree-node ${isSelected ? 'selected' : ''} ${levelClass} ${isDragging ? 'dragging' : ''} ${dragOverClass} ${dragDisabledClass} ${isActive ? 'search-result-active' : ''}`}
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
      <span className="node-content">
        {renderHighlightedName(node.name, matchRanges)}
        {renderParentPath(parentPath)}
      </span>
      <span className="node-meta">ID: {node.id}</span>
    </div>
  );
};

export default VirtualTree;
