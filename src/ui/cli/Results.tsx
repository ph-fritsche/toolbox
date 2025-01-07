import React, { useState } from 'react'
import { useSubscribers } from './useSubscribers'
import { isTestFunctionStack, TestNodeStack, TestResultType, TestRunInstance, TestRunStack } from '../../conductor/TestRun'
import { Box, Text, useInput } from 'ink'
import { Key } from './Key'
import { TestFunction, TestFunctionStack } from '../../conductor/TestRun/TestFunction'
import { TreeExcerpt } from './Tree'
import { Element } from './Blocks'
import { FunctionStatusIcon } from './StatusIcons'
import { findNodeFrom } from './helper'
import { NodeConductor } from './Node'
import { Scrollable } from './Scrollable'
import { XErrorComponent } from './Error'

export function Results({
    run,
}: {
    run: TestRunStack
}) {
    useSubscribers([
        r => run.addListener('error', r),
        r => run.addListener('result', r),
    ], [run])

    const [view, setView] = useState<{
        stack?: TestFunctionStack
        instance: TestRunInstance
        filter: {[k in TestResultType|'MIXED']: boolean}
    }>({
        instance: run.instances.values().next().value as TestRunInstance,
        filter: {
            MIXED: true,
            fail: true,
            timeout: true,
            skipped: false,
            success: false,
        },
    })
    const resultFilter = (filter: typeof view['filter']) => (n: TestNodeStack): n is TestFunctionStack => !!(
        isTestFunctionStack(n)
        && n.resultType
        && filter[n.resultType]
    )
    if (view.instance.stack !== run) {
        setView(v => ({ ...v,
            stack: findNodeFrom(run, false, resultFilter(v.filter)),
            instance: run.instances.values().next().value as TestRunInstance,
        }))
    } else if (!view.stack && run.index.results.size) {
        const stack = findNodeFrom(run, false, resultFilter(view.filter))
        if (stack) {
            setView(v => ({...v, stack}))
        }
    }

    useInput((input, key) => {
        const filterKey = {
            m: 'MIXED',
            n: 'fail',
            b: 'timeout',
            j: 'skipped',
            h: 'success',
        } as const
        if (key.tab) {
            setView(v => ({ ...v,
                stack: findNodeFrom(v.stack ?? run, key.shift, resultFilter(v.filter)) ?? v.stack,
            }))
        } else if (input.toLowerCase() === 'q' || input.toLowerCase() === 'w') {
            setView(v => ({ ...v,
                instance: nextRunInstance(run, v.instance, input.toLowerCase() === 'q'),
            }))
        } else if (input.toLowerCase() in filterKey) {
            const t = filterKey[input.toLowerCase() as keyof typeof filterKey]
            setView(v => {
                const filter = { ...v.filter,
                    [t]: !v.filter[t],
                }
                const stack = (v.stack?.resultType && !filter[t])
                    ? findNodeFrom(v.stack, false, resultFilter(filter))
                    : v.stack
                return { ...v, filter, stack}
            })
        }
    })

    return <>
        <Element justifyContent="space-between">
            <Box><Key>M</Key><Text color="whiteBright" strikethrough={!view.filter.MIXED}>Mixed</Text></Box>
            <Box><Key>N</Key><Text color="whiteBright" strikethrough={!view.filter.fail}>Fail</Text></Box>
            <Box><Key>B</Key><Text color="whiteBright" strikethrough={!view.filter.timeout}>Timeout</Text></Box>
            <Box><Key>J</Key><Text color="whiteBright" strikethrough={!view.filter.skipped}>Skipped</Text></Box>
            <Box><Key>H</Key><Text color="whiteBright" strikethrough={!view.filter.success}>Success</Text></Box>
        </Element>
        {view.stack && <TreeExcerpt
            node={view.stack}
            header={<Key>Tab</Key>}
            instance={view.instance}
        />}
        <Element>
            <Key>Q</Key>
            <InstancesResultsIcons run={run} node={view.stack} instance={view.instance}/>
            <Key>W</Key>
        </Element>
        <Element>
            <NodeConductor node={view.instance}/>
        </Element>
        <Box height={1} flexShrink={0}/>
        <Result node={view.stack?.instances.get(view.instance)}/>
    </>
}

function Result({
    node,
}: {
    node?: TestFunction
}) {
    const result = node?.result.get()

    useSubscribers([
        r => node?.addListener('result', r),
    ], [node, result])

    if (!result) {
        return <Text color="grey">No result yet…</Text>
    } else if (result.type === TestResultType.skipped) {
        return <Text color="grey">Test has been skipped.</Text>
    } else if (result.type === TestResultType.success) {
        return <>
            <Text color="greenBright">Test passed.</Text>
            {result.duration && (
                <Text>Duration: {result.duration}ms</Text>
            )}
        </>
    } else if (!result.error) {
        return null
    }

    return <Scrollable key={result.error.stack}>
        <XErrorComponent error={result.error}/>
    </Scrollable>
}

function nextRunInstance(
    run: TestRunStack,
    instance: TestRunInstance,
    reverse: boolean,
) {
    const instances = Array.from(run.instances.values())
    const i = instances.indexOf(instance)
    return instances[
        reverse
            ? i > 0 ? i - 1 : instances.length - 1
            : i < instances.length - 1 ? i + 1 : 0
    ]
}

function InstancesResultsIcons({
    run,
    node,
    instance,
}: {
    run: TestRunStack
    node?: TestFunctionStack
    instance?: TestRunInstance
}) {
    return <Element>
        <Text color="grey">⦑</Text>
        {Array.from(run.instances.values()).map((r, i) => {
            const nodeInstance = node?.instances.get(r)
            return [
                i > 0 && (<Text key={`seperator-${i}`} color="grey">·</Text>),
                <Text key={i}
                    bold={r === instance}
                    inverse={r === instance}
                >{nodeInstance ? <FunctionStatusIcon node={nodeInstance}/> : ' '}</Text>,
            ]
        })}
        <Text color="grey">⦒</Text>
    </Element>
}
