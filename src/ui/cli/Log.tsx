import React, { useRef } from 'react'
import { isTestGroup, isTestSuite, TestHook, TestNodeInstance, TestRunStack } from '../../conductor/TestRun'
import { useSubscribers } from './useSubscribers'
import { Line, OverflowX } from './Blocks'
import { Static, Text } from 'ink'
import { getFunctionStatusIcon } from './StatusIcons'
import { NodeConductor } from './Node'

export function Log({
    run,
}: {
    run: TestRunStack,
}) {
    const log = useRef<React.ReactNode[]>([]).current

    useSubscribers([
        r => run.addListener('start', e => {
            log.push(<Line key={log.length}>
                <Text color="cyan">
                    <Text>⏵</Text>
                    <NodeConductor node={e.node}/>
                    <Text>{e.node.title}</Text>
                </Text>
            </Line>)
            r()
        }),
        r => run.addListener('error', e => {
            log.push(<Line key={log.length}>
                <Text color="redBright" bold>!</Text>
                <NodeConductor node={e.node} />
                {nodeTitle(e.node, true)}
                {e.error.hook && (
                    <Text color="redBright"> ({describeHook(e.error.hook)})</Text>
                )}
            </Line>)
            r()
        }),
        r => run.addListener('result', e => {
            const [icon, props] = getFunctionStatusIcon(e.node)
            log.push(<Line key={log.length}>
                <Text {...props}>{icon}</Text>
                <NodeConductor node={e.node} color="grey"/>
                {nodeTitle(e.node)}
            </Line>)
            r()
        }),
        r => run.addListener('done', e => {
            log.push(<Line key={log.length}>
                <Text color="cyan">
                    <Text>▪</Text>
                    <NodeConductor node={e.node} />
                    <Text>{e.node.title}</Text>
                </Text>
            </Line>)
            r()
        }),
    ], [run])

    return <OverflowX><Static items={[...log]}>{(item) => item}</Static></OverflowX>
}

function nodeTitle(
    node: TestNodeInstance,
    errorLog = false,
) {
    const r: React.ReactNode[] = []
    Array.from(node.ancestors(true)).reverse().forEach((n, i) => {
        if (!('title' in n)) {
            return
        } else if (r.length) {
            r.push(<Text color="grey" key={`sep${i}`}> › </Text>)
        }
        const hasError = errorLog
            ? n === node
            : (isTestGroup(n) || isTestSuite(n)) && n.errors.count
        r.push((
            <Text
                key={i}
                color={hasError ? 'redBright' : undefined}
            >{String(n.title)}</Text>
        ))
    })
    return <Text>{r}</Text>
}

function describeHook(hook: TestHook) {
    return [
        hook.cleanup && 'cleanup of',
        `${hook.type}#${hook.index}`,
        hook.name,
    ].filter(Boolean).join(' ')
}
