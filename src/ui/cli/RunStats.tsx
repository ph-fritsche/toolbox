import React from 'react'
import { Box, Text } from 'ink'
import { TestResultType, TestRunStack } from '../../conductor/TestRun'
import { useTester } from '../TesterContext'
import { useSubscribers } from './useSubscribers'
import { Block, Element, Line } from './Blocks'
import { InstanceStatusIcon, ResultIcon } from './StatusIcons'
import { NodeConductor } from './Node'

export function RunStats({
    run,
}: {
    run: TestRunStack,
}) {
    const tester = useTester()
    useSubscribers([
        r => run.addListener('skip', () => r()),
        r => run.addListener('start', () => r()),
        r => run.addListener('error', () => r()),
        r => run.addListener('schedule', () => r()),
        r => run.addListener('result', () => r()),
        r => run.addListener('done', () => r()),
        r => tester.manager.addListener('done', () => r()),
    ], [run])

    const count = { pending: 0, skipped: 0, running: 0, done: 0 }
    for (const [r] of run.instances) {
        count.pending += r.index.suites.pending.size
        count.skipped += r.index.suites.skipped.size
        count.running += r.index.suites.running.size
        count.done += r.index.suites.done.size
    }

    return <Box flexDirection="column" flexShrink={0}>
        <Box columnGap={2} flexWrap="wrap">
            <Box flexDirection="column">
                <Box><Text color="grey" bold>Suites</Text></Box>
                <Box columnGap={1} flexWrap="wrap">
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Done</Text>
                        <Text>{count.done}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Skipped</Text>
                        <Text>{count.skipped}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Running</Text>
                        <Text>{count.running}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Pending</Text>
                        <Text>{count.pending}</Text>
                    </Box>
                </Box>
            </Box>
            <Box flexDirection="column" alignItems="flex-end">
                <Box><Text color="grey" bold>Error</Text></Box>
                <Box><Text color="grey" bold>nodes</Text></Box>
                <Box><Text>{run.index.errors.size}</Text></Box>
            </Box>
            <Box flexDirection="column">
                <Box><Text color="grey" bold>Results</Text></Box>
                <Box columnGap={1} flexWrap="wrap">
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Passed</Text>
                        <Text>{run.index.results.success.size}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Failed</Text>
                        <Text>{run.index.results.fail.size}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Timeouts</Text>
                        <Text>{run.index.results.timeout.size}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Skipped</Text>
                        <Text>{run.index.results.skipped.size}</Text>
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                        <Text>Mixed</Text>
                        <Text>{run.index.results.MIXED.size}</Text>
                    </Box>
                </Box>
            </Box>
        </Box>
    </Box>
}

export function RunInstanceStats({
    run,
}: {
    run: TestRunStack
}) {
    const r: React.ReactNode[] = []
    Array.from(run.instances.values()).forEach((instance, i) => r.push(
        <Block key={i}>
            <Line>
                <InstanceStatusIcon node={instance}/>
                <NodeConductor node={instance}/>
            </Line>
            <Element columnGap={1} marginLeft={2}>
                <Box>
                    <Text>{instance.index.results.success.size}</Text>
                    <Text color="grey" dimColor>(</Text>
                    <ResultIcon resultType={TestResultType.success}/>
                    <Text color="grey" dimColor>)</Text>
                </Box>
                <Box>
                    <Text>{instance.index.results.fail.size}</Text>
                    <Text color="grey" dimColor>(</Text>
                    <ResultIcon resultType={TestResultType.fail}/>
                    <Text color="grey" dimColor>)</Text>
                </Box>
                <Box>
                    <Text>{instance.index.results.timeout.size}</Text>
                    <Text color="grey" dimColor>(</Text>
                    <ResultIcon resultType={TestResultType.timeout}/>
                    <Text color="grey" dimColor>)</Text>
                </Box>
                <Box>
                    <Text>{instance.index.results.skipped.size}</Text>
                    <Text color="grey" dimColor>(</Text>
                    <ResultIcon resultType={TestResultType.skipped}/>
                    <Text color="grey" dimColor>)</Text>
                </Box>
            </Element>
            {!!instance.index.errors.size && (
                <Line marginLeft={2}>
                    <Text>{Array.from(instance.index.errors.values())
                        .reduce((n, node) => n + node.errors.count, 0)
                    } errors</Text>
                    <Text> on {instance.index.errors.size} nodes</Text>
                </Line>
            )}
        </Block>,
    ))

    return <Block>{r}</Block>
}
