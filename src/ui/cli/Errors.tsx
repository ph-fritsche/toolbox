import React, { useState } from 'react'
import { useSubscribers } from './useSubscribers'
import { TestHook, TestRunInstance, TestRunStack, TestSuite, TestSuiteStack } from '../../conductor/TestRun'
import { Box, Text, useInput } from 'ink'
import { Key } from './Key'
import { TestGroup, TestGroupStack } from '../../conductor/TestRun/TestGroup'
import { findNodeFrom, hasError } from './helper'
import { TreeExcerpt } from './Tree'
import { Element } from './Blocks'
import { ScrollableError } from './Error'

export function Errors({
    run,
}: {
    run: TestRunStack
}) {
    useSubscribers([
        r => run.addListener('error', r),
    ], [run])

    const [view, setView] = useState<{
        stack?: TestGroupStack|TestSuiteStack
        instance: TestRunInstance
        errorOffset: number
    }>({
        instance: run.instances.values().next().value as TestRunInstance,
        errorOffset: 0,
    })
    if (view.instance.stack !== run || !view.stack && run.index.errors.size) {
        setView(v => ({
            instance: run.instances.has(v.instance) ? v.instance : run.instances.values().next().value as TestRunInstance,
            stack: findNodeFrom(run, false, hasError),
            errorOffset: 0,
        }))
    }

    useInput((input, key) => {
        if (key.tab) {
            setView(v => ({...v,
                stack: findNodeFrom(v.stack ?? run, key.shift, hasError),
                errorOffset: 0,
            }))
        } else if (input.toLowerCase() === 'q' || input.toLowerCase() === 'w') {
            setView(v => ({...v,
                instance: nextRunInstance(run, v.instance, input.toLowerCase() === 'q'),
                errorOffset: 0,
            }))
        } else if (input.toLowerCase() === 'a' || input.toLowerCase() === 's') {
            setView(v => ({...v,
                errorOffset: walkIndex(v.errorOffset, v.stack?.instances.get(v.instance)?.errors.count ?? 0, input.toLowerCase() === 'a'),
            }))
        }
    })

    if (!view.stack) {
        return <Box>
            <Text>No errors</Text>
        </Box>
    }

    const node = view.stack.instances.get(view.instance)
    const error = getNthError(node, view.errorOffset)

    return <>
        <TreeExcerpt
            node={view.stack}
            instance={view.instance}
            header={<Key>Tab</Key>}
        />
        <Element justifyContent="space-between">
            <Box flexGrow={0}>
                <Key>Q</Key>
                <Text color="grey">⦑</Text>
                {Array.from(run.instances.values()).map((r, i) => {
                    const nodeInstance = view.stack?.instances.get(r)
                    return [
                        i > 0 && (<Text key={`seperator-${i}`} color="grey">·</Text>),
                        <Text key={i}
                            bold={r === view.instance}
                            inverse={r === view.instance}
                        >{nodeInstance?.errors.count ? <Text color="red">!</Text>: ' '}</Text>,
                    ]
                })}
                <Text color="grey">⦒</Text>
                <Key>W</Key>
            </Box>
            {Number(node?.errors.count) > 1 && (
                <Box flexGrow={0}>
                    <Key>A</Key>
                    <Text>{view.errorOffset + 1}</Text>
                    <Text>/</Text>
                    <Text>{node?.errors.count}</Text>
                    <Key>S</Key>
                </Box>
            )}
        </Element>
        {error && error.length > 0
            ? <>
                {error[0].hook && (
                    <Box marginTop={1}>
                        <Text>{describeHook(error[0].hook)}</Text>
                    </Box>
                )}
                <Box height={1}/>
                <ScrollableError error={error[0]}/>
                {error.length > 1 && (
                    <Element>
                        <Text color="grey">…and {error.length - 1} more on this node/hook</Text>
                    </Element>
                )}
            </>
            : <Element marginTop={1}>
                <Text color="grey">There has been no error on this node in this conductor.</Text>
            </Element>
        }
    </>
}

function getNthError(
    node: TestSuite|TestGroup|undefined,
    offset: number,
) {
    if (!node) {
        return undefined
    }
    const gen = node.errors.grouped()
    // eslint-disable-next-line no-cond-assign
    for (let i = 0, e; i <= offset && (e = gen.next().value); i++) {
        return Array.from(e)
    }
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

function walkIndex(i: number, len: number, reverse: boolean) {
    return Math.min(len - 1, Math.max(0, (
        reverse
            ? i > 0 ? i - 1 : len - 1
            : i < len - 1 ? i + 1 : 0
    )))
}

function describeHook(hook: TestHook) {
    return [
        hook.cleanup && 'cleanup of',
        'hook',
        `${hook.type}#${hook.index}`,
        hook.name,
    ].filter(Boolean).join(' ')
}
