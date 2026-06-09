/**
 * 树形组件统一类型定义
 * 供 src/ 和 server/ 共同引用
 * 
 * 修改此文件时请确保前后端兼容性
 */

// ==================== 基础 ID 类型 ====================

/** 节点ID类型，支持字符串或数字 */
export type NodeId = string | number;

/** 父节点ID类型，可以是节点ID或根节点标识"root" */
export type ParentId = NodeId | 'root';

// ==================== 树节点核心类型 ====================

/**
 * 树节点基础接口
 * @template T 元数据类型，用于存储额外的业务数据
 */
export interface TreeNode<T = any> {
  /** 节点唯一标识 */
  id: NodeId;
  /** 节点显示名称 */
  name: string;
  /** 是否有子节点（用于异步加载场景） */
  hasChildren: boolean;
  /** 父节点ID */
  parentId: ParentId;
  /** 节点层级（根节点为0） */
  level: number;
  /** 节点路径（用于唯一标识） */
  path: string;
  /** 是否为叶子节点 */
  isLeaf: boolean;
  /** 排序顺序 */
  sortOrder: number;

  /** 是否禁用 */
  disabled?: boolean;
  /** 是否勾选 */
  checked?: boolean;
  /** 是否展开 */
  expanded?: boolean;
  /** 是否选中 */
  selected?: boolean;
  /** 是否加载中 */
  loading?: boolean;

  /** 扩展元数据 */
  meta?: T;
}

/**
 * 可见节点接口，包含渲染所需的层级信息
 * 用于UI渲染时的扁平化列表
 */
export interface VisiableNode {
  /** 节点唯一标识 */
  id: NodeId;
  /** 节点显示名称 */
  name: string;
  /** 是否有子节点 */
  hasChildren: boolean;
  /** 父节点ID */
  parentId: ParentId;

  /** 节点层级（根节点为0） */
  level: number;
  /** 是否为叶子节点 */
  isLeaf: boolean;
  /** 排序顺序 */
  sortOrder: number;

  /** 是否禁用 */
  disabled?: boolean;
  /** 是否勾选 */
  checked?: boolean;
  /** 是否展开 */
  expanded?: boolean;
  /** 是否选中 */
  selected?: boolean;
  /** 是否加载中 */
  loading?: boolean;
}

/**
 * 嵌套树节点接口，包含子节点数组
 * 用于从嵌套JSON结构构建树
 */
export interface NestedTreeNode<T = any> extends TreeNode<T> {
  /** 子节点数组 */
  children?: NestedTreeNode<T>[];
}

// ==================== 映射表类型 ====================

/**
 * 节点映射表，以节点ID为键存储所有节点
 * 采用扁平化存储方式便于快速查找
 */
export type NodeMap<T = any> = Record<NodeId, TreeNode<T>>;

/**
 * 子节点映射表，以父节点ID为键存储其子节点ID列表
 * 用于维护树的层级关系
 */
export type ChildrenMap = Record<ParentId, NodeId[]>;

// ==================== 数据库类型 ====================

/**
 * SQLite 数据库行对应的节点类型
 * id 为 number（数据库自增主键），parentId 为 number | null
 */
export interface SQLiteTreeNode {
  id: number;
  parentId: number | null;
  name: string;
  level: number;
  path: string;
  hasChildren: boolean;
  sortOrder: number;
  isLeaf: boolean;
}

// ==================== 搜索相关类型 ====================

/** 搜索匹配模式 */
export type SearchMode = 'realtime' | 'manual';

/** 搜索匹配策略 */
export type SearchStrategy = 'exact' | 'fuzzy' | 'pinyin' | 'regex';

/** 搜索匹配的范围信息 */
export interface MatchRange {
  /** 匹配起始位置（字符索引） */
  start: number;
  /** 匹配结束位置（字符索引） */
  end: number;
}

/** 搜索结果节点 */
export interface SearchNode extends VisiableNode {
  /** 名称中的匹配范围列表（支持多处匹配） */
  matchRanges: MatchRange[];
  /** 从根到当前节点的父路径链（id → name） */
  parentPath: Array<{ id: NodeId; name: string }>;
  /** 是否为当前活跃（高亮聚焦）的搜索结果 */
  active: boolean;
}

/** 搜索 API 请求参数 */
export interface SearchOptions {
  keyword: string;
  strategy?: SearchStrategy;
  limit?: number;
  offset?: number;
  /** 限定搜索范围（子树根节点ID） */
  scopeNodeId?: NodeId;
}

/** 搜索 API 响应 */
export interface SearchResponse {
  items: SearchNode[];
  total: number;
  hasMore: boolean;
}

/** 搜索全局状态 */
export interface SearchState {
  keyword: string;
  mode: SearchMode;
  strategy: SearchStrategy;
  results: SearchNode[];
  totalCount: number;
  activeIndex: number;
  isSearching: boolean;
  scopeNodeId?: NodeId;
}

// ==================== 数据生成相关类型 ====================

/**
 * 生成树数据的配置选项（API 契约）
 */
export interface GenerateOptions {
  /** 根节点数量 */
  roots: number;
  /** 最大深度（根节点深度为 1） */
  maxDepth: number;
  /** 每个非叶子节点的分支因子 */
  childrenPerNode: number;
}
