import { TestNodeData } from '../TestReporter'
import { TestFunction } from './TestFunction'
import { TestGroup } from './TestGroup'
import { TestSuite } from './TestSuite'

export function createTestElements(
    suite: TestSuite,
    nodes: TestNodeData[],
) {
    for (const {parentId, nodeData: {id, title, children}} of iterateNodeData(nodes)) {
        const parent = parentId === undefined ? suite : suite.nodes.get(parentId) as TestSuite|TestGroup
        const constructor = children ? TestGroup : TestFunction
        const ident = (() => {
            for (let i = 1;; i++) {
                const ident = `${constructor.name}:${title}:${i}`
                if (!parent.children.has(ident)) {
                    return ident
                }
            }
        })()
        constructor.create(parent, id, title, ident)
    }
}

function *iterateNodeData(nodeData: TestNodeData[], parentId?: number): Generator<{parentId?: number, nodeData: TestNodeData}> {
    for (const c of nodeData) {
        yield {parentId, nodeData: c}
        if (Array.isArray(c.children)) {
            yield* iterateNodeData(c.children, c.id)
        }
    }
}
