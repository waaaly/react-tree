/**
 * 树形数据服务层
 * 通过 API 调用后端服务
 * 提供统一的数据操作接口
 */

import {
  NodeId,
  ParentId,
  TreeNode,
  VisiableNode,
  NodeMap,
  ChildrenMap,
} from '../components/tree.js';

// API 基础路径
const API_BASE = '/api/tree';

// ==================== 数据转换 ====================

/**
 * 将 API 返回的节点转换为树节点
 */
function toTreeNode(apiNode: any): TreeNode {
  return {
    id: apiNode.id,
    name: apiNode.name,
    hasChildren: apiNode.hasChildren,
    parentId: apiNode.parentId ?? 'root',
    level: apiNode.level,
    isLeaf: apiNode.isLeaf,
    path: apiNode.path,
    sortOrder: apiNode.sortOrder ?? 0,
  };
}

/**
 * 将 API 返回的节点转换为可见节点
 */
function toVisiableNode(apiNode: any): VisiableNode {
  return {
    id: apiNode.id,
    name: apiNode.name,
    hasChildren: apiNode.hasChildren,
    parentId: apiNode.parentId ?? 'root',
    level: apiNode.level,
    isLeaf: apiNode.isLeaf,
    sortOrder: apiNode.sortOrder ?? 0,
  };
}

// ==================== 初始化 ====================

/**
 * 初始化树数据（后端自动初始化，此函数保留为兼容）
 */
export async function initTreeData(): Promise<void> {
  // 后端自动初始化，无需前端调用
  console.log('Tree data service initialized');
}

// ==================== 查询操作 ====================

/**
 * 获取根节点列表
 */
export async function getTreeRootNodes(
  limit: number = 100,
  offset: number = 0
): Promise<TreeNode[]> {
  const res = await fetch(`${API_BASE}/roots?limit=${limit}&offset=${offset}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.map(toTreeNode);
}

/**
 * 获取子节点列表
 */
export async function getTreeChildren(
  parentId: ParentId,
  limit: number = 100,
  offset: number = 0
): Promise<TreeNode[]> {
  const dbParentId = parentId === 'root' ? 0 : (parentId as number);
  const res = await fetch(
    `${API_BASE}/children/${dbParentId}?limit=${limit}&offset=${offset}`
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.map(toTreeNode);
}

/**
 * 获取可见节点列表（用于虚拟列表渲染）
 */
export async function getTreeVisibleNodes(
  limit: number = 100,
  offset: number = 0
): Promise<VisiableNode[]> {
  const res = await fetch(
    `${API_BASE}/visible?limit=${limit}&offset=${offset}`
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.map(toVisiableNode);
}

/**
 * 搜索节点
 */
export async function searchTreeNodes(
  keyword: string,
  limit: number = 50
): Promise<VisiableNode[]> {
  const res = await fetch(
    `${API_BASE}/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.map(toVisiableNode);
}

/**
 * 获取节点总数
 */
export async function getTreeNodeCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/count`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.count;
}

// ==================== 修改操作 ====================

/**
 * 展开/折叠节点（当前简化实现，直接返回）
 */
export async function toggleNodeExpand(nodeId: NodeId, expanded: boolean): Promise<void> {
  console.log(`Toggle node ${nodeId} expanded: ${expanded}`);
}

/**
 * 移动节点到新位置
 * @param nodeId - 被移动的节点 ID
 * @param newParentId - 新父节点 ID（'root' 表示根层级）
 * @param insertIndex - 在新兄弟中的插入位置（可选，-1 表示末尾）
 */
export async function moveTreeNode(
  nodeId: NodeId,
  newParentId: ParentId,
  insertIndex?: number
): Promise<void> {
  const res = await fetch(`${API_BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodeId,
      newParentId: newParentId === 'root' ? null : newParentId,
      insertIndex: insertIndex ?? -1,
    }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

// ==================== 数据生成 ====================

export interface GenerateOptions {
  /** 根节点数量 */
  roots: number;
  /** 最大深度（根节点深度为 1） */
  maxDepth: number;
  /** 每个非叶子节点的分支因子 */
  childrenPerNode: number;
}

/**
 * 根据 roots, depth, childrenPerNode 计算理论总节点数
 * 公式：nodes = roots × (c^d - 1) / (c - 1)
 */
export function computeTotalNodes(roots: number, maxDepth: number, childrenPerNode: number): number {
  if (childrenPerNode === 1) {
    return roots * maxDepth;
  }
  return Math.floor(roots * (Math.pow(childrenPerNode, maxDepth) - 1) / (childrenPerNode - 1));
}

/**
 * 生成测试数据
 */
export async function generateTreeData(options: GenerateOptions): Promise<number> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.nodeCount;
}

/**
 * 生成平衡树
 */
export async function generateBalancedTreeData(
  depth: number,
  branchingFactor: number
): Promise<number> {
  const res = await fetch(`${API_BASE}/generate-balanced`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ depth, branchingFactor }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data.nodeCount;
}

/**
 * 清空所有数据
 */
export async function clearTreeData(): Promise<void> {
  const res = await fetch(`${API_BASE}/clear`, {
    method: 'DELETE',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

// ==================== 批量操作 ====================

/**
 * 构建 NodeMap（用于内存中的树操作）
 */
export async function buildNodeMapFromDB(): Promise<NodeMap> {
  const allNodes = await getTreeVisibleNodes(100000, 0);
  const nodeMap: NodeMap = {};

  for (const node of allNodes) {
    nodeMap[node.id] = {
      id: node.id,
      name: node.name,
      hasChildren: node.hasChildren,
      parentId: node.parentId,
      level: node.level,
      path: '',
      isLeaf: node.isLeaf,
      sortOrder: node.sortOrder ?? 0,
    };
  }

  return nodeMap;
}

/**
 * 构建 ChildrenMap（用于内存中的树操作）
 */
export async function buildChildrenMapFromDB(): Promise<ChildrenMap> {
  const allNodes = await getTreeVisibleNodes(100000, 0);
  const childrenMap: ChildrenMap = {};

  for (const node of allNodes) {
    const parentId = node.parentId ?? 'root';
    if (!childrenMap[parentId]) {
      childrenMap[parentId] = [];
    }
    childrenMap[parentId].push(node.id);
  }

  return childrenMap;
}

/**
 * 获取完整的树结构
 */
export async function getFullTreeData(): Promise<{
  nodeMap: NodeMap;
  childrenMap: ChildrenMap;
  rootIds: NodeId[];
}> {
  const [nodeMap, childrenMap] = await Promise.all([
    buildNodeMapFromDB(),
    buildChildrenMapFromDB(),
  ]);

  return {
    nodeMap,
    childrenMap,
    rootIds: childrenMap['root'] || [],
  };
}
