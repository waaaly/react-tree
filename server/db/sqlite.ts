import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

// 类型定义
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

/**
 * 搜索节点
 */
export function searchNodes(keyword: string, limit = 50): SQLiteTreeNode[] {
  const sql = `
    SELECT id, parent_id as parentId, name, level, path,
           has_children as hasChildren, is_leaf as isLeaf
    FROM tree_nodes
    WHERE name LIKE ?
    ORDER BY level, id
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(`%${keyword}%`, limit) as any[];

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
