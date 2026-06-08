import { Router } from 'express';
import { getRootNodes, getChildren, getVisibleNodes, searchNodes, getNodeCount, clearAllData, } from '../db/sqlite.js';
import { generateLargeTree, generateBalancedTree, } from '../db/treeGenerator.js';
const router = Router();
/**
 * 获取根节点
 * GET /api/tree/roots?limit=100&offset=0
 */
router.get('/roots', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const nodes = getRootNodes(limit, offset);
        res.json({ success: true, data: nodes });
    }
    catch (error) {
        console.error('Error getting root nodes:', error);
        res.status(500).json({ success: false, error: 'Failed to get root nodes' });
    }
});
/**
 * 获取子节点
 * GET /api/tree/children/:parentId?limit=100&offset=0
 */
router.get('/children/:parentId', (req, res) => {
    try {
        const parentId = parseInt(req.params.parentId);
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const nodes = getChildren(parentId, limit, offset);
        res.json({ success: true, data: nodes });
    }
    catch (error) {
        console.error('Error getting children:', error);
        res.status(500).json({ success: false, error: 'Failed to get children' });
    }
});
/**
 * 获取可见节点
 * GET /api/tree/visible?limit=100&offset=0
 */
router.get('/visible', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const nodes = getVisibleNodes(limit, offset);
        res.json({ success: true, data: nodes });
    }
    catch (error) {
        console.error('Error getting visible nodes:', error);
        res.status(500).json({ success: false, error: 'Failed to get visible nodes' });
    }
});
/**
 * 搜索节点
 * GET /api/tree/search?keyword=test&limit=50
 */
router.get('/search', (req, res) => {
    try {
        const keyword = req.query.keyword;
        const limit = parseInt(req.query.limit) || 50;
        if (!keyword) {
            return res.status(400).json({ success: false, error: 'Keyword is required' });
        }
        const nodes = searchNodes(keyword, limit);
        res.json({ success: true, data: nodes });
    }
    catch (error) {
        console.error('Error searching nodes:', error);
        res.status(500).json({ success: false, error: 'Failed to search nodes' });
    }
});
/**
 * 获取节点总数
 * GET /api/tree/count
 */
router.get('/count', (req, res) => {
    try {
        const count = getNodeCount();
        res.json({ success: true, data: { count } });
    }
    catch (error) {
        console.error('Error getting node count:', error);
        res.status(500).json({ success: false, error: 'Failed to get node count' });
    }
});
/**
 * 生成测试数据
 * POST /api/tree/generate
 * Body: { roots, maxDepth, childrenPerNode }
 */
router.post('/generate', (req, res) => {
    try {
        const { roots, maxDepth, childrenPerNode } = req.body;
        if (!roots || !maxDepth || !childrenPerNode) {
            return res.status(400).json({
                success: false,
                error: 'roots, maxDepth, and childrenPerNode are required',
            });
        }
        const startTime = Date.now();
        const count = generateLargeTree({ roots, maxDepth, childrenPerNode });
        const generateTime = Date.now() - startTime;
        res.json({
            success: true,
            data: {
                nodeCount: count,
                generateTime,
            },
        });
    }
    catch (error) {
        console.error('Error generating tree data:', error);
        res.status(500).json({ success: false, error: 'Failed to generate tree data' });
    }
});
/**
 * 生成平衡树
 * POST /api/tree/generate-balanced
 * Body: { depth, branchingFactor }
 */
router.post('/generate-balanced', (req, res) => {
    try {
        const { depth, branchingFactor } = req.body;
        if (!depth || !branchingFactor) {
            return res.status(400).json({
                success: false,
                error: 'depth and branchingFactor are required',
            });
        }
        const startTime = Date.now();
        const count = generateBalancedTree(depth, branchingFactor);
        const generateTime = Date.now() - startTime;
        res.json({
            success: true,
            data: {
                nodeCount: count,
                generateTime,
            },
        });
    }
    catch (error) {
        console.error('Error generating balanced tree:', error);
        res.status(500).json({ success: false, error: 'Failed to generate balanced tree' });
    }
});
/**
 * 清空数据
 * DELETE /api/tree/clear
 */
router.delete('/clear', (req, res) => {
    try {
        clearAllData();
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ success: false, error: 'Failed to clear data' });
    }
});
export default router;
//# sourceMappingURL=tree.js.map