import { insertNode, initDatabase,  } from './sqlite.js';

export interface LocalGenerateOptions {
  maxDepth: number;
  childrenPerNode: number;
  totalNodes: number;
}

export async function generateLargeTree(options: LocalGenerateOptions): Promise<void> {
  await initDatabase();

  const { maxDepth, childrenPerNode, totalNodes } = options;
  let currentId = 1;

  const queue: { parentId: number | null; level: number; parentPath: string }[] = [
    { parentId: null, level: 0, parentPath: '' }
  ];

  while (currentId <= totalNodes && queue.length > 0) {
    const { parentId, level, parentPath } = queue.shift()!;

    if (level >= maxDepth) continue;

    const childrenCount = Math.min(
      childrenPerNode,
      totalNodes - currentId + 1
    );

    for (let i = 0; i < childrenCount; i++) {
      const nodeName = generateNodeName(parentId, level, i);
      const currentPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
      const isLeaf = level >= maxDepth - 1;

      await insertNode({
        parentId,
        name: nodeName,
        level,
        path: currentPath,
        hasChildren: !isLeaf,
        isLeaf,
        sortOrder: i,
      });

      const newNodeId = currentId;
      currentId++;

      if (level < maxDepth - 1 && currentId <= totalNodes) {
        queue.push({ parentId: newNodeId, level: level + 1, parentPath: currentPath });
      }
    }
  }

  console.log(`Generated ${currentId - 1} tree nodes`);
}

function generateNodeName(parentId: number | null, level: number, index: number): string {
  const prefixes = ['Root', 'Branch', 'Leaf', 'Node'];
  const prefix = prefixes[Math.min(level, prefixes.length - 1)];

  if (parentId === null) {
    return `${prefix}-${index + 1}`;
  }

  return `${prefix}-${parentId}-${index + 1}`;
}

export async function generateBalancedTree(depth: number, branchingFactor: number): Promise<number> {
  await initDatabase();

  let totalNodes = 0;

  async function createLevel(parentId: number | null, currentDepth: number, parentPath: string): Promise<void> {
    if (currentDepth > depth) return;

    for (let i = 0; i < branchingFactor; i++) {
      totalNodes++;
      const nodeName = `Level-${currentDepth}-Node-${i + 1}`;
      const currentPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
      const isLeaf = currentDepth >= depth;

      await insertNode({
        parentId,
        name: nodeName,
        level: currentDepth - 1,
        path: currentPath,
        hasChildren: !isLeaf,
        isLeaf,
        sortOrder: i,
      });

      const newParentId = totalNodes;
      await createLevel(newParentId, currentDepth + 1, currentPath);
    }
  }

  await createLevel(null, 1, '');
  return totalNodes;
}

export async function generateTreeWithMetadata(options: LocalGenerateOptions): Promise<void> {
  await initDatabase();

  const { maxDepth, childrenPerNode, totalNodes } = options;
  let currentId = 1;

  const queue: { parentId: number | null; level: number; parentPath: string }[] = [
    { parentId: null, level: 0, parentPath: '' }
  ];

  while (currentId <= totalNodes && queue.length > 0) {
    const { parentId, level, parentPath } = queue.shift()!;

    if (level >= maxDepth) continue;

    const childrenCount = Math.min(
      childrenPerNode,
      totalNodes - currentId + 1
    );

    for (let i = 0; i < childrenCount; i++) {
      const nodeName = generateNodeName(parentId, level, i);
      const currentPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
      const isLeaf = level >= maxDepth - 1;

      await insertNode({
        parentId,
        name: nodeName,
        level,
        path: currentPath,
        hasChildren: !isLeaf,
        isLeaf,
        sortOrder: i,
      });

      const newNodeId = currentId;
      currentId++;

      if (level < maxDepth - 1 && currentId <= totalNodes) {
        queue.push({ parentId: newNodeId, level: level + 1, parentPath: currentPath });
      }
    }
  }

  console.log(`Generated ${currentId - 1} tree nodes with metadata`);
}
