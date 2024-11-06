import React from 'react'
import { Box, Text, TextProps } from 'ink'
import { isTestFunctionStack, isTestGroupStack, TestHook, TestNodeStack, TestResultType, TestRunInstance, TestRunStack, TestSuiteStack } from '../../conductor/TestRun'
import { useSubscribers } from './useSubscribers'
import { TestGroupStack } from '../../conductor/TestRun/TestGroup'
import { FunctionStatusIcon, InstanceStatusIcon } from './StatusIcons'
import { hasError } from './helper'
import { Line, OverflowX } from './Blocks'
import { TestFunctionStack } from '../../conductor/TestRun/TestFunction'
import { Scrollable } from './Scrollable'
import { NodeConductor } from './Node'

export function RunTree({
    run,
    printErrors,
    scrollable,
}: {
    run: TestRunStack
    printErrors?: boolean
    scrollable?: boolean
}) {
    const content = useRunStackTree(run, {printErrors})

    return scrollable && content
        ? <Scrollable content={content}/>
        : <OverflowX>{content}</OverflowX>
}

export function useRunStackTree(
    run: TestRunStack|undefined,
    {
        printErrors = false,
    }: {
        printErrors?: boolean
    },
) {
    useSubscribers([
        r => run?.addListener('schedule', r),
        r => run?.addListener('result', r),
        r => run?.addListener('error', r),
    ], [run])

    if (!run) {
        return null
    }

    const getKey = newKeyGen()

    return Array.from(run.suites.values())
        .toSorted((a, b) => a.title === b.title ? 0 : a.title < b.title ? -1 : 1)
        .flatMap((s) => Array.from(renderSuite(s, printErrors)))

    // Scrollable requires the elements to be of uniform height.
    // This requires the tree render functions to return an element for each line in a flat array.
    // It is doubtful that a meaningful key would allow for actual optimization here.
    // Therefor this just shuts React up.
    function newKeyGen() {
        const gen = function* genLineKey() {
            for(let i = 0;;) {
                yield i++
            }
        }()
        return () => gen.next().value
    }

    function* renderSuite(
        suite: TestSuiteStack,
        printErrors: boolean,
    ): Generator<React.ReactElement> {
        yield <Box key={suite.url}>
            <Text color="grey">[</Text>
            {Array.from(suite.instances).map(([, instance], i) => (
                <InstanceStatusIcon
                    key={i}
                    node={instance}
                />
            ))}
            <Text color="grey">] </Text>
            <Text>{suite.title}</Text>
        </Box>
        if (printErrors) {
            if (yield* renderErrors(suite)) {
                yield <Line key={getKey()}/>
            }
        }
        yield* renderChildren(suite, printErrors, '', suite.url)
    }

    function* renderErrors(
        node: TestGroupStack|TestSuiteStack,
    ): Generator<React.ReactElement, boolean> {
        let yielded = false
        for (const nodeInstance of node.instances.values()) {
            if (!nodeInstance.errors.count) {
                continue
            }
            yielded = true

            yield <Line key={getKey()}>
                <Text color="redBright" bold>!</Text>
                <NodeConductor node={nodeInstance}/>
            </Line>
            for (const iterator of nodeInstance.errors.grouped()) {
                const errors = Array.from(iterator)
                const error = errors[0]
                yield* [
                    error.hook && (
                        <Line key={getKey()}>
                            <Prefix dimColor>╎ </Prefix>
                            <Text>{describeHook(error.hook)}</Text>
                        </Line>
                    ),
                    ...error.toString().trim().split('\n').map((l, i, a) => (
                        // eslint-disable-next-line react/jsx-key
                        <Line key={getKey()}>
                            <Prefix dimColor>{i === a.length - 1 && errors.length <= 1 ? '╰' : '╎'} </Prefix>
                            <Text color="grey" dimColor></Text>
                            <Text color="redBright" wrap="truncate-end">{l}</Text>
                        </Line>
                    )),
                    errors.length > 1 && (
                        <Line key={getKey()}>
                            <Prefix dimColor>╰ </Prefix>
                            <Text color="grey">+{errors.length - 1}</Text>
                        </Line>
                    ),
                ].filter(Boolean) as React.ReactElement[]
            }
        }
        return yielded
    }

    function describeHook(hook: TestHook) {
        return [
            hook.cleanup && 'cleanup of',
            'hook',
            `${hook.type}#${hook.index}`,
            hook.name,
        ].filter(Boolean).join(' ')
    }

    function* renderChildren(
        group: TestGroupStack|TestSuiteStack,
        printErrors: boolean,
        prefix = '',
        keyPrefix = '',
    ): Generator<React.ReactElement> {
        for (const [node, ident, i] of group.children) {
            const isLast = i === group.children.size -1
            const key = `${keyPrefix}:${ident}`

            yield <TreeNode key={key}
                prefix={prefix}
                title={node.title}
                hasChildNodes={Boolean(node.children?.size)}
                result={isTestFunctionStack(node) && <FunctionStatusIcon node={node}/>}
                isLast={isLast}
            />
            if (printErrors && isTestGroupStack(node)) {
                if (yield* renderErrors(node)) {
                    yield <Prefix key={getKey()}>{prefix + (isLast ? ' ' : '│') + (node.children.size ? '│' : '')}</Prefix>
                }
            }
            if (isTestGroupStack(node)) {
                yield* renderChildren(
                    node,
                    printErrors,
                    prefix + (isLast ? ' ' : '│'),
                    key,
                )
            } else if (printErrors && isTestFunctionStack(node)) {
                if (yield* renderResults(node)) {
                    yield <Prefix key={getKey()}>{prefix + (isLast ? ' ' : '│')}</Prefix>
                }
            }
        }
    }

    function* renderResults(
        node: TestFunctionStack,
    ): Generator<React.ReactElement> {
        let yielded = false

        switch(node.resultType) {
        case undefined:
        case TestResultType.success:
        case TestResultType.skipped:
            return yielded
        }

        for (const instance of node.instances.values()) {
            yielded = true
            const error = instance.result.get()?.getErrorAsString()
            yield <Line key={getKey()}>
                <FunctionStatusIcon node={instance}/>
                <NodeConductor node={instance}/>
            </Line>
            if (error) {
                yield* error.trim().split('\n').map((l, i, a) => (
                    // eslint-disable-next-line react/jsx-key
                    <Line key={getKey()}>
                        <Prefix dimColor>{i === a.length - 1 ? '╰' :'╎'} </Prefix>
                        <Text color="redBright" wrap="truncate-end">{l}</Text>
                    </Line>
                ))
            }
        }

        return yielded
    }
}

export function Prefix({
    children,
    ...props
}: TextProps) {
    return <Box
        height={1}
        flexGrow={0}
        flexShrink={0}
        flexWrap="nowrap"
    >
        <Text color="grey" {...props}>{children}</Text>
    </Box>
}

export function TreeNode({
    prefix = '',
    isLast = false,
    hasChildNodes,
    result,
    title,
    ...textProps
}: {
    prefix?: string
    isLast?: boolean
    hasChildNodes?: boolean
    result?: React.ReactNode
    title: string
} & TextProps) {
    const treeStyle: TextProps = { color: 'grey' }
    return <Line>
        <Box flexShrink={0} flexGrow={0}>
            <Text {...treeStyle}>
                {prefix}
                {isLast ? '└' : '├'}
                {hasChildNodes ? '┮' : '╼'}
            </Text>
            {result && (<>
                <Text {...treeStyle}>{'['}</Text>
                <Text {...textProps}>{result}</Text>
                <Text {...treeStyle}>{']'}</Text>
            </>)}
        </Box>
        <Box>
            <Text
                wrap="truncate-end"
                {...textProps}
            >
                {' '}
                {title}
            </Text>
        </Box>
    </Line>
}

export function TreeExcerpt({
    node,
    header,
    instance,
}: {
    node: TestNodeStack
    header?: React.ReactNode
    instance?: TestRunInstance
}) {
    useSubscribers([
        r => node.addListener('error', r),
    ], [node])

    const t = []
    const epilog = []
    let prefix = ''
    const nodeTitle = (n: TestNodeStack) => 'title' in n ? String(n.title) : ''
    const dimProps: TextProps = {color: 'grey', dimColor: true}
    for (const n of Array.from(node.ancestors(true)).reverse()) {
        if (!n.parent) {
            t.push(<Box key={'0'} flexShrink={0}>
                <Text color="grey">╻</Text>
                {header}
            </Box>)
            continue
        }
        const prev = n.previousSibling
        const next = n.nextSibling
        if (prev) {
            t.push(<TreeNode
                key={`${t.length}-prev-${nodeTitle(prev)}`}
                prefix={prefix}
                title={nodeTitle(prev)}
                hasChildNodes={Boolean(prev.children?.size)}
                result={isTestFunctionStack(prev) && <FunctionStatusIcon node={prev} {...dimProps}/>}
                {...dimProps}
            />)
        }
        t.push(<TreeNode
            key={`${t.length}-node-${nodeTitle(n)}`}
            prefix={prefix}
            title={nodeTitle(n)}
            hasChildNodes={Boolean(n.children?.size)}
            result={isTestFunctionStack(n) && <FunctionStatusIcon node={n} bold={true} />}
            isLast={!next}
            bold={n === node}
            color={hasError(n, instance)? 'redBright' : undefined}
        />)
        if (next) {
            const isLast = !next.nextSibling
            epilog.push(<TreeNode
                key={`${t.length}-next-${nodeTitle(next)}`}
                prefix={prefix}
                title={nodeTitle(next)}
                hasChildNodes={Boolean(next.children?.size)}
                result={isTestFunctionStack(next) && <FunctionStatusIcon node={next} {...dimProps}/>}
                isLast={isLast}
                {...dimProps}
            />)
        }
        prefix += next ? '│' : ' '
    }

    return t.concat(epilog.reverse())
}
