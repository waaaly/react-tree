import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { ParentId } from '../components/tree.js';
import type { SQLiteTreeNode } from '../../shared/types.js';

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

/**
 * 搜索节点
 */
export async function searchNodes(
  keyword: string,
  limit: number = 50
): Promise<SQLiteTreeNode[]> {
  await initDatabase();

  const sql = `
    SELECT id, parent_id, name, level, path, has_children, is_leaf
    FROM tree_nodes
    WHERE name LIKE ?
    ORDER BY level, id
    LIMIT ?;
  `;

  const rows = db.exec({
    sql,
    bind: [`%${keyword}%`, limit],
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
