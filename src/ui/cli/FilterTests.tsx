import React from 'react'
import { Box, Text } from 'ink'
import { useTester } from '../TesterContext'
import { useSubscribers } from './useSubscribers'
import { InputField, useStringInput, Value } from './Input'
import { useRouter } from './Router'
import { Block, Element } from './Blocks'
import { Key } from './Key'

export function FilterTestsValue() {
    const tester = useTester()
    useSubscribers([
        r => tester.addListener('option', e => {
            if (e.key === 'filterTests') {
                r()
            }
        }),
    ], [tester])

    return <Value>{getRegexpSource(tester.filterTests.get())}</Value>
}

export function FilterTestsInput() {
    const tester = useTester()
    useSubscribers([
        r => tester.addListener('option', e => {
            if (e.key === 'filterTests') {
                r()
            }
        }),
    ], [tester])

    const { navigate } = useRouter()

    const input = useStringInput(getRegexpSource(tester.filterTests.get()), {
        onChange: v => {
            try {
                tester.filterTests.set(setRegexpSource(v))
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
                <InputField title="Tests filter" {...input} />
            </Element>
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
    return r?.source.replaceAll(/\\(.)/g, '$1') ?? ''
}

function setRegexpSource(s: string) {
    return s ? new RegExp(s.replaceAll('/', '\\/')) : undefined
}
