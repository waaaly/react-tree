import React, { useState, useCallback, useMemo } from 'react';
import {
  generateTreeData,
  clearTreeData,
  initTreeData,
  computeTotalNodes,
} from '../api/tree.js';
import VirtualTree from './VirtualTree.js';
import './TreeBenchmark.css';


interface BenchmarkResult {
  name: string;
  roots: number;
  depth: number;
  childrenPerNode: number;
  theoreticalNodes: number;
  actualNodeCount: number;
  generateTime: number;
}

/** 预设测试配置 */
const PRESETS = [
  { name: '小型', roots: 3, depth: 4, childrenPerNode: 4 },
  { name: '中型', roots: 5, depth: 5, childrenPerNode: 5 },
  { name: '大型', roots: 5, depth: 5, childrenPerNode: 8 },
  { name: '超大型', roots: 10, depth: 5, childrenPerNode: 8 },
];

const TreeBenchmark: React.FC = () => {
  const [roots, setRoots] = useState(5);
  const [depth, setDepth] = useState(4);
  const [childrenPerNode, setChildrenPerNode] = useState(5);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [treeReady, setTreeReady] = useState(false);
  const [progress, setProgress] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // 公式计算理论节点数
  const theoreticalNodes = useMemo(
    () => computeTotalNodes(roots, depth, childrenPerNode),
    [roots, depth, childrenPerNode]
  );

  const applyPreset = useCallback((preset: typeof PRESETS[number]) => {
    setRoots(preset.roots);
    setDepth(preset.depth);
    setChildrenPerNode(preset.childrenPerNode);
  }, []);

  const generateTree = useCallback(async () => {
    setIsRunning(true);
    setTreeReady(false);
    setResults([]);

    const name = `${roots}r × d${depth} × c${childrenPerNode}`;
    setProgress(`正在生成: ${name} (理论 ${theoreticalNodes.toLocaleString()} 节点)...`);

    await initTreeData();
    await clearTreeData();

    const startTime = performance.now();
    const actualCount = await generateTreeData({
      roots,
      maxDepth: depth,
      childrenPerNode,
    });
    const endTime = performance.now();

    setResults([{
      name,
      roots,
      depth,
      childrenPerNode,
      theoreticalNodes,
      actualNodeCount: actualCount,
      generateTime: endTime - startTime,
    }]);

    setTreeReady(true);
    setIsRunning(false);
    setProgress(`完成: 实际生成 ${actualCount.toLocaleString()} 个节点 (理论 ${theoreticalNodes.toLocaleString()})`);
  }, [roots, depth, childrenPerNode, theoreticalNodes]);

  const runPreset = useCallback(async (preset: typeof PRESETS[number]) => {
    setIsRunning(true);
    setTreeReady(false);
    setResults([]);

    const theoretical = computeTotalNodes(preset.roots, preset.depth, preset.childrenPerNode);
    setProgress(`正在生成: ${preset.name} (理论 ${theoretical.toLocaleString()} 节点)...`);

    await initTreeData();
    await clearTreeData();

    const startTime = performance.now();
    const actualCount = await generateTreeData({
      roots: preset.roots,
      maxDepth: preset.depth,
      childrenPerNode: preset.childrenPerNode,
    });
    const endTime = performance.now();

    setResults([{
      name: `${preset.name} (${preset.roots}r×d${preset.depth}×c${preset.childrenPerNode})`,
      roots: preset.roots,
      depth: preset.depth,
      childrenPerNode: preset.childrenPerNode,
      theoreticalNodes: theoretical,
      actualNodeCount: actualCount,
      generateTime: endTime - startTime,
    }]);

    setTreeReady(true);
    setIsRunning(false);
    setProgress(`完成: ${actualCount.toLocaleString()} 个节点 (理论 ${theoretical.toLocaleString()})`);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="benchmark-container">
      <h1>大型树形组件性能测试</h1>

      <div className="benchmark-controls">
        <div className="params-panel">
          <h3>参数设置</h3>

          <div className="param-row">
            <label>根节点数 (roots)：</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={roots}
              onChange={e => setRoots(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>

          <div className="param-row">
            <label>最大深度 (depth)：</label>
            <input
              type="number"
              min={1}
              max={20}
              value={depth}
              onChange={e => setDepth(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>

          <div className="param-row">
            <label>分支因子 (childrenPerNode)：</label>
            <input
              type="number"
              min={1}
              max={100}
              value={childrenPerNode}
              onChange={e => setChildrenPerNode(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>

          <div className="formula-preview">
            公式：nodes = roots × (c<sup>d</sup> - 1) / (c - 1)<br />
            理论节点数：<strong>{theoreticalNodes.toLocaleString()}</strong>
          </div>

          <button
            onClick={generateTree}
            disabled={isRunning}
            className="btn-primary"
          >
            生成树
          </button>
        </div>

        <div className="preset-panel">
          <h3>预设配置</h3>
          <div className="preset-buttons">
            {PRESETS.map(preset => {
              const total = computeTotalNodes(preset.roots, preset.depth, preset.childrenPerNode);
              return (
                <div key={preset.name} className="preset-item">
                  <button
                    onClick={() => applyPreset(preset)}
                    disabled={isRunning}
                    className="btn-secondary"
                  >
                    {preset.name}
                  </button>
                  <span className="preset-desc">
                    {preset.roots}r×d{preset.depth}×c{preset.childrenPerNode}
                  </span>
                  <span className="preset-nodes">{total.toLocaleString()} 节点</span>
                  <button
                    onClick={() => runPreset(preset)}
                    disabled={isRunning}
                    className="btn-run"
                  >
                    运行
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {progress && (
        <div className="progress-info">
          {progress}
          {isRunning && <span className="loading-spinner" />}
        </div>
      )}

      {results.length > 0 && (
        <div className="results-table">
          <h3>测试结果</h3>
          <table>
            <thead>
              <tr>
                <th>测试名称</th>
                <th>roots</th>
                <th>depth</th>
                <th>c</th>
                <th>理论节点</th>
                <th>实际节点</th>
                <th>生成时间</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={index}>
                  <td>{result.name}</td>
                  <td>{result.roots}</td>
                  <td>{result.depth}</td>
                  <td>{result.childrenPerNode}</td>
                  <td>{result.theoreticalNodes.toLocaleString()}</td>
                  <td>{result.actualNodeCount.toLocaleString()}</td>
                  <td>{result.generateTime.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {treeReady && (
        <div className="tree-preview">
          <div className="tree-preview-header">
            <h3>树形组件预览</h3>
            <button onClick={handleRefresh} className="btn-refresh">
              刷新
            </button>
          </div>
          <VirtualTree key={refreshKey} itemHeight={32} containerHeight={500} />
        </div>
      )}
    </div>
  );
};

export default TreeBenchmark;
