/**
 * 树形数据服务层
 * 作为 UI 组件和数据库之间的中间层
 * 提供统一的数据操作接口
 */

import {
  initDatabase,
  getChildren as dbGetChildren,
  getVisibleNodes as dbGetVisibleNodes,
  searchNodes as dbSearchNodes,
  getNodeCount as dbGetNodeCount,
  clearAllData as dbClearAllData,
  SQLiteTreeNode,
} from './sqlite.js';

import {
  generateLargeTree,
  generateBalancedTree,
  LocalGenerateOptions,
} from './treeGenerator.js';

import {
  NodeId,
  ParentId,
  TreeNode,
  VisiableNode,
  NodeMap,
  ChildrenMap,
} from '../components/tree.js';
import type { SearchOptions, SearchResponse } from '../../shared/types.js';

// ==================== 初始化 ====================

let isInitialized = false;

export async function initTreeData(): Promise<void> {
  console.log('Initializing tree data...',isInitialized);
  if (!isInitialized) {
    await initDatabase();
    isInitialized = true;
  }
}

// ==================== 数据转换 ====================

/**
 * 将数据库节点转换为可见节点
 */
function toVisiableNode(dbNode: SQLiteTreeNode): VisiableNode {
  return {
    id: dbNode.id,
    name: dbNode.name,
    hasChildren: dbNode.hasChildren,
    parentId: dbNode.parentId ?? 'root',
    level: dbNode.level,
    isLeaf: dbNode.isLeaf,
    sortOrder: dbNode.sortOrder ?? 0,
  };
}

function toTreeNode(dbNode: SQLiteTreeNode): TreeNode {
  return {
    id: dbNode.id,
    name: dbNode.name,
    hasChildren: dbNode.hasChildren,
    parentId: dbNode.parentId ?? 'root',
    level: dbNode.level,
    path: dbNode.path,
    isLeaf: dbNode.isLeaf,
    sortOrder: dbNode.sortOrder ?? 0,
  };
}

// ==================== 查询操作 ====================

/**
 * 获取根节点列表
 */
export async function getTreeRootNodes(
  limit: number = 100,
  offset: number = 0
): Promise<TreeNode[]> {
  await initTreeData();
  const nodes = await dbGetChildren(null, limit, offset);
  return nodes.map(toTreeNode);
}

/**
 * 获取子节点列表
 */
export async function getTreeChildren(
  parentId: ParentId,
  limit: number = 100,
  offset: number = 0
): Promise<TreeNode[]> {
  await initTreeData();
  const dbParentId = parentId === 'root' ? null : (parentId as number);
  const nodes = await dbGetChildren(dbParentId, limit, offset);
  return nodes.map(toTreeNode);
}

/**
 * 获取可见节点列表（用于虚拟列表渲染）
 */
export async function getTreeVisibleNodes(
  limit: number = 100,
  offset: number = 0
): Promise<VisiableNode[]> {
  await initTreeData();
  const nodes = await dbGetVisibleNodes(limit, offset);
  return nodes.map(toVisiableNode);
}

/**
 * 搜索节点
 */
export async function searchTreeNodes(
  options: SearchOptions
): Promise<SearchResponse> {
  await initTreeData();
  return await dbSearchNodes(options);
}

/**
 * 获取节点总数
 */
export async function getTreeNodeCount(): Promise<number> {
  await initTreeData();
  return await dbGetNodeCount();
}

// ==================== 修改操作 ====================

/**
 * 展开/折叠节点（当前简化实现，直接返回）
 * 如需完整实现，需要添加 tree_state 表
 */
export async function toggleNodeExpand(nodeId: NodeId, expanded: boolean): Promise<void> {
  await initTreeData();
  // 简化实现：实际项目中应该操作 tree_state 表
  console.log(`Toggle node ${nodeId} expanded: ${expanded}`);
}

// ==================== 数据生成 ====================

/**
 * 生成测试数据
 */
export async function generateTreeData(options: LocalGenerateOptions): Promise<void> {
  await initTreeData();
  await generateLargeTree(options);
}

/**
 * 生成平衡树
 */
export async function generateBalancedTreeData(
  depth: number,
  branchingFactor: number
): Promise<number> {
  await initTreeData();
  return await generateBalancedTree(depth, branchingFactor);
}

/**
 * 清空所有数据
 */
export async function clearTreeData(): Promise<void> {
  await initTreeData();
  dbClearAllData();
}

// ==================== 批量操作 ====================

/**
 * 构建 NodeMap（用于内存中的树操作）
 */
export async function buildNodeMapFromDB(): Promise<NodeMap> {
  await initTreeData();
  const allNodes = await dbGetVisibleNodes(100000, 0);
  const nodeMap: NodeMap = {};

  for (const dbNode of allNodes) {
    nodeMap[dbNode.id] = toTreeNode(dbNode);
  }

  return nodeMap;
}

/**
 * 构建 ChildrenMap（用于内存中的树操作）
 */
export async function buildChildrenMapFromDB(): Promise<ChildrenMap> {
  await initTreeData();
  const allNodes = await dbGetVisibleNodes(100000, 0);
  const childrenMap: ChildrenMap = {};

  for (const dbNode of allNodes) {
    const parentId = dbNode.parentId ?? 'root';
    if (!childrenMap[parentId]) {
      childrenMap[parentId] = [];
    }
    childrenMap[parentId].push(dbNode.id);
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
  await initTreeData();
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
