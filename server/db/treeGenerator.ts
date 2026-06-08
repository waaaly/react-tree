import { insertNodesBatch, SQLiteTreeNode } from './sqlite.js';

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
 * 生成大型树形数据（森林）
 */
export function generateLargeTree(options: GenerateOptions): number {
  const { roots, maxDepth, childrenPerNode } = options;
  let currentId = 0;

  const batch: Omit<SQLiteTreeNode, 'id'>[] = [];
  const batchSize = 1000;

  function flushBatch() {
    if (batch.length > 0) {
      insertNodesBatch(batch);
      batch.length = 0;
    }
  }

  // 先生成根节点
  for (let r = 1; r <= roots; r++) {
    currentId++;
    const rootName = `Root-${r}`;
    batch.push({
      parentId: null,
      name: rootName,
      level: 1,
      path: rootName,
      hasChildren: maxDepth > 1,
      isLeaf: maxDepth <= 1,
      sortOrder: r,
    });
    if (batch.length >= batchSize) flushBatch();
  }

  // 为每个根节点生成子树
  let rootNodeId = 0;
  for (let r = 1; r <= roots; r++) {
    rootNodeId++;
    generateSubtree(rootNodeId, 2, String(rootNodeId));
  }

  flushBatch();

  console.log(`Generated ${currentId} tree nodes (roots: ${roots}, depth: ${maxDepth}, branching: ${childrenPerNode})`);
  return currentId;

  function generateSubtree(parentId: number, currentDepth: number, parentPath: string): void {
    if (currentDepth > maxDepth) return;
    const isLeaf = currentDepth === maxDepth;

    for (let i = 1; i <= childrenPerNode; i++) {
      currentId++;
      const nodeName = `Node-${parentId}-${i}`;
      const currentPath = `${parentPath}/${i}`;

      batch.push({
        parentId,
        name: nodeName,
        level: currentDepth,
        path: currentPath,
        hasChildren: !isLeaf,
        isLeaf,
        sortOrder: i,
      });

      if (batch.length >= batchSize) flushBatch();
      if (!isLeaf) {
        generateSubtree(currentId, currentDepth + 1, currentPath);
      }
    }
  }
}

/**
 * 生成平衡树
 */
export function generateBalancedTree(depth: number, branchingFactor: number): number {
  let totalNodes = 0;
  const batch: Omit<SQLiteTreeNode, 'id'>[] = [];
  const batchSize = 1000;

  function flushBatch() {
    if (batch.length > 0) {
      insertNodesBatch(batch);
      batch.length = 0;
    }
  }

  function createLevel(parentId: number | null, currentDepth: number, parentPath: string): void {
    if (currentDepth > depth) return;

    for (let i = 0; i < branchingFactor; i++) {
      totalNodes++;
      const nodeName = `Level-${currentDepth}-Node-${i + 1}`;
      const currentPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
      const isLeaf = currentDepth >= depth;

      batch.push({
        parentId,
        name: nodeName,
        level: currentDepth - 1,
        path: currentPath,
        hasChildren: !isLeaf,
        isLeaf,
        sortOrder: i,
      });

      const newParentId = totalNodes;
      createLevel(newParentId, currentDepth + 1, currentPath);

      if (batch.length >= batchSize) {
        flushBatch();
      }
    }
  }

  createLevel(null, 1, '');
  flushBatch();

  return totalNodes;
}
