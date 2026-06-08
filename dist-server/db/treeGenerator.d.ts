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
export declare function computeTotalNodes(roots: number, maxDepth: number, childrenPerNode: number): number;
/**
 * 生成大型树形数据（森林）
 */
export declare function generateLargeTree(options: GenerateOptions): number;
/**
 * 生成平衡树
 */
export declare function generateBalancedTree(depth: number, branchingFactor: number): number;
//# sourceMappingURL=treeGenerator.d.ts.map