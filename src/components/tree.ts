/**
 * 树形结构核心类型定义与操作函数
 * 提供完整的树形数据结构管理功能，包括节点CRUD、展开折叠、选择勾选、搜索过滤等
 */

// 类型统一从 shared/types 导入并重导出，保持向后兼容
import type {
  NodeId,
  ParentId,
  TreeNode,
  VisiableNode,
  MatchRange,
  SearchNode,
  NodeMap,
  ChildrenMap,
  NestedTreeNode,
} from '../../shared/types.js';

export type { NodeId, ParentId, TreeNode, VisiableNode, MatchRange, SearchNode, NodeMap, ChildrenMap, NestedTreeNode };

/**
 * 构建可见节点列表
 * 根据展开状态将树结构扁平化为列表，用于虚拟列表或渲染
 *
 * @param roodIds - 根节点ID列表
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param expandedIds - 已展开节点ID集合
 * @param selectedIds - 已选中节点ID集合（可选）
 * @param loadingIds - 加载中节点ID集合（可选）
 * @param checkedIds - 已勾选节点ID集合（可选）
 * @param disabledIds - 已禁用节点ID集合（可选）
 * @returns 可见节点列表，包含层级信息
 *
 * @example
 * const visibleList = buildVisibleList(
 *   ['1', '2'],
 *   nodeMap,
 *   childrenMap,
 *   new Set(['1']),
 *   new Set(['1-1'])
 * )
 */
export function buildVisibleList(
    roodIds: NodeId[],
    nodeMap: NodeMap,
    childrenMap: ChildrenMap,
    expandedIds: Set<NodeId>,
    selectedIds?: Set<NodeId>,
    loadingIds?: Set<NodeId>,
    checkedIds?: Set<NodeId>,
    disabledIds?: Set<NodeId>,
): VisiableNode[] {
    const result: VisiableNode[] = []

    /**
     * 深度优先遍历节点
     * @param nodeId - 当前节点ID
     * @param level - 当前层级
     */
    function dfs(nodeId: NodeId, _level: number) {
        const node = nodeMap[nodeId]
        if (!node) {
            return
        }
        const children = childrenMap[nodeId] || []
        const expanded = expandedIds.has(nodeId)
        const selected = selectedIds?.has(nodeId)
        const loading = loadingIds?.has(nodeId)
        const disabled = disabledIds?.has(nodeId)
        const checked = checkedIds?.has(nodeId)
        result.push({
            id: node.id,
            name: node.name,
            hasChildren: node.hasChildren,
            parentId: node.parentId,
            level: node.level,
            sortOrder: node.sortOrder,
            isLeaf: node.isLeaf,
            disabled,
            checked,
            expanded,
            selected,
            loading,
        })
        
        // 如果节点展开且不是叶子节点，递归处理子节点
        if (expanded && !node.isLeaf) {
            for (const childId of children) {
                dfs(childId, node.level + 1)
            }
        }
    }

    for (const nodeId of roodIds) {
        dfs(nodeId, 0)
    }

    return result
}

/**
 * 从嵌套结构NestedTreeNode构建节点映射表NodeMap
 * 将嵌套的树结构转换为扁平化的NodeMap，便于快速查找和操作
 *
 * @param nodes - 嵌套节点数组
 * @param parentId - 父节点ID，默认为"root"
 * @returns 节点映射表
 *
 * @example
 * const nestedNodes = [
 *   { id: '1', name: 'Node 1', hasChildren: true, parentId: 'root', children: [
 *     { id: '1-1', name: 'Node 1-1', hasChildren: false, parentId: '1' }
 *   ]}
 * ]
 * const nodeMap = buildNodeMapFromNested(nestedNodes)
 * // nodeMap: { '1': {...}, '1-1': {...} }
 */
export function buildNodeMapFromNested<T>(
    nodes: NestedTreeNode<T>[],
    parentId: ParentId = "root"
): NodeMap<T> {
    const nodeMap: NodeMap<T> = {}

    /**
     * 递归遍历节点
     * @param node - 当前节点
     * @param pId - 父节点ID
     */
    function traverse(node: NestedTreeNode<T>, pId: ParentId) {
        const { children, ...nodeWithoutChildren } = node
        const treeNode: TreeNode<T> = {
            ...nodeWithoutChildren,
            parentId: pId,
            hasChildren: !!(children && children.length > 0)
        }
        nodeMap[node.id] = treeNode

        if (children && children.length > 0) {
            for (const child of children) {
                traverse(child, node.id)
            }
        }
    }

    for (const node of nodes) {
        traverse(node, parentId)
    }

    return nodeMap
}

/**
 * 从节点映射表NodeMap构建子节点映射表ChildrenMap
 * 根据节点的parentId关系构建父子映射关系
 *
 * @param nodeMap - 节点映射表
 * @returns 子节点映射表
 *
 * @example
 * const nodeMap = { '1': { id: '1', parentId: 'root', ... }, '1-1': { id: '1-1', parentId: '1', ... } }
 * const childrenMap = buildChildrenMap(nodeMap)
 * // childrenMap: { 'root': ['1'], '1': ['1-1'] }
 */
export function buildChildrenMap<T>(nodeMap: NodeMap<T>): ChildrenMap {
    const childrenMap: ChildrenMap = {}

    for (const nodeId in nodeMap) {
        const node = nodeMap[nodeId]
        const parentId = node.parentId

        if (!childrenMap[parentId]) {
            childrenMap[parentId] = []
        }
        childrenMap[parentId].push(node.id)
    }

    return childrenMap
}

/**
 * 构建完整的树结构
 * 一次性从嵌套节点数组NestedTreeNode构建NodeMap、ChildrenMap和根节点ID列表
 *
 * @param nodes - 嵌套节点数组
 * @returns 包含nodeMap、childrenMap和rootIds的对象
 *
 * @example
 * const { nodeMap, childrenMap, rootIds } = buildTree(nestedNodes)
 */
export function buildTree<T>(
    nodes: NestedTreeNode<T>[]
): { nodeMap: NodeMap<T>; childrenMap: ChildrenMap; rootIds: NodeId[] } {
    const nodeMap = buildNodeMapFromNested(nodes)
    const childrenMap = buildChildrenMap(nodeMap)
    const rootIds = childrenMap["root"] || []

    return { nodeMap, childrenMap, rootIds }
}

/**
 * 添加节点到树中
 * 将新节点添加到指定父节点下，自动更新hasChildren状态
 *
 * @param nodeMap - 当前节点映射表
 * @param childrenMap - 当前子节点映射表
 * @param node - 要添加的节点
 * @param parentId - 父节点ID，默认为"root"
 * @returns 更新后的nodeMap和childrenMap
 *
 * @example
 * const { nodeMap, childrenMap } = addNode(
 *   existingNodeMap,
 *   existingChildrenMap,
 *   { id: 'new', name: 'New Node', hasChildren: false, parentId: 'root' },
 *   'parent-id'
 * )
 */
export function addNode<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    node: TreeNode<T>,
    parentId: ParentId = "root"
): { nodeMap: NodeMap<T>; childrenMap: ChildrenMap } {
    const newNodeMap = { ...nodeMap, [node.id]: { ...node, parentId } }
    const newChildrenMap: ChildrenMap = { ...childrenMap }

    if (!newChildrenMap[parentId]) {
        newChildrenMap[parentId] = []
    }
    if (!newChildrenMap[parentId].includes(node.id)) {
        newChildrenMap[parentId] = [...newChildrenMap[parentId], node.id]
    }

    // 更新父节点的hasChildren状态
    if (parentId !== "root" && newNodeMap[parentId]) {
        newNodeMap[parentId] = { ...newNodeMap[parentId], hasChildren: true }
    }

    return { nodeMap: newNodeMap, childrenMap: newChildrenMap }
}

/**
 * 从树中移除节点
 * 删除指定节点及其所有子节点，自动更新父节点的hasChildren状态
 *
 * @param nodeMap - 当前节点映射表
 * @param childrenMap - 当前子节点映射表
 * @param nodeId - 要删除的节点ID
 * @returns 更新后的nodeMap和childrenMap
 *
 * @example
 * const { nodeMap, childrenMap } = removeNode(existingNodeMap, existingChildrenMap, 'node-to-remove')
 */
export function removeNode<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    nodeId: NodeId
): { nodeMap: NodeMap<T>; childrenMap: ChildrenMap } {
    const node = nodeMap[nodeId]
    if (!node) {
        return { nodeMap, childrenMap }
    }

    const newNodeMap = { ...nodeMap }
    const newChildrenMap: ChildrenMap = {}

    // 深拷贝childrenMap
    for (const key in childrenMap) {
        newChildrenMap[key] = [...childrenMap[key]]
    }

    /**
     * 递归删除节点及其所有子节点
     * @param id - 要删除的节点ID
     */
    function deleteRecursive(id: NodeId) {
        const children = newChildrenMap[id] || []
        for (const childId of children) {
            deleteRecursive(childId)
        }
        delete newNodeMap[id]
        delete newChildrenMap[id]
    }

    deleteRecursive(nodeId)

    // 从父节点的子节点列表中移除
    const parentId = node.parentId
    if (newChildrenMap[parentId]) {
        newChildrenMap[parentId] = newChildrenMap[parentId].filter(id => id !== nodeId)

        // 如果父节点没有子节点了，更新hasChildren状态
        if (newChildrenMap[parentId].length === 0 && parentId !== "root") {
            delete newChildrenMap[parentId]
            if (newNodeMap[parentId]) {
                newNodeMap[parentId] = { ...newNodeMap[parentId], hasChildren: false }
            }
        }
    }

    return { nodeMap: newNodeMap, childrenMap: newChildrenMap }
}

/**
 * 更新节点属性
 * 更新指定节点的属性，保持其他属性不变
 *
 * @param nodeMap - 当前节点映射表
 * @param nodeId - 要更新的节点ID
 * @param updates - 要更新的属性对象（不能修改id和parentId）
 * @returns 更新后的节点映射表
 *
 * @example
 * const newNodeMap = updateNode(nodeMap, 'node-id', { name: 'New Name', checked: true })
 */
export function updateNode<T>(
    nodeMap: NodeMap<T>,
    nodeId: NodeId,
    updates: Partial<Omit<TreeNode<T>, 'id' | 'parentId'>>
): NodeMap<T> {
    const node = nodeMap[nodeId]
    if (!node) {
        return nodeMap
    }

    return {
        ...nodeMap,
        [nodeId]: { ...node, ...updates }
    }
}

/**
 * 移动节点到新位置
 * 将节点移动到新的父节点下，支持指定插入位置
 *
 * @param nodeMap - 当前节点映射表
 * @param childrenMap - 当前子节点映射表
 * @param nodeId - 要移动的节点ID
 * @param newParentId - 新的父节点ID
 * @param insertIndex - 插入位置索引（可选，默认添加到末尾）
 * @returns 更新后的nodeMap和childrenMap
 *
 * @example
 * // 将节点移动到另一个父节点下
 * const { nodeMap, childrenMap } = moveNode(nodeMap, childrenMap, 'node-1', 'new-parent')
 *
 * // 将节点插入到指定位置
 * const { nodeMap, childrenMap } = moveNode(nodeMap, childrenMap, 'node-1', 'parent', 0)
 */
export function moveNode<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    nodeId: NodeId,
    newParentId: ParentId,
    insertIndex?: number
): { nodeMap: NodeMap<T>; childrenMap: ChildrenMap } {
    const node = nodeMap[nodeId]
    if (!node || nodeId === newParentId) {
        return { nodeMap, childrenMap }
    }

    let newNodeMap = { ...nodeMap }
    const newChildrenMap: ChildrenMap = {}

    // 深拷贝childrenMap
    for (const key in childrenMap) {
        newChildrenMap[key] = [...childrenMap[key]]
    }

    const oldParentId = node.parentId

    // 从原父节点中移除
    if (newChildrenMap[oldParentId]) {
        newChildrenMap[oldParentId] = newChildrenMap[oldParentId].filter(id => id !== nodeId)

        // 更新原父节点的hasChildren状态
        if (newChildrenMap[oldParentId].length === 0 && oldParentId !== "root") {
            delete newChildrenMap[oldParentId]
            if (newNodeMap[oldParentId]) {
                newNodeMap[oldParentId] = { ...newNodeMap[oldParentId], hasChildren: false }
            }
        }
    }

    // 添加到新父节点
    if (!newChildrenMap[newParentId]) {
        newChildrenMap[newParentId] = []
    }

    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newChildrenMap[newParentId].length) {
        newChildrenMap[newParentId].splice(insertIndex, 0, nodeId)
    } else {
        newChildrenMap[newParentId].push(nodeId)
    }

    newNodeMap[nodeId] = { ...node, parentId: newParentId }

    // 更新新父节点的hasChildren状态
    if (newParentId !== "root" && newNodeMap[newParentId]) {
        newNodeMap[newParentId] = { ...newNodeMap[newParentId], hasChildren: true }
    }

    return { nodeMap: newNodeMap, childrenMap: newChildrenMap }
}

/**
 * 展开指定节点
 * 将节点ID添加到展开集合中
 *
 * @param expandedIds - 当前展开的节点ID集合
 * @param nodeId - 要展开的节点ID
 * @returns 新的展开节点ID集合
 *
 * @example
 * const newExpandedIds = expandNode(new Set(['1']), '2')
 * // newExpandedIds: Set { '1', '2' }
 */
export function expandNode(expandedIds: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
    const newSet = new Set(expandedIds)
    newSet.add(nodeId)
    return newSet
}

/**
 * 折叠指定节点
 * 将节点ID从展开集合中移除
 *
 * @param expandedIds - 当前展开的节点ID集合
 * @param nodeId - 要折叠的节点ID
 * @returns 新的展开节点ID集合
 *
 * @example
 * const newExpandedIds = collapseNode(new Set(['1', '2']), '2')
 * // newExpandedIds: Set { '1' }
 */
export function collapseNode(expandedIds: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
    const newSet = new Set(expandedIds)
    newSet.delete(nodeId)
    return newSet
}

/**
 * 展开所有节点
 * 将所有有子节点的节点添加到展开集合中
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @returns 包含所有可展开节点的集合
 *
 * @example
 * const allExpanded = expandAll(nodeMap, childrenMap)
 */
export function expandAll(
    childrenMap: ChildrenMap
): Set<NodeId> {
    const expandedIds = new Set<NodeId>()

    /**
     * 递归添加有子节点的节点
     * @param nodeId - 当前节点ID
     */
    function addChildren(nodeId: NodeId) {
        const children = childrenMap[nodeId]
        if (children && children.length > 0) {
            expandedIds.add(nodeId)
            for (const childId of children) {
                addChildren(childId)
            }
        }
    }

    const rootIds = childrenMap["root"] || []
    for (const rootId of rootIds) {
        addChildren(rootId)
    }

    return expandedIds
}

/**
 * 折叠所有节点
 * 返回空集合，表示所有节点都折叠
 *
 * @returns 空的节点ID集合
 *
 * @example
 * const collapsed = collapseAll()
 * // collapsed: Set {}
 */
export function collapseAll(): Set<NodeId> {
    return new Set<NodeId>()
}

/**
 * 展开到指定层级
 * 展开树结构到指定的层级深度
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param level - 要展开到的层级（0表示根节点）
 * @returns 展开到指定层级的节点ID集合
 *
 * @example
 * // 展开到第2层
 * const expandedIds = expandToLevel(nodeMap, childrenMap, 2)
 */
export function expandToLevel(
    childrenMap: ChildrenMap,
    level: number
): Set<NodeId> {
    const expandedIds = new Set<NodeId>()

    /**
     * 递归遍历到指定层级
     * @param nodeId - 当前节点ID
     * @param currentLevel - 当前层级
     */
    function traverse(nodeId: NodeId, currentLevel: number) {
        if (currentLevel >= level) {
            return
        }

        const children = childrenMap[nodeId]
        if (children && children.length > 0) {
            expandedIds.add(nodeId)
            for (const childId of children) {
                traverse(childId, currentLevel + 1)
            }
        }
    }

    const rootIds = childrenMap["root"] || []
    for (const rootId of rootIds) {
        traverse(rootId, 0)
    }

    return expandedIds
}

/**
 * 选择/取消选择节点
 * 支持单选和多选模式
 *
 * @param selectedIds - 当前选中的节点ID集合
 * @param nodeId - 要选择的节点ID
 * @param multiSelect - 是否多选模式，默认为false
 * @returns 新的选中节点ID集合
 *
 * @example
 * // 单选模式
 * const selected = selectNode(new Set(), 'node-1')
 * // selected: Set { 'node-1' }
 *
 * // 多选模式
 * const selected = selectNode(new Set(['node-1']), 'node-2', true)
 * // selected: Set { 'node-1', 'node-2' }
 */
export function selectNode(
    selectedIds: Set<NodeId>,
    nodeId: NodeId,
    multiSelect: boolean = false
): Set<NodeId> {
    if (multiSelect) {
        const newSet = new Set(selectedIds)
        if (newSet.has(nodeId)) {
            newSet.delete(nodeId)
        } else {
            newSet.add(nodeId)
        }
        return newSet
    } else {
        return new Set([nodeId])
    }
}

/**
 * 获取选中的节点列表
 * 根据选中的ID集合获取完整的节点对象列表
 *
 * @param nodeMap - 节点映射表
 * @param selectedIds - 选中的节点ID集合
 * @returns 选中的节点对象数组
 *
 * @example
 * const selectedNodes = getSelectedNodes(nodeMap, new Set(['1', '2']))
 */
export function getSelectedNodes<T>(nodeMap: NodeMap<T>, selectedIds: Set<NodeId>): TreeNode<T>[] {
    const result: TreeNode<T>[] = []
    for (const nodeId of selectedIds) {
        const node = nodeMap[nodeId]
        if (node) {
            result.push(node)
        }
    }
    return result
}

/**
 * 清空选择
 * 返回空的选中集合
 *
 * @returns 空的节点ID集合
 *
 * @example
 * const cleared = clearSelection()
 * // cleared: Set {}
 */
export function clearSelection(): Set<NodeId> {
    return new Set<NodeId>()
}

/**
 * 勾选/取消勾选节点
 * 支持级联勾选（自动勾选/取消勾选所有子节点，并更新父节点状态）
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param checkedIds - 当前勾选的节点ID集合
 * @param nodeId - 要勾选的节点ID
 * @param cascade - 是否级联，默认为true
 * @returns 新的勾选节点ID集合
 *
 * @example
 * // 级联勾选
 * const checked = checkNode(nodeMap, childrenMap, new Set(), 'node-1')
 *
 * // 仅勾选当前节点，不级联
 * const checked = checkNode(nodeMap, childrenMap, new Set(), 'node-1', false)
 */
export function checkNode<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    checkedIds: Set<NodeId>,
    nodeId: NodeId,
    cascade: boolean = true
): Set<NodeId> {
    const newSet = new Set(checkedIds)

    if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
        if (cascade) {
            uncheckChildren(childrenMap, newSet, nodeId)
        }
    } else {
        newSet.add(nodeId)
        if (cascade) {
            checkChildren(childrenMap, newSet, nodeId)
        }
    }

    if (cascade) {
        updateParentCheckState(nodeMap, childrenMap, newSet, nodeMap[nodeId]?.parentId)
    }

    return newSet
}

/**
 * 递归勾选所有子节点
 * @param childrenMap - 子节点映射表
 * @param checkedIds - 勾选的节点ID集合
 * @param nodeId - 当前节点ID
 */
function checkChildren(childrenMap: ChildrenMap, checkedIds: Set<NodeId>, nodeId: NodeId) {
    const children = childrenMap[nodeId]
    if (children) {
        for (const childId of children) {
            checkedIds.add(childId)
            checkChildren(childrenMap, checkedIds, childId)
        }
    }
}

/**
 * 递归取消勾选所有子节点
 * @param childrenMap - 子节点映射表
 * @param checkedIds - 勾选的节点ID集合
 * @param nodeId - 当前节点ID
 */
function uncheckChildren(childrenMap: ChildrenMap, checkedIds: Set<NodeId>, nodeId: NodeId) {
    const children = childrenMap[nodeId]
    if (children) {
        for (const childId of children) {
            checkedIds.delete(childId)
            uncheckChildren(childrenMap, checkedIds, childId)
        }
    }
}

/**
 * 递归更新父节点的勾选状态
 * 如果所有子节点都被勾选，则勾选父节点；如果所有子节点都未勾选，则取消勾选父节点
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param checkedIds - 勾选的节点ID集合
 * @param parentId - 父节点ID
 */
function updateParentCheckState<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    checkedIds: Set<NodeId>,
    parentId: ParentId
) {
    if (parentId === "root") {
        return
    }

    const children = childrenMap[parentId]
    if (!children || children.length === 0) {
        return
    }

    const allChecked = children.every(childId => checkedIds.has(childId))
    const someChecked = children.some(childId => checkedIds.has(childId))

    if (allChecked) {
        checkedIds.add(parentId)
    } else if (!someChecked) {
        checkedIds.delete(parentId)
    }

    // 递归更新祖父节点
    const grandParentId = nodeMap[parentId]?.parentId
    if (grandParentId) {
        updateParentCheckState(nodeMap, childrenMap, checkedIds, grandParentId)
    }
}

/**
 * 获取勾选的节点列表
 * 根据勾选的ID集合获取完整的节点对象列表
 *
 * @param nodeMap - 节点映射表
 * @param checkedIds - 勾选的节点ID集合
 * @returns 勾选的节点对象数组
 *
 * @example
 * const checkedNodes = getCheckedNodes(nodeMap, new Set(['1', '2']))
 */
export function getCheckedNodes<T>(nodeMap: NodeMap<T>, checkedIds: Set<NodeId>): TreeNode<T>[] {
    const result: TreeNode<T>[] = []
    for (const nodeId of checkedIds) {
        const node = nodeMap[nodeId]
        if (node) {
            result.push(node)
        }
    }
    return result
}

/**
 * 判断节点是否为半选状态
 * 半选状态：节点本身未勾选，但有子节点被勾选
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param checkedIds - 勾选的节点ID集合
 * @param nodeId - 要判断的节点ID
 * @returns 是否为半选状态
 *
 * @example
 * const isHalfChecked = isIndeterminate(nodeMap, childrenMap, checkedIds, 'node-1')
 */
export function isIndeterminate(
    childrenMap: ChildrenMap,
    checkedIds: Set<NodeId>,
    nodeId: NodeId
): boolean {
    if (checkedIds.has(nodeId)) {
        return false
    }

    const children = childrenMap[nodeId]
    if (!children || children.length === 0) {
        return false
    }

    /**
     * 递归检查是否有勾选的子孙节点
     * @param id - 当前节点ID
     * @returns 是否有勾选的子孙节点
     */
    function hasCheckedDescendant(id: NodeId): boolean {
        if (checkedIds.has(id)) {
            return true
        }
        const childNodes = childrenMap[id]
        if (childNodes) {
            return childNodes.some(childId => hasCheckedDescendant(childId))
        }
        return false
    }

    return children.some(childId => hasCheckedDescendant(childId))
}

/**
 * 搜索节点
 * 根据关键字搜索节点，支持指定匹配字段
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param keyword - 搜索关键字
 * @param matchFields - 要匹配的字段数组，默认为['name']
 * @returns 匹配的节点ID数组
 *
 * @example
 * // 按名称搜索
 * const result = searchNodes(nodeMap, childrenMap, 'keyword')
 *
 * // 按多个字段搜索
 * const result = searchNodes(nodeMap, childrenMap, 'keyword', ['name', 'description'])
 */
export function searchNodes<T>(
    nodeMap: NodeMap<T>,
    keyword: string,
    matchFields: (keyof TreeNode<T>)[] = ['name']
): NodeId[] {
    const result: NodeId[] = []
    const lowerKeyword = keyword.toLowerCase()

    for (const nodeId in nodeMap) {
        const node = nodeMap[nodeId]
        const match = matchFields.some(field => {
            const value = node[field]
            if (typeof value === 'string') {
                return value.toLowerCase().includes(lowerKeyword)
            }
            return false
        })

        if (match) {
            result.push(nodeId)
        }
    }

    return result
}

/**
 * 过滤节点
 * 根据自定义条件过滤节点，返回过滤后的树结构
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param predicate - 过滤条件函数，返回true表示保留该节点
 * @returns 过滤后的节点映射表、子节点映射表和根节点ID列表
 *
 * @example
 * // 过滤出名称包含'keyword'的节点
 * const { filteredNodeMap, filteredChildrenMap, rootIds } = filterNodes(
 *   nodeMap,
 *   childrenMap,
 *   (node) => node.name.includes('keyword')
 * )
 */
export function filterNodes<T>(
    nodeMap: NodeMap<T>,
    predicate: (node: TreeNode<T>) => boolean
): { filteredNodeMap: NodeMap<T>; filteredChildrenMap: ChildrenMap; rootIds: NodeId[] } {
    const filteredNodeMap: NodeMap<T> = {}
    const filteredChildrenMap: ChildrenMap = {}

    // 先过滤节点
    for (const nodeId in nodeMap) {
        const node = nodeMap[nodeId]
        if (predicate(node)) {
            filteredNodeMap[nodeId] = node
        }
    }

    // 重建子节点关系
    for (const nodeId in filteredNodeMap) {
        const node = filteredNodeMap[nodeId]
        const parentId = node.parentId

        if (parentId === "root" || filteredNodeMap[parentId]) {
            if (!filteredChildrenMap[parentId]) {
                filteredChildrenMap[parentId] = []
            }
            filteredChildrenMap[parentId].push(nodeId)
        }
    }

    const rootIds = filteredChildrenMap["root"] || []

    return { filteredNodeMap, filteredChildrenMap, rootIds }
}

/**
 * 获取节点路径
 * 从根节点到指定节点的完整路径
 *
 * @param nodeMap - 节点映射表
 * @param nodeId - 目标节点ID
 * @returns 从根到目标节点的节点数组
 *
 * @example
 * const path = getNodePath(nodeMap, 'node-1-2')
 * // path: [rootNode, node-1, node-1-2]
 */
export function getNodePath<T>(
    nodeMap: NodeMap<T>,
    nodeId: NodeId
): TreeNode<T>[] {
    const path: TreeNode<T>[] = []
    let currentId: NodeId | undefined = nodeId

    while (currentId && currentId !== "root") {
        const node = nodeMap[currentId]
        if (!node) {
            break
        }
        path.unshift(node)
        currentId = node.parentId as NodeId
    }

    return path
}

/**
 * 获取父节点
 * 获取指定节点的直接父节点
 *
 * @param nodeMap - 节点映射表
 * @param nodeId - 节点ID
 * @returns 父节点对象，如果不存在则返回undefined
 *
 * @example
 * const parent = getParentNode(nodeMap, 'node-1')
 */
export function getParentNode<T>(
    nodeMap: NodeMap<T>,
    nodeId: NodeId
): TreeNode<T> | undefined {
    const node = nodeMap[nodeId]
    if (!node || node.parentId === "root") {
        return undefined
    }
    return nodeMap[node.parentId]
}

/**
 * 获取所有子节点
 * 递归获取指定节点的所有子孙节点
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param nodeId - 节点ID
 * @returns 所有子孙节点数组
 *
 * @example
 * const allChildren = getAllChildren(nodeMap, childrenMap, 'node-1')
 */
export function getAllChildren<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    nodeId: NodeId
): TreeNode<T>[] {
    const result: TreeNode<T>[] = []

    /**
     * 递归收集子节点
     * @param id - 当前节点ID
     */
    function collectChildren(id: NodeId) {
        const children = childrenMap[id]
        if (children) {
            for (const childId of children) {
                const node = nodeMap[childId]
                if (node) {
                    result.push(node)
                    collectChildren(childId)
                }
            }
        }
    }

    collectChildren(nodeId)
    return result
}

/**
 * 获取兄弟节点
 * 获取与指定节点同级的其他节点
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param nodeId - 节点ID
 * @returns 兄弟节点数组（不包含自身）
 *
 * @example
 * const siblings = getSiblings(nodeMap, childrenMap, 'node-1')
 */
export function getSiblings<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    nodeId: NodeId
): TreeNode<T>[] {
    const node = nodeMap[nodeId]
    if (!node) {
        return []
    }

    const parentId = node.parentId
    const siblings = childrenMap[parentId] || []

    return siblings
        .filter(id => id !== nodeId)
        .map(id => nodeMap[id])
        .filter((n): n is TreeNode<T> => n !== undefined)
}

/**
 * 判断是否为叶子节点
 * 检查指定节点是否有子节点
 *
 * @param childrenMap - 子节点映射表
 * @param nodeId - 节点ID
 * @returns 是否为叶子节点
 *
 * @example
 * const isLeafNode = isLeaf(childrenMap, 'node-1')
 */
export function isLeaf(
    childrenMap: ChildrenMap,
    nodeId: NodeId
): boolean {
    const children = childrenMap[nodeId]
    return !children || children.length === 0
}

/**
 * 异步加载子节点
 * 通过异步加载器获取子节点并添加到树中
 *
 * @param nodeMap - 当前节点映射表
 * @param childrenMap - 当前子节点映射表
 * @param nodeId - 要加载子节点的节点ID
 * @param loader - 异步加载函数，返回子节点数组
 * @returns 更新后的nodeMap和childrenMap
 *
 * @example
 * const { nodeMap, childrenMap } = await loadChildren(
 *   nodeMap,
 *   childrenMap,
 *   'node-1',
 *   async () => {
 *     const response = await fetch('/api/children/node-1')
 *     return response.json()
 *   }
 * )
 */
export async function loadChildren<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    nodeId: NodeId,
    loader: () => Promise<TreeNode<T>[]>
): Promise<{ nodeMap: NodeMap<T>; childrenMap: ChildrenMap }> {
    const children = await loader()

    let newNodeMap = { ...nodeMap }
    let newChildrenMap = { ...childrenMap }

    for (const child of children) {
        const result = addNode(newNodeMap, newChildrenMap, child, nodeId)
        newNodeMap = result.nodeMap
        newChildrenMap = result.childrenMap
    }

    newNodeMap[nodeId] = { ...newNodeMap[nodeId], hasChildren: children.length > 0 }

    return { nodeMap: newNodeMap, childrenMap: newChildrenMap }
}

/**
 * 将树扁平化为数组
 * 按深度优先遍历顺序将树结构转换为数组
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @returns 按遍历顺序排列的节点数组
 *
 * @example
 * const flatList = flattenTree(nodeMap, childrenMap)
 */
export function flattenTree<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap
): TreeNode<T>[] {
    const result: TreeNode<T>[] = []
    const rootIds = childrenMap["root"] || []

    /**
     * 递归遍历节点
     * @param nodeId - 当前节点ID
     */
    function traverse(nodeId: NodeId) {
        const node = nodeMap[nodeId]
        if (node) {
            result.push(node)
            const children = childrenMap[nodeId] || []
            for (const childId of children) {
                traverse(childId)
            }
        }
    }

    for (const rootId of rootIds) {
        traverse(rootId)
    }

    return result
}

/**
 * 转换为嵌套树结构
 * 将扁平化的NodeMap和ChildrenMap转换为嵌套的树结构
 *
 * @param nodeMap - 节点映射表
 * @param childrenMap - 子节点映射表
 * @param parentId - 起始父节点ID，默认为"root"
 * @returns 嵌套的树节点数组
 *
 * @example
 * const nestedTree = toNestedTree(nodeMap, childrenMap)
 * // nestedTree: [{ id: '1', name: 'Node 1', children: [...] }]
 */
export function toNestedTree<T>(
    nodeMap: NodeMap<T>,
    childrenMap: ChildrenMap,
    parentId: ParentId = "root"
): NestedTreeNode<T>[] {
    const result: NestedTreeNode<T>[] = []
    const children = childrenMap[parentId] || []

    for (const nodeId of children) {
        const node = nodeMap[nodeId]
        if (node) {
            const nestedNode: NestedTreeNode<T> = { ...node }
            const childNodes = toNestedTree(nodeMap, childrenMap, nodeId)
            if (childNodes.length > 0) {
                nestedNode.children = childNodes
            }
            result.push(nestedNode)
        }
    }

    return result
}
