┌──────────────────────────────────────────────────────────────────────┐
│  DB (SQLite)                                                         │
│  表: tree_nodes                                                      │
│  ┌──────────┬───────────┬──────┬───────┬──────────────┬────────┬───┐│
│  │ id(INT)  │parent_id  │name  │level  │has_children  │is_leaf │...││
│  │          │(INT|NULL) │(TEXT)│(INT)  │(INT 0/1)     │(INT)   │   ││
│  ├──────────┼───────────┼──────┼───────┼──────────────┼────────┼───┤│
│  │ sort_order│ path(TEXT)                                         ││
│  │ (INT)     │                                                     ││
│  └──────────┴──────────────────────────────────────────────────────┘│
└──────────────────────────────┬───────────────────────────────────────┘
                               │ better-sqlite3 查询
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DB 层 (server/db/sqlite.ts)                                         │
│  SQLiteTreeNode {                                                    │
│    id: number              // INTEGER PRIMARY KEY                    │
│    parentId: number | null // 转换自 parent_id                       │
│    name: string                                                     │
│    level: number                                                    │
│    path: string                                                     │
│    hasChildren: boolean     // 转换自 has_children 0/1               │
│    sortOrder: number        // 转换自 sort_order                     │
│    isLeaf: boolean          // 转换自 is_leaf 0/1                    │
│  }                                                                   │
│                                                                      │
│  查询时 SQL 别名映射:                                                 │
│    parent_id → parentId   has_children → hasChildren                 │
│    is_leaf → isLeaf       sort_order → sortOrder                     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ route handler 直接 json 返回
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  API 传输层 (HTTP JSON)                                              │
│  {                                                                   │
│    "success": true,                                                  │
│    "data": [                                                         │
│      {                                                               │
│        "id": 1,              // number                               │
│        "parentId": null,     // number | null                        │
│        "name": "Root-1",                                             │
│        "level": 1,                                                   │
│        "path": "Root-1",                                             │
│        "hasChildren": true,  // boolean                              │
│        "sortOrder": 1,                                               │
│        "isLeaf": false                                              │
│      }                                                               │
│    ]                                                                 │
│  }                                                                   │
│                                                                      │
│  注意: TreeNode 中的 parentId 是 string|number，但 API 返回到         │
│  前端的 parentId 始终是 number|null。toTreeNode() 中将 null → 'root'  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ fetch → json → .map(toTreeNode)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Service 层 (src/api/tree.ts)                                        │
│  转换函数: toTreeNode(apiNode: any): TreeNode                        │
│            toVisiableNode(apiNode: any): VisiableNode                │
│                                                                      │
│  TreeNode<T = any> {                                                 │
│    id:   NodeId (= string | number)                                  │
│    name: string                                                      │
│    hasChildren: boolean                                              │
│    parentId: ParentId (= NodeId | "root")   ← null 转换为 "root"     │
│    level: number                                                     │
│    path: string                                                      │
│    isLeaf: boolean                                                   │
│    sortOrder: number                                                 │
│    disabled?: boolean                                                │
│    checked?: boolean                                                 │
│    expanded?: boolean                                                │
│    selected?: boolean                                                │
│    loading?: boolean                                                 │
│    meta?: T                       // 扩展元数据                      │
│  }                                                                   │
│                                                                      │
│  VisiableNode {                      // TreeNode 的扁平化版本        │
│    id, name, hasChildren, parentId,  // 无 path, meta               │
│    level, isLeaf, sortOrder,        // 无 disabled, checked,        │
│    disabled?, checked?,             //    selected 等交互状态        │
│    expanded?, selected?, loading?                                    │
│  }                                                                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ useExpandNodes hook
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Hook 层 (src/hooks/useExpandNodes.ts)                               │
│                                                                      │
│  nodeCache: Map<NodeId, TreeNode & { children?: NodeId[] }>          │
│             ↑ 在 TreeNode 基础上扩展 children 数组                    │
│                                                                      │
│  expandedNodes: Set<NodeId>                                          │
│                                                                      │
│  visibleNodes: VisiableNode[]    ← buildVisibleNodes() 由缓存 +      │
│                                     展开状态 DFS 遍历生成            │
│                                                                      │
│  关键操作:                                                           │
│    expand  → loadChildren → 存入 nodeCache → setExpandedNodes        │
│    collapse → setExpandedNodes.delete                                │
│    buildVisibleNodes → 递归排序遍历，生成扁平 VisiableNode[]          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ props 传递
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  UI 层 (VirtualTree.tsx)                                             │
│                                                                      │
│  渲染使用: VisiableNode[] visibleSlice  ← 虚拟滚动截取               │
│                                                                      │
│  TreeNodeItem props:                                                 │
│    node: VisiableNode           // 当前节点数据                      │
│    isExpanded: boolean          // 来自 expandedNodes.has(node.id)   │
│    isSearchMode: boolean                                             │
│    onToggle: () => void         // 调用 toggle(node.id)              │
│                                                                      │
│  搜索模式: searchResults: VisiableNode[]   ← 全局 LIKE 查询结果      │
└──────────────────────────────────────────────────────────────────────┘