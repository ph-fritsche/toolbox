import React from 'react'
import { Box, Text, TextProps } from 'ink'
import { isTestFunctionStack, isTestGroupStack, TestHook, TestNodeStack, TestResultType, TestRunInstance, TestRunStack, TestSuite, TestSuiteStack } from '../../conductor/TestRun'
import { useSubscribers } from './useSubscribers'
import { TestGroup, TestGroupStack } from '../../conductor/TestRun/TestGroup'
import { FunctionStatusIcon, InstanceStatusIcon } from './StatusIcons'
import { hasError } from './helper'
import { Block, Line, OverflowX } from './Blocks'
import { TestFunctionStack } from '../../conductor/TestRun/TestFunction'
import { Scrollable } from './Scrollable'
import { NodeConductor } from './Node'
import { XErrorComponent } from './Error'
import { TestElementStack } from '../../conductor/TestRun/TestElement'

export function RunTree({
    run,
    printErrors = false,
    scrollable = false,
}: {
    run: TestRunStack
    printErrors?: boolean
    scrollable?: boolean
}) {
    const content = Array.from(run.suites.values())
        .toSorted((a, b) => a.title === b.title ? 0 : a.title < b.title ? -1 : 1)
        .map(s => <SuiteTree
            key={s.url}
            suite={s}
            printErrors={printErrors}
        />)

    return scrollable && content
        ? <Scrollable>{content}</Scrollable>
        : <OverflowX>{content}</OverflowX>
}

function SuiteTree({
    suite,
    printErrors,
}: {
    suite: TestSuiteStack,
    printErrors: boolean,
}) {
    useSubscribers([
        r => suite.addListener('schedule', r),
        r => suite.addListener('error', r),
    ], [suite])

    return <Block key={suite.url}>
        <Line>
            <Text color="grey">[</Text>
            {Array.from(suite.instances).map(([, instance], i) => (
                <InstanceStatusIcon
                    key={i}
                    node={instance}
                />
            ))}
            <Text color="grey">] </Text>
            <Text>{suite.title}</Text>
        </Line>
        {printErrors && <ErrorsTree node={suite}/>}
        {Array.from(suite.children).map(([child, ident], i, a) => (
            <ElementTree
                key={ident}
                node={child}
                isLast={i === a.length - 1}
                printErrors={printErrors}
            />
        ))}
    </Block>
}

function ErrorsTree({
    node,
    prefix = '',
}: {
    node: TestGroupStack | TestSuiteStack
    prefix?: string
}) {
    useSubscribers([
        r => node.addListener('error', r),
    ], [node])

    let hasErrors = false
    return <>
        {Array.from<TestGroup|TestSuite>(node.instances.values()).map((nodeInstance, i) => {
            if (!nodeInstance.errors.count) {
                return null
            }
            hasErrors = true

            return <Block key={`nodeInstance-${i}`}>
                <Line>
                    <Text color="redBright" bold>!</Text>
                    <NodeConductor node={nodeInstance}/>
                </Line>
                {Array.from(nodeInstance.errors.grouped()).map((errorIterator, i) => {
                    const errors = Array.from(errorIterator)
                    const error = errors[0]

                    return <React.Fragment key={i}>
                        {error.hook && (
                            <Line>
                                <Prefix dimColor>╎ </Prefix>
                                <Text>{describeHook(error.hook)}</Text>
                            </Line>
                        )}
                        <XErrorComponent
                            error={error}
                            border
                        />
                        {(errors.length > 1) && (
                            <Line>
                                <Prefix dimColor>╰ </Prefix>
                                <Text color="grey">+{errors.length - 1}</Text>
                            </Line>
                        )}
                    </React.Fragment>
                })}
            </Block>
        })}
        {hasErrors && (
            <Line>
                <Prefix>{prefix + (node.children.size ? '│' : '')}</Prefix>
            </Line>
        )}
    </>
}

function describeHook(hook: TestHook) {
    return [
        hook.cleanup && 'cleanup of',
        'hook',
        `${hook.type}#${hook.index}`,
        hook.name,
    ].filter(Boolean).join(' ')
}

function ElementTree({
    node,
    prefix = '',
    isLast = false,
    printErrors = false,
}: {
    node: TestElementStack,
    prefix?: string,
    isLast?: boolean,
    printErrors?: boolean,
}) {
    return <Block>
        <TreeNode
            prefix={prefix}
            title={node.title}
            hasChildNodes={Boolean(node.children?.size)}
            result={isTestFunctionStack(node) && <FunctionStatusIcon node={node} />}
            isLast={isLast}
        />
        {printErrors && isTestGroupStack(node) && (
            <ErrorsTree
                node={node}
                prefix={prefix + (isLast ? ' ' : '|')}
            />
        )}
        {printErrors && isTestFunctionStack(node) && (
            <ResultTree
                node={node}
                prefix={prefix}
                isLast={isLast}
            />
        )}
        {Array.from(node.children ?? []).map(([child, ident], i, a) => {
            return <ElementTree
                key={ident}
                node={child as TestElementStack}
                prefix={prefix + (isLast ? ' ' : '│')}
                isLast={i === a.length - 1}
                printErrors={printErrors}
            />
        })}
    </Block>
}

function ResultTree({
    node,
    prefix,
    isLast,
}: {
    node: TestFunctionStack,
    prefix: string,
    isLast: boolean,
}) {
    useSubscribers([
        r => node.addListener('result', r),
    ], [node])

    switch (node.resultType) {
    case undefined:
    case TestResultType.success:
    case TestResultType.skipped:
        return false
    }

    return <Block>
        {Array.from(node.instances.values()).map((instance, i) => {
            const error = instance.result.get()?.error
            return <React.Fragment key={i}>
                <Line>
                    <FunctionStatusIcon node={instance}/>
                    <NodeConductor node={instance}/>
                </Line >
                {error && <XErrorComponent error={error} border/>}
            </React.Fragment>
        })}
        <Line>
            <Prefix>{prefix + (isLast ? ' ' : '│')}</Prefix>
        </Line>
    </Block>
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
