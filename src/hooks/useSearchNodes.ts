import { useState, useRef, useCallback, useEffect } from 'react';
import type { SearchNode, SearchMode, SearchStrategy } from '../../shared/types.js';
import { searchTreeNodes } from '../api/tree.js';

// ==================== 类型定义 ====================

export interface UseSearchNodesOptions {
  /** 搜索模式：realtime（实时+防抖） | manual（手动回车触发），默认 realtime */
  mode?: SearchMode;
  /** 防抖延迟（毫秒），仅 realtime 模式生效，默认 300ms */
  debounceMs?: number;
  /** 默认匹配策略，默认 fuzzy */
  defaultStrategy?: SearchStrategy;
  /** 每页条数，默认 200 */
  pageSize?: number;
  /** 搜索关键词变更回调 */
  onKeywordChange?: (keyword: string) => void;
  /** 搜索结果变更回调 */
  onResultsChange?: (results: SearchNode[], total: number) => void;
}

export interface UseSearchNodesReturn {
  /** 当前搜索关键词 */
  keyword: string;
  /** 搜索结果列表（active 字段已维护） */
  results: SearchNode[];
  /** 匹配总数 */
  totalCount: number;
  /** 当前活跃（高亮聚焦）的结果索引，-1 表示无 */
  activeIndex: number;
  /** 是否正在搜索 */
  isSearching: boolean;
  /** 当前匹配策略 */
  strategy: SearchStrategy;
  /** 搜索模式 */
  mode: SearchMode;
  /** 是否处于搜索模式（有关键词且有结果或搜索中） */
  isSearchMode: boolean;
  /** 是否有匹配结果 */
  hasResults: boolean;
  /** 是否有更多结果可以加载 */
  hasMore: boolean;
  /** 设置关键词（realtime 模式下自动防抖触发搜索） */
  setKeyword: (value: string) => void;
  /** 手动触发搜索（manual 模式或强制立即搜索） */
  triggerSearch: () => void;
  /** 向上导航（自动翻页，循环到末尾则跳转首条） */
  navigatePrev: () => void;
  /** 向下导航（自动翻页，循环到首条则跳转末尾） */
  navigateNext: () => void;
  /** 跳转到指定索引（全局索引，自动翻页加载） */
  navigateTo: (index: number) => void;
  /** 切换匹配策略（重新触发搜索） */
  setStrategy: (s: SearchStrategy) => void;
  /** 切换搜索模式 */
  setMode: (m: SearchMode) => void;
  /** 清空搜索，恢复初始状态 */
  clearSearch: () => void;
}

// ==================== Hook 实现 ====================

export function useSearchNodes(options: UseSearchNodesOptions = {}): UseSearchNodesReturn {
  const {
    mode: initialMode = 'realtime',
    debounceMs = 300,
    defaultStrategy = 'fuzzy',
    pageSize = 200,
    onKeywordChange,
    onResultsChange,
  } = options;

  // —— 状态 ——
  const [keyword, setKeywordState] = useState('');
  /** 全部已加载的搜索结果（accumulated） */
  const [results, setResults] = useState<SearchNode[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [strategy, setStrategyState] = useState<SearchStrategy>(defaultStrategy);
  const [mode, setModeState] = useState<SearchMode>(initialMode);

  // —— refs ——
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** 缓存最近一次待搜索的关键词（避免闭包陈旧值） */
  const pendingKeywordRef = useRef<string>('');
  /** 标记组件是否已卸载 */
  const mountedRef = useRef(true);
  /** 已加载到哪个 offset 位置 */
  const loadedOffsetRef = useRef(0);
  /** 是否还有更多数据未加载 */
  const hasMoreRef = useRef(false);

  const isSearchMode = keyword.trim().length > 0;
  const hasResults = results.length > 0;
  const hasMore = hasMoreRef.current;

  // ==================== 核心搜索逻辑 ====================

  /**
   * 执行搜索并(setResults / append)
   * @param kw 关键词
   * @param strat 策略
   * @param offset 起始偏移（默认 0 = 新搜索；>0 = 追加翻页）
   */
  const doSearch = useCallback(async (
    kw: string,
    strat?: SearchStrategy,
    offset: number = 0,
  ) => {
    const s = strat ?? strategy;
    if (!kw) {
      setResults([]);
      setTotalCount(0);
      setActiveIndex(-1);
      return;
    }

    // 标识当前操作：是新搜索还是追加翻页
    const isAppend = offset > 0;

    setIsSearching(true);
    try {
      const response = await searchTreeNodes({
        keyword: kw,
        strategy: s,
        limit: pageSize,
        offset,
      });
      if (!mountedRef.current) return;

      loadedOffsetRef.current = offset;
      hasMoreRef.current = response.hasMore;

      if (isAppend) {
        // 追加模式：保留已有结果，offset 不变
        setResults(prev => {
          const combined = [...prev, ...response.items.map(item => ({ ...item, active: false }))];
          return combined;
        });
      } else {
        // 新搜索：替换全量
        const items = response.items.map((item, i) => ({
          ...item,
          active: i === 0,
        }));
        setResults(items);
        setTotalCount(response.total);
        setActiveIndex(items.length > 0 ? 0 : -1);
        onResultsChange?.(items, response.total);
      }
    } catch (error) {
      console.error('Search failed:', error);
      if (!mountedRef.current) return;
      if (!isAppend) {
        setResults([]);
        setTotalCount(0);
        setActiveIndex(-1);
      }
    } finally {
      if (mountedRef.current) {
        setIsSearching(false);
      }
    }
  }, [strategy, pageSize, onResultsChange]);

  /** 重置搜索状态（新搜索前调用） */
  const resetSearch = useCallback(() => {
    loadedOffsetRef.current = 0;
    hasMoreRef.current = false;
    setResults([]);
    setTotalCount(0);
    setActiveIndex(-1);
  }, []);

  // ==================== 公开方法 ====================

  const setKeyword = useCallback((value: string) => {
    setKeywordState(value);
    pendingKeywordRef.current = value.trim();
    onKeywordChange?.(value);

    if (!value.trim()) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      resetSearch();
      return;
    }

    if (mode === 'realtime') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        if (pendingKeywordRef.current) {
          resetSearch();
          doSearch(pendingKeywordRef.current);
        }
      }, debounceMs);
    }
  }, [mode, debounceMs, doSearch, resetSearch, onKeywordChange]);

  const triggerSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const kw = pendingKeywordRef.current || keyword.trim();
    resetSearch();
    doSearch(kw);
  }, [doSearch, resetSearch, keyword]);

  /**
   * 向上导航 —— 到顶时自动加载上一页
   * 路径内循环：到达第一条结果 → 回到最后一条（保持在同一结果集内）
   */
  const navigatePrev = useCallback(() => {
    if (results.length === 0) return;

    if (activeIndex <= 0) {
      // 到顶 → 循环到最后一条
      setResults(prev => prev.map((item, i) => ({
        ...item,
        active: i === prev.length - 1,
      })));
      setActiveIndex(results.length - 1);
    } else {
      setResults(prev => prev.map((item, i) => ({
        ...item,
        active: i === activeIndex - 1,
      })));
      setActiveIndex(activeIndex - 1);
    }
  }, [results, activeIndex]);

  /**
   * 向下导航 —— 到底时自动加载下一页
   * 路径内循环：到达最后一条结果 → 回到第一条
   */
  const navigateNext = useCallback(() => {
    if (results.length === 0) return;

    if (activeIndex >= results.length - 1) {
      // 已到末尾：如果有更多数据则加载下一页，否则回到第一条
      if (hasMoreRef.current && pendingKeywordRef.current) {
        const nextOffset = loadedOffsetRef.current + pageSize;
        doSearch(pendingKeywordRef.current, undefined, nextOffset).then(() => {
          if (!mountedRef.current) return;
          // 加载完成后聚焦到下一页第一条
          setResults(prev => {
            if (prev.length === 0) return prev;
            return prev.map((item, i) => ({
              ...item,
              active: i === loadedOffsetRef.current,
            }));
          });
          setActiveIndex(loadedOffsetRef.current);
        });
      } else {
        // 无更多数据，循环回第一条
        setResults(prev => prev.map((item, i) => ({
          ...item,
          active: i === 0,
        })));
        setActiveIndex(0);
      }
    } else {
      setResults(prev => prev.map((item, i) => ({
        ...item,
        active: i === activeIndex + 1,
      })));
      setActiveIndex(activeIndex + 1);
    }
  }, [results, activeIndex, pageSize, doSearch]);

  const navigateTo = useCallback((index: number) => {
    if (results.length === 0 || index < 0 || index >= totalCount) return;

    if (index >= results.length) {
      // 目标超出当前已加载范围，加载对应页
      const targetOffset = Math.floor(index / pageSize) * pageSize;
      const kw = pendingKeywordRef.current;
      if (kw) {
        doSearch(kw, undefined, targetOffset).then(() => {
          if (!mountedRef.current) return;
          const localIndex = index - targetOffset;
          setResults(prev => prev.map((item, i) => ({
            ...item,
            active: i === localIndex,
          })));
          setActiveIndex(index);
        });
      }
      return;
    }

    setResults(prev => prev.map((item, i) => ({
      ...item,
      active: i === index,
    })));
    setActiveIndex(index);
  }, [results.length, totalCount, pageSize, doSearch]);

  const setStrategy = useCallback((s: SearchStrategy) => {
    setStrategyState(s);
  }, []);

  const setMode = useCallback((m: SearchMode) => {
    setModeState(m);
  }, []);

  const clearSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setKeywordState('');
    resetSearch();
    setIsSearching(false);
    pendingKeywordRef.current = '';
  }, [resetSearch]);

  // ==================== 副作用 ====================

  // 策略变更时，如果有当前关键词则重新搜索
  useEffect(() => {
    if (pendingKeywordRef.current) {
      resetSearch();
      doSearch(pendingKeywordRef.current, strategy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);

  // 清理定时器 & 标记卸载
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    keyword,
    results,
    totalCount,
    activeIndex,
    isSearching,
    strategy,
    mode,
    isSearchMode,
    hasResults,
    hasMore,
    setKeyword,
    triggerSearch,
    navigatePrev,
    navigateNext,
    navigateTo,
    setStrategy,
    setMode,
    clearSearch,
  };
}

export default useSearchNodes;
