import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { useTester } from '../TesterContext'
import { useSubscribers } from './useSubscribers'
import { InputField, useStringInput, Value } from './Input'
import { useRouter } from './Router'
import { Block, Element } from './Blocks'
import { Key } from './Key'

export function FilterSuitesValue() {
    const tester = useTester()
    useSubscribers([
        r => tester.addListener('option', e => {
            if (e.key === 'filterSuites') {
                r()
            }
        }),
    ], [tester])

    return <Value>{getRegexpSource(tester.filterSuites.get())}</Value>
}

export function FilterSuitesInput() {
    const tester = useTester()
    useSubscribers([
        () => tester.addListener('option', e => {
            if (e.key === 'filterSuites') {
                setFilter(e.value)
            }
        }),
    ], [tester])

    const { navigate } = useRouter()

    const [filter, setFilter] = useState(tester.filterSuites.get())
    const input = useStringInput(getRegexpSource(tester.filterSuites.get()), {
        onInput: v => {
            try {
                setFilter(setRegexpSource(v))
            } catch {
                //
            }
        },
        onChange: v => {
            try {
                tester.filterSuites.set(setRegexpSource(v))
            } catch {
                return false
            }
        },
        onEscape: () => navigate('/'),
    })

    return <Box
        justifyContent="space-between"
        flexWrap="wrap"
        columnGap={5}
        rowGap={2}
    >
        <Block>
            <Element
                justifyContent="space-between"
                marginBottom={1}
            >
                <InputField title="Suites filter" {...input}/>
            </Element>
            {Array.from(tester.getTestFiles()).map(({url, title}) => {
                if (filter && !filter.test(title)) {
                    return null
                }

                return <Element key={url}>
                    <Text>{title}</Text>
                </Element>
            })}
        </Block>
        <Block>
            <Element>
                <Key>{['Shift', 'Del']}</Key>
                <Text> Clear</Text>
            </Element>
            <Element>
                <Key>Esc</Key>
                <Text> Reset/Go back</Text>
            </Element>
            <Element>
                <Key>Enter</Key>
                <Text> Confirm</Text>
            </Element>
        </Block>
    </Box>
}

function getRegexpSource(r: RegExp | undefined) {
    return r?.source.replaceAll('\\/', '/') ?? ''
}

function setRegexpSource(s: string) {
    return s ? new RegExp(s.replaceAll('/', '\\/')) : undefined
}
