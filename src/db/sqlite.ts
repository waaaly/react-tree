import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { ParentId } from '../components/tree.js';
import type { SQLiteTreeNode, SearchOptions, SearchResponse, SearchNode, MatchRange, NodeId } from '../../shared/types.js';

export type { SQLiteTreeNode };

// 全局状态
let sqlite3: any = null;
let db: any = null;
let isInitialized = false;

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<void> {
  if (isInitialized) return;

  console.log('Database initializing...');

  // 初始化 SQLite 模块
  sqlite3 = await sqlite3InitModule();

  console.log('Running SQLite3 version', sqlite3.version.libVersion);

  // 创建数据库连接（使用 OPFS 如果可用）
  if ('opfs' in sqlite3) {
    db = new sqlite3.oo1.OpfsDb('/tree-data.sqlite3');
    console.log(`OPFS is available, created persisted database at ${db.filename}`);
  } else {
    db = new sqlite3.oo1.DB('/tree-data.sqlite3', 'ct');
    console.log('OPFS is not available, created transient database');
  }

  // 创建表和索引
  createTables();
  createIndexes();

  isInitialized = true;
  console.log('Database initialized successfully!');
}

/**
 * 创建表
 */
function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tree_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name TEXT NOT NULL,
      has_children INTEGER DEFAULT 0,
      is_leaf INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      path TEXT NOT NULL
    );
  `);
  console.log('Table tree_nodes created or verified.');
}

/**
 * 创建索引
 */
function createIndexes(): void {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_parent ON tree_nodes(parent_id);`,
    `CREATE INDEX IF NOT EXISTS idx_level ON tree_nodes(level);`,
    `CREATE INDEX IF NOT EXISTS idx_path ON tree_nodes(path);`,
  ];

  for (const sql of indexes) {
    db.exec(sql);
  }

  console.log('All indexes created or verified successfully.');
}

/**
 * 插入节点
 */
export async function insertNode(node: Omit<SQLiteTreeNode, 'id'>): Promise<number> {
  if (!isInitialized) {
    throw new Error('Database not ready');
  }

  const stmt = db.prepare(`
    INSERT INTO tree_nodes (parent_id, name, level, path, has_children, is_leaf)
    VALUES (?, ?, ?, ?, ?, ?);
  `);

  stmt.bind([
    node.parentId ?? null,
    node.name,
    node.level,
    node.path,
    node.hasChildren ? 1 : 0,
    node.isLeaf ? 1 : 0,
  ]);

  stmt.step();
  stmt.finalize();

  // 获取最后插入的 ID
  const result = db.exec({
    sql: 'SELECT last_insert_rowid() as id;',
    returnValue: 'resultRows',
    rowMode: 'object',
  });
  return result[0]?.id ?? 0;
}

/**
 * 获取子节点
 */
export async function getChildren(
  parentId: ParentId | null,
  limit: number = 100,
  offset: number = 0
): Promise<SQLiteTreeNode[]> {
  await initDatabase();

  const isRoot = parentId === null || parentId === 'root';
  const sql = isRoot
    ? `SELECT id, parent_id, name, level, path, has_children, is_leaf
       FROM tree_nodes
       WHERE parent_id IS NULL
       ORDER BY id
       LIMIT ? OFFSET ?;`
    : `SELECT id, parent_id, name, level, path, has_children, is_leaf
       FROM tree_nodes
       WHERE parent_id = ?
       ORDER BY id
       LIMIT ? OFFSET ?;`;

  const bind = isRoot ? [limit, offset] : [parentId, limit, offset];

  const rows = db.exec({
    sql,
    bind,
    returnValue: 'resultRows',
    rowMode: 'object',
  });

  return rows.map((row: any) => ({
    id: row.id,
    parentId: row.parent_id ?? null,
    name: row.name,
    level: row.level,
    path: row.path,
    hasChildren: row.has_children === 1,
    isLeaf: row.is_leaf === 1,
  }));
}

/**
 * 获取可见节点（递归查询）
 */
export async function getVisibleNodes(
  limit: number = 100,
  offset: number = 0
): Promise<SQLiteTreeNode[]> {
  await initDatabase();

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
    SELECT id, parent_id, name, level, path, has_children, is_leaf 
    FROM visible_nodes
    ORDER BY id
    LIMIT ? OFFSET ?;
  `;

  const rows = db.exec({
    sql,
    bind: [limit, offset],
    returnValue: 'resultRows',
    rowMode: 'object',
  });

  return rows.map((row: any) => ({
    id: row.id,
    parentId: row.parent_id ?? null,
    name: row.name,
    level: row.level,
    path: row.path,
    hasChildren: row.has_children === 1,
    isLeaf: row.is_leaf === 1,
  }));
}

/**
 * 获取节点总数
 */
export async function getNodeCount(): Promise<number> {
  await initDatabase();

  const result = db.exec({
    sql: 'SELECT COUNT(*) as count FROM tree_nodes;',
    returnValue: 'resultRows',
    rowMode: 'object',
  });
  return result[0]?.count ?? 0;
}

// ==================== 搜索辅助函数 ====================

function computeMatchRanges(name: string, keyword: string, strategy: string): MatchRange[] {
  if (!keyword) return [];
  const ranges: MatchRange[] = [];
  switch (strategy) {
    case 'exact':
      if (name === keyword) ranges.push({ start: 0, end: name.length });
      break;
    case 'regex':
      try {
        const regex = new RegExp(keyword, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(name)) !== null) {
          ranges.push({ start: match.index, end: match.index + match[0].length });
          if (match[0].length === 0) regex.lastIndex++;
        }
      } catch { /* invalid regex */ }
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

function getAncestorChains(nodeIds: number[]): Map<number, Array<{ id: NodeId; name: string }>> {
  const result = new Map<number, Array<{ id: NodeId; name: string }>>();
  if (nodeIds.length === 0) return result;

  const placeholders = nodeIds.map(() => '?').join(',');
  const rows = db.exec({
    sql: `
      WITH RECURSIVE parent_chain AS (
        SELECT id, parent_id, name, id as target_id FROM tree_nodes WHERE id IN (${placeholders})
        UNION ALL
        SELECT n.id, n.parent_id, n.name, pc.target_id
        FROM tree_nodes n INNER JOIN parent_chain pc ON n.id = pc.parent_id
        WHERE pc.parent_id IS NOT NULL
      )
      SELECT id, name, target_id FROM parent_chain ORDER BY target_id, id
    `,
    bind: nodeIds,
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as Array<{ id: number; name: string; target_id: number }>;

  for (const row of rows) {
    if (!result.has(row.target_id)) result.set(row.target_id, []);
    result.get(row.target_id)!.push({ id: row.id, name: row.name });
  }
  return result;
}

/**
 * 搜索节点
 */
export async function searchNodes(options: SearchOptions): Promise<SearchResponse> {
  const { keyword = '', strategy = 'fuzzy', limit = 50, offset = 0, scopeNodeId } = options;

  if (!keyword) return { items: [], total: 0, hasMore: false };

  await initDatabase();

  const actualStrategy = strategy === 'pinyin' ? 'fuzzy' : strategy;

  let whereClause: string;
  let whereBind: any[];
  let needsJsPostFilter = false;

  switch (actualStrategy) {
    case 'exact':
      whereClause = 'name = ?';
      whereBind = [keyword];
      break;
    case 'regex':
      whereClause = 'name LIKE ?';
      whereBind = [`%${keyword.replace(/[%_]/g, '\\$&')}%`];
      needsJsPostFilter = true;
      break;
    case 'fuzzy':
    default:
      whereClause = 'name LIKE ?';
      whereBind = [`%${keyword}%`];
      break;
  }

  const scopeBind: any[] = [];
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
    scopeBind.push(scopeNodeId);
  }

  const allBind = [...scopeBind, ...whereBind];

  // 总数
  const countResult = db.exec({
    sql: `SELECT COUNT(*) as count FROM tree_nodes t WHERE ${whereClause} ${scopeCTE}`,
    bind: allBind,
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as Array<{ count: number }>;
  let total = countResult[0]?.count ?? 0;

  // 分页数据
  let rows = db.exec({
    sql: `
      SELECT t.id, t.parent_id, t.name, t.level, t.path, t.has_children, t.is_leaf
      FROM tree_nodes t
      WHERE ${whereClause} ${scopeCTE}
      ORDER BY t.level, t.id
      LIMIT ? OFFSET ?
    `,
    bind: [...allBind, limit, offset],
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as any[];

  // JS 后置过滤
  if (needsJsPostFilter) {
    try {
      const regex = new RegExp(keyword, 'i');
      rows = rows.filter((row: any) => regex.test(row.name));
    } catch {
      return { items: [], total: 0, hasMore: false };
    }
  }

  // 批量获取祖先链
  const nodeIds = rows.map((r: any) => r.id as number);
  const ancestorMap = getAncestorChains(nodeIds);

  // 组装 SearchNode[]
  const items: SearchNode[] = rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    hasChildren: row.has_children === 1,
    parentId: row.parent_id ?? 'root',
    level: row.level,
    isLeaf: row.is_leaf === 1,
    sortOrder: 0,
    matchRanges: computeMatchRanges(row.name, keyword, actualStrategy),
    parentPath: ancestorMap.get(row.id) ?? [],
    active: false,
  }));

  return { items, total, hasMore: offset + items.length < total };
}

/**
 * 清空所有数据
 */
export async function clearAllData(): Promise<void> {
  await initDatabase();
  db.exec('DELETE FROM tree_nodes;');
}

/**
 * 关闭数据库
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
    isInitialized = false;
    console.log('Database closed');
  }
}
