import React from 'react'
import { render, Instance, Static } from 'ink'
import './chalkWorkaround'
import { Tester } from '../Tester'
import { TesterContext } from '../TesterContext'
import { Main } from './Main'
import { createProvidedContext } from '../../util/react/context'
import { Router } from './Router'
import { CurrentRun } from './CurrentRun'
import { RunTree } from './Tree'
import { Block } from './Blocks'
import { RunInstanceStats, RunStats } from './RunStats'
import { Log } from './Log'

export class TesterCli {
    constructor(
        readonly tester: Tester,
        readonly interactive = !process.env.CI,
    ) {}

    #instance?: Instance

    get isFullscreen() {
        return this.alternativeBuffer
    }

    protected getInteractiveTree = () => (
        <TesterContext.Provider value={this.tester}>
            <TesterCliContext.Provider value={this}>
                <Router>
                    <Main />
                </Router>
            </TesterCliContext.Provider>
        </TesterContext.Provider>
    )
    protected getStatusTree = () => (
        <TesterContext.Provider value={this.tester}>
            <TesterCliContext.Provider value={this}>
                <CurrentRun fallback={null}>{run => (
                    <Log run={run}/>
                )}</CurrentRun>
            </TesterCliContext.Provider>
        </TesterContext.Provider>
    )
    protected getFinalTree = () => (
        <TesterContext.Provider value={this.tester}>
            <TesterCliContext.Provider value={this}>
                <CurrentRun fallback={null}>{run => (
                    // Wrapping in <Static> prevents Ink from clearing the console
                    // if the output height is bigger than the console height.
                    <Static items={[null]}>{() => (<React.Fragment key="root">
                        <Block height={1} />
                        <RunTree run={run} printErrors/>
                        <Block height={2} />
                        <RunStats run={run}/>
                        <Block height={1} />
                        <RunInstanceStats run={run}/>
                        <Block height={1} />
                    </React.Fragment>)}</Static>
                )}</CurrentRun>
            </TesterCliContext.Provider>
        </TesterContext.Provider>
    )

    async open() {
        if (this.#instance) {
            throw new Error('Already open')
        }

        if (this.interactive) {
            await this.enableAlternativeBuffer()
        }

        this.#instance = render((
            this.interactive ? this.getInteractiveTree() : this.getStatusTree()
        ), {
            exitOnCtrlC: false,
        })

        if (!this.interactive) {
            await this.tester.start()
            await this.close()
        }
    }

    async close(
        rerenderOnMainBuffer = false,
    ) {
        await this.tester.stop()

        // While switching to alternative buffer after the instance has been mounted works fine,
        // returning to the main buffer with mounted instance breaks the restoring of the shell.
        // Therefore unmount here and mount a new instance if output on the main buffer is desired.
        this.#instance?.unmount()

        if (this.interactive) {
            await this.disableAlternativeBuffer()
        }

        if (!this.interactive || rerenderOnMainBuffer) {
            this.#instance = render(this.getFinalTree(), {
                exitOnCtrlC: false,
            })
        }

        this.#instance?.unmount()
        this.#instance = undefined

        for (const f of this.#onClose) {
            await f()
        }
    }

    #onClose = new Set<() => void | PromiseLike<void>>()
    onClose(cb: () => void | PromiseLike<void>) {
        this.#onClose.add(cb)
    }

    private alternativeBuffer = false
    protected enableAlternativeBuffer = () => new Promise<void>((res, rej) => {
        if (this.alternativeBuffer) {
            return res()
        }
        this.alternativeBuffer = true

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        process.on('exit', this.disableAlternativeBuffer)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        process.on('SIGINT', this.disableAlternativeBuffer)

        process.stdout.write('\x1b[?1049h', err => err ? rej(err) : res())
    })
    protected disableAlternativeBuffer = () => new Promise<void>((res, rej) => {
        if (!this.alternativeBuffer) {
            return res()
        }
        this.alternativeBuffer = false

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        process.off('exit', this.disableAlternativeBuffer)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        process.off('SIGINT', this.disableAlternativeBuffer)

        process.stdout.write('\x1b[?1049l', err => err ? rej(err) : res())
    })
}

const TesterCliContext = createProvidedContext<TesterCli>('TesterCli')

export const useTesterCli = TesterCliContext.useContext
