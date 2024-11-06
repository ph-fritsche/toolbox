import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useTester } from '../TesterContext'
import { RunStats } from './RunStats'
import { useWindowSize } from './useWindowSize'
import { useTesterCli } from './TesterCli'
import { useSubscribers } from './useSubscribers'
import { Route, Routes, useRouter } from './Router'
import { FilterSuitesInput, FilterSuitesValue } from './FilterSuites'
import { FilterTestsInput, FilterTestsValue } from './FilterTests'
import { WatchedFiles } from './WatchedFiles'
import { RunTree } from './Tree'
import { ConductorsSelect } from './Conductors'
import { Errors } from './Errors'
import { Key } from './Key'
import { Results } from './Results'
import { Element } from './Blocks'
import { CurrentRun } from './CurrentRun'

export function Main() {
    const cli = useTesterCli()

    useInput((input, key) => {
        if (key.ctrl && !key.shift) {
            if (input.toLowerCase() === 'c') {
                return void cli.close()
            } else if (input.toLowerCase() === 'q') {
                return void cli.close(true)
            }
        }
    })

    const {height} = useWindowSize()

    return <Box
        flexDirection="column"
        height={height}
    >
        <Routes>
            <Route path="settings/filterSuites">
                <FilterSuitesInput/>
            </Route>
            <Route path="settings/filterTests">
                <FilterTestsInput/>
            </Route>
            <Route path="conductors">
                <ConductorsSelect/>
            </Route>
            <Route path="watchedFiles">
                <WithEscape>
                    <WatchedFiles/>
                </WithEscape>
            </Route>
            <Route path="currentRun/tree">
                <WithEscape>
                    <CurrentRun>{run => (
                        <RunTree run={run} scrollable/>
                    )}</CurrentRun>
                </WithEscape>
            </Route>
            <Route path="currentRun/errors">
                <WithEscape>
                    <CurrentRun>{run => (
                        <Errors run={run}/>
                    )}</CurrentRun>
                </WithEscape>
            </Route>
            <Route path="currentRun/results">
                <WithEscape>
                    <CurrentRun>{run => (
                        <Results run={run}/>
                    )}</CurrentRun>
                </WithEscape>
            </Route>
            <Route path="">
                <Index/>
            </Route>
        </Routes>
    </Box>
}

function WithEscape({
    children,
}: React.PropsWithChildren) {
    const { navigate } = useRouter()
    useInput((input, key) => {
        if (key.escape) {
            navigate('/')
        }
    })

    return children
}

function Index() {
    const tester = useTester()

    useSubscribers([
        r => tester.addListener('state', r),
        r => tester.addListener('option', r),
        r => tester.addListener('newRun', r),
    ], [
        tester,
    ])
    const { navigate } = useRouter()

    const run = tester.newestRun

    useInput((input, key) => {
        if (key.ctrl) {
            return
        }
        if (input.toLowerCase() === 's') {
            if (tester.active) {
                void tester.stop()
            } else {
                void tester.start()
            }
        } else if (input.toLowerCase() === 'w') {
            navigate('/watchedFiles')
        } else if (input.toLowerCase() === 'c') {
            navigate('/conductors')
        } else if (input.toLowerCase() === 'f') {
            navigate('/settings/filterSuites')
        } else if (input.toLowerCase() === 't') {
            navigate('/settings/filterTests')
        }
        if (run) {
            if (key.return) {
                navigate('/currentRun/tree')
            } else if (key.tab) {
                navigate('/currentRun/errors')
            } else if (input === ' ') {
                navigate('/currentRun/results')
            }
        } else if(key.return) {
            void tester.start()
        }
    })

    return <>
        <Element>
            <Key>S</Key>
            <Text> Tester status: </Text>
            <TesterStatus/>
        </Element>
        <Element>
            <Key>W</Key>
            <Text> Watched files</Text>
        </Element>
        <Element>
            <Key>C</Key>
            <Text> Conductors</Text>
        </Element>
        <Element>
            <Key>F</Key>
            <Text> Suites filter: </Text>
            <FilterSuitesValue/>
        </Element>
        <Element>
            <Key>T</Key>
            <Text> Tests filter: </Text>
            <FilterTestsValue />
        </Element>
        <Box height={1} />
        {run
            ? (<>
                <Element>
                    <Key>Enter</Key>
                    <Text> Show Tree</Text>
                </Element>
                <Element>
                    <Key>Tab</Key>
                    <Text> Walk through errors</Text>
                </Element>
                <Element>
                    <Key>Space</Key>
                    <Text> Walk through results</Text>
                </Element>
                <Box height={1} />
                <RunStats run={run}/>
                <Box height={1} />
                <Element>
                    <Key>{['Ctrl', 'Q']}</Key>
                    <Text> Print results and exit</Text>
                </Element>
            </>)
            : (<>
                <Element>
                    <Key>Enter</Key>
                    <Text> Start tester</Text>
                </Element>
            </>)
        }
        <Element>
            <Key>{['Ctrl', 'C']}</Key>
            <Text> Exit</Text>
        </Element>
    </>
}

function TesterStatus() {
    const tester = useTester()
    const run = tester.newestRun

    useSubscribers([
        r => tester.addListener('state', r),
        r => tester.addListener('newRun', r),
        r => run?.addListener('start', r),
        r => run?.addListener('done', r),
    ], [
        tester,
        run,
    ])

    if (!tester.active) {
        return <Text backgroundColor="redBright">{' ⏹ Stopped '}</Text>
    } else if (!run?.index.suites.running.size) {
        return <Text backgroundColor="green">{' ⏸ Ready '}</Text>
    } else {
        return <Text backgroundColor="greenBright">{' ▶ Active '}</Text>
    }
}
