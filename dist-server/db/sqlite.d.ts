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
export declare function insertNode(node: Omit<SQLiteTreeNode, 'id'>): number;
/**
 * 批量插入节点（使用事务）
 */
export declare function insertNodesBatch(nodes: Omit<SQLiteTreeNode, 'id'>[]): number[];
/**
 * 获取根节点
 */
export declare function getRootNodes(limit?: number, offset?: number): SQLiteTreeNode[];
/**
 * 获取子节点
 */
export declare function getChildren(parentId: number, limit?: number, offset?: number): SQLiteTreeNode[];
/**
 * 获取可见节点（递归查询）
 */
export declare function getVisibleNodes(limit?: number, offset?: number): SQLiteTreeNode[];
/**
 * 获取节点总数
 */
export declare function getNodeCount(): number;
/**
 * 搜索节点
 */
export declare function searchNodes(keyword: string, limit?: number): SQLiteTreeNode[];
/**
 * 清空所有数据
 */
export declare function clearAllData(): void;
/**
 * 关闭数据库
 */
export declare function closeDatabase(): void;
//# sourceMappingURL=sqlite.d.ts.map