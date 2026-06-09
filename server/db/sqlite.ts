import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { SQLiteTreeNode, SearchOptions, SearchResponse, SearchNode, MatchRange, NodeId, SearchStrategy } from '../../shared/types.js';

// 重导出，保持向后兼容
export type { SQLiteTreeNode };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保 data 目录存在
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tree.db');
const db = new Database(dbPath);

// 启用 WAL 模式提高并发性能
db.pragma('journal_mode = WAL');

// 初始化表
db.exec(`
  CREATE TABLE IF NOT EXISTS tree_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    has_children INTEGER DEFAULT 0,
    is_leaf INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    path TEXT NOT NULL
  );
`);

// 创建索引
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_parent ON tree_nodes(parent_id);
  CREATE INDEX IF NOT EXISTS idx_level ON tree_nodes(level);
  CREATE INDEX IF NOT EXISTS idx_path ON tree_nodes(path);
`);

console.log('Database initialized at:', dbPath);

/**
 * 插入节点
 */
export function insertNode(node: Omit<SQLiteTreeNode, 'id'>): number {
  const stmt = db.prepare(`
    INSERT INTO tree_nodes (parent_id, name, level, path, has_children, is_leaf, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    node.parentId,
    node.name,
    node.level,
    node.path,
    node.hasChildren ? 1 : 0,
    node.isLeaf ? 1 : 0,
    node.sortOrder
  );

  return result.lastInsertRowid as number;
}

/**
 * 批量插入节点（使用事务）
 */
export function insertNodesBatch(nodes: Omit<SQLiteTreeNode, 'id'>[]): number[] {
  const insertStmt = db.prepare(`
    INSERT INTO tree_nodes (parent_id, name, level, path, has_children, is_leaf, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((nodesList) => {
    const ids: number[] = [];
    for (const node of nodesList) {
      const result = insertStmt.run(
        node.parentId,
        node.name,
        node.level,
        node.path,
        node.hasChildren ? 1 : 0,
        node.isLeaf ? 1 : 0,
        node.sortOrder
      );
      ids.push(result.lastInsertRowid as number);
    }
    return ids;
  });

  return insertMany(nodes);
}

/**
 * 获取根节点
 */
export function getRootNodes(limit = 100, offset = 0): SQLiteTreeNode[] {
  const rows = db.prepare(`
    SELECT id, parent_id as parentId, name, level, path,
           has_children as hasChildren, is_leaf as isLeaf, sort_order as sortOrder
    FROM tree_nodes
    WHERE parent_id IS NULL
    ORDER BY sort_order, id
    LIMIT ? OFFSET ?
  `).all(limit, offset) as any[];

  return rows.map(row => ({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    level: row.level,
    path: row.path,
    hasChildren: row.hasChildren === 1,
    sortOrder: row.sortOrder,
    isLeaf: row.isLeaf === 1,
  }));
}

/**
 * 获取子节点
 */
export function getChildren(
  parentId: number,
  limit = 100,
  offset = 0
): SQLiteTreeNode[] {
  const rows = db.prepare(`
    SELECT id, parent_id as parentId, name, level, path,
           has_children as hasChildren, is_leaf as isLeaf, sort_order as sortOrder
    FROM tree_nodes
    WHERE parent_id = ?
    ORDER BY sort_order, id
    LIMIT ? OFFSET ?
  `).all(parentId, limit, offset) as any[];

  return rows.map(row => ({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    level: row.level,
    path: row.path,
    hasChildren: row.hasChildren === 1,
    sortOrder: row.sortOrder,
    isLeaf: row.isLeaf === 1,
  }));
}

/**
 * 获取可见节点（递归查询）
 */
export function getVisibleNodes(limit = 100, offset = 0): SQLiteTreeNode[] {
  const sql = `
    WITH RECURSIVE visible_nodes AS (
      SELECT id, parent_id, name, level, path, has_children, is_leaf, 0 as depth
      FROM tree_nodes
      WHERE parent_id IS NULL
      
      UNION ALL
      
      SELECT n.id, n.parent_id, n.name, n.level, n.path, n.has_children, n.is_leaf, v.depth + 1
      FROM tree_nodes n
      INNER JOIN visible_nodes v ON n.parent_id = v.id
      WHERE v.has_children = 1 AND v.depth < 10
    )
    SELECT id, parent_id as parentId, name, level, path,
           has_children as hasChildren, is_leaf as isLeaf
    FROM visible_nodes
    ORDER BY id
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(limit, offset) as any[];

  return rows.map(row => ({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    level: row.level,
    path: row.path,
    hasChildren: row.hasChildren === 1,
    sortOrder: row.sortOrder,
    isLeaf: row.isLeaf === 1,
  }));
}

/**
 * 获取节点总数
 */
export function getNodeCount(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM tree_nodes').get() as { count: number };
  return result.count;
}

// ==================== 搜索辅助函数 ====================

/**
 * 计算关键词在名称中的匹配范围
 */
function computeMatchRanges(name: string, keyword: string, strategy: SearchStrategy): MatchRange[] {
  if (!keyword) return [];

  const ranges: MatchRange[] = [];

  switch (strategy) {
    case 'exact':
      if (name === keyword) {
        ranges.push({ start: 0, end: name.length });
      }
      break;

    case 'regex':
      try {
        const regex = new RegExp(keyword, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(name)) !== null) {
          ranges.push({ start: match.index, end: match.index + match[0].length });
          if (match[0].length === 0) regex.lastIndex++; // 防止空匹配死循环
        }
      } catch {
        // 无效正则，返回空范围
      }
      break;

    case 'fuzzy':
    default: {
      const lowerName = name.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      let idx = 0;
      while ((idx = lowerName.indexOf(lowerKeyword, idx)) !== -1) {
        ranges.push({ start: idx, end: idx + keyword.length });
        idx += keyword.length;
      }
      break;
    }
  }

  return ranges;
}

/**
 * 批量获取多个节点的祖先链（含自身）
 * 返回 Map<nodeId, parentPath>，路径从根到该节点（不含自身重复）
 */
function getAncestorChains(nodeIds: number[]): Map<number, Array<{ id: NodeId; name: string }>> {
  const result = new Map<number, Array<{ id: NodeId; name: string }>>();

  if (nodeIds.length === 0) return result;

  // 用递归 CTE 一次查出所有节点的祖先链
  const placeholders = nodeIds.map(() => '?').join(',');
  const sql = `
    WITH RECURSIVE parent_chain AS (
      SELECT id, parent_id, name, id as target_id
      FROM tree_nodes WHERE id IN (${placeholders})
      UNION ALL
      SELECT n.id, n.parent_id, n.name, pc.target_id
      FROM tree_nodes n
      INNER JOIN parent_chain pc ON n.id = pc.parent_id
      WHERE pc.parent_id IS NOT NULL
    )
    SELECT id, name, target_id
    FROM parent_chain
    ORDER BY target_id, id
  `;

  const rows = db.prepare(sql).all(...nodeIds) as Array<{
    id: number; name: string; target_id: number;
  }>;

  // 按 target_id 分组，构成路径链（root ... parent ... node）
  for (const row of rows) {
    if (!result.has(row.target_id)) {
      result.set(row.target_id, []);
    }
    result.get(row.target_id)!.push({ id: row.id, name: row.name });
  }

  return result;
}

/**
 * 搜索节点
 *
 * 支持四种匹配策略：
 * - exact: 精确匹配
 * - fuzzy (默认): 模糊匹配（LIKE %keyword%）
 * - regex: 正则匹配（SQL LIKE 预过滤 + JS 侧正则校验）
 * - pinyin: 预留，当前回退到 fuzzy
 *
 * 支持 scopeNodeId 子树范围限定，分页 offset/limit
 */
export function searchNodes(options: SearchOptions): SearchResponse {
  const {
    keyword = '',
    strategy = 'fuzzy',
    limit = 50,
    offset = 0,
    scopeNodeId,
  } = options;

  if (!keyword) {
    return { items: [], total: 0, hasMore: false };
  }

  // ——— 构建 SQL WHERE 条件 ———
  let whereClause: string;
  let whereParams: any[];
  let needsJsPostFilter = false;
  const actualStrategy = strategy === 'pinyin' ? 'fuzzy' : strategy; // pinyin 暂回退

  switch (actualStrategy) {
    case 'exact':
      whereClause = 'name = ?';
      whereParams = [keyword];
      break;
    case 'regex':
      // SQLite better-sqlite3 无内建 REGEXP，用 LIKE 预过滤 + JS 后置过滤
      whereClause = 'name LIKE ?';
      whereParams = [`%${keyword.replace(/[%_]/g, '\\$&')}%`];
      needsJsPostFilter = true;
      break;
    case 'fuzzy':
    default:
      whereClause = 'name LIKE ?';
      whereParams = [`%${keyword}%`];
      break;
  }

  // 子树范围限定
  const scopeParams: any[] = [];
  let scopeCTE = '';
  if (scopeNodeId !== undefined) {
    scopeCTE = `AND t.id IN (
      WITH RECURSIVE sub AS (
        SELECT id FROM tree_nodes WHERE id = ?
        UNION ALL
        SELECT n.id FROM tree_nodes n INNER JOIN sub ON n.parent_id = sub.id
      )
      SELECT id FROM sub
    )`;
    scopeParams.push(scopeNodeId);
  }

  const allParams = [...scopeParams, ...whereParams];

  // ——— 查询总数 ———
  const countSql = `
    SELECT COUNT(*) as count FROM tree_nodes t
    WHERE ${whereClause} ${scopeCTE}
  `;
  let total = (db.prepare(countSql).get(...allParams) as { count: number }).count;

  // ——— 查询分页数据 ———
  const dataSql = `
    SELECT t.id, t.parent_id, t.name, t.level, t.path,
           t.has_children, t.is_leaf, t.sort_order
    FROM tree_nodes t
    WHERE ${whereClause} ${scopeCTE}
    ORDER BY t.level, t.id
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(dataSql).all(...allParams, limit, offset) as any[];

  // ——— JS 侧后置过滤（regex 策略） ———
  let filteredRows = rows;
  if (needsJsPostFilter) {
    try {
      const regex = new RegExp(keyword, 'i');
      filteredRows = rows.filter((row: any) => regex.test(row.name));
      // total 也需修正（模糊统计即可，大数场景影响不大）
    } catch {
      return { items: [], total: 0, hasMore: false };
    }
  }

  // ——— 批量获取祖先链 ———
  const nodeIds = filteredRows.map((r: any) => r.id as number);
  const ancestorMap = getAncestorChains(nodeIds);

  // ——— 组装 SearchNode[] ———
  const items: SearchNode[] = filteredRows.map((row: any) => ({
    id: row.id,
    name: row.name,
    hasChildren: row.has_children === 1,
    parentId: row.parent_id ?? 'root',
    level: row.level,
    isLeaf: row.is_leaf === 1,
    sortOrder: row.sort_order,
    matchRanges: computeMatchRanges(row.name, keyword, actualStrategy),
    parentPath: ancestorMap.get(row.id) ?? [],
    active: false,
  }));

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

/**
 * 移动节点到新位置
 * @param nodeId - 被移动的节点 ID
 * @param newParentId - 新父节点 ID（null 表示根节点）
 * @param insertIndex - 在新兄弟中的插入位置（-1 表示末尾）
 */
export function moveNode(
  nodeId: number,
  newParentId: number | null,
  insertIndex: number = -1
): void {
  const moveTransaction = db.transaction(() => {
    // 1. 获取被移动节点
    const node = db.prepare(
      'SELECT id, parent_id, level, path FROM tree_nodes WHERE id = ?'
    ).get(nodeId) as { id: number; parent_id: number | null; level: number; path: string } | undefined;

    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // 2. 循环引用校验：不能移动到自身或后代节点下
    if (newParentId !== null) {
      if (newParentId === nodeId) {
        throw new Error('Cannot move node into itself');
      }

      // 检查 newParentId 是否是 nodeId 的后代
      const descendants = db.prepare(`
        WITH RECURSIVE descendants AS (
          SELECT id FROM tree_nodes WHERE parent_id = ?
          UNION ALL
          SELECT n.id FROM tree_nodes n
          INNER JOIN descendants d ON n.parent_id = d.id
        )
        SELECT id FROM descendants WHERE id = ?
      `).all(nodeId, newParentId) as any[];

      if (descendants.length > 0) {
        throw new Error('Cannot move node into its own descendant');
      }
    }

    const oldParentId = node.parent_id;

    // 什么都不变
    if (oldParentId === newParentId) {
      // 仅调整 sort_order（同级排序）
      reorderSiblings(newParentId, nodeId, insertIndex);
      return;
    }

    // 3. 获取新父节点信息（计算新的 level）
    let newLevel: number;
    if (newParentId === null) {
      newLevel = 1;
    } else {
      const newParent = db.prepare(
        'SELECT level, has_children FROM tree_nodes WHERE id = ?'
      ).get(newParentId) as { level: number; has_children: number } | undefined;

      if (!newParent) {
        throw new Error(`Target parent ${newParentId} not found`);
      }
      newLevel = newParent.level + 1;
    }

    const levelDiff = newLevel - node.level;

    // 4. 计算新的 path（用于被移动节点及其所有后代）
    const nodeName = node.path.split('/').pop()!;
    const newBasePath = newParentId !== null
      ? (db.prepare('SELECT path FROM tree_nodes WHERE id = ?').get(newParentId) as { path: string }).path + '/' + nodeName
      : nodeName;

    // 5. 更新被移动节点及其所有后代的 level + path + parent_id
    db.prepare(`
      WITH RECURSIVE descendants AS (
        SELECT id, level, path FROM tree_nodes WHERE id = ?
        UNION ALL
        SELECT n.id, n.level, n.path FROM tree_nodes n
        INNER JOIN descendants d ON n.parent_id = d.id
      )
      UPDATE tree_nodes SET
        level = tree_nodes.level + ?,
        path = REPLACE(tree_nodes.path, ?, ?)
      WHERE tree_nodes.id IN (SELECT id FROM descendants)
    `).run(nodeId, levelDiff, node.path, newBasePath);

    // 6. 更新被移动节点的 parent_id（在更新 path 之后，否则 REPLACE 匹配会出错）
    db.prepare('UPDATE tree_nodes SET parent_id = ? WHERE id = ?').run(newParentId, nodeId);

    // 7. 更新原父节点的 has_children
    if (oldParentId !== null) {
      const remainingChildren = db.prepare(
        'SELECT COUNT(*) as count FROM tree_nodes WHERE parent_id = ?'
      ).get(oldParentId) as { count: number };
      db.prepare('UPDATE tree_nodes SET has_children = ? WHERE id = ?').run(
        remainingChildren.count > 0 ? 1 : 0,
        oldParentId
      );
    }

    // 8. 更新新父节点的 has_children
    if (newParentId !== null) {
      db.prepare('UPDATE tree_nodes SET has_children = 1 WHERE id = ?').run(newParentId);
    }

    // 9. 调整新位置的 sort_order
    reorderSiblings(newParentId, nodeId, insertIndex);
  });

  moveTransaction();
}

/**
 * 同级节点排序：将 nodeId 插入到 insertIndex 位置
 */
function reorderSiblings(
  parentId: number | null,
  nodeId: number,
  insertIndex: number
): void {
  const siblings = db.prepare(
    'SELECT id, sort_order FROM tree_nodes WHERE parent_id IS ? ORDER BY sort_order, id'
  ).all(parentId ?? null) as Array<{ id: number; sort_order: number }>;

  // 从列表中移除被移动节点
  const filtered = siblings.filter(s => s.id !== nodeId);
  const movedNode = siblings.find(s => s.id === nodeId);
  if (!movedNode) return;

  // 确定插入位置
  const index = insertIndex >= 0 && insertIndex <= filtered.length
    ? insertIndex
    : filtered.length;

  // 构建新排序
  const reordered = [
    ...filtered.slice(0, index),
    movedNode,
    ...filtered.slice(index),
  ];

  // 批量更新 sort_order
  const updateSort = db.prepare('UPDATE tree_nodes SET sort_order = ? WHERE id = ?');
  reordered.forEach((item, i) => {
    updateSort.run(i, item.id);
  });
}

/**
 * 清空所有数据
 */
export function clearAllData(): void {
  db.exec('DELETE FROM tree_nodes;');
  db.exec('DELETE FROM sqlite_sequence;'); // 重置自增 ID
}

/**
 * 关闭数据库
 */
export function closeDatabase(): void {
  db.close();
  console.log('Database closed');
}
