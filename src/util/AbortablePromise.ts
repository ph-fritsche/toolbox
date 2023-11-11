// TODO: Replace with built-in when it's available in docker images
// import { addAbortListener } from 'node:events'
function addAbortListener(signal: AbortSignal, cb: (e: Event) => void) {
    signal.addEventListener('abort', cb, {once: true})
    return {
        [Symbol.dispose]: () => signal.removeEventListener('abort', cb),
    }
}

export type AbortablePromiseExecutor<T> = (
    resolve: (value: T) => void,
    reject: (reason: unknown) => void,
    onTeardown: (cb: (reason?: unknown) => void|PromiseLike<void>) => void,
) => void

export class AbortablePromise<T> implements Promise<T>, AbortController {
    constructor(
        protected abortController: AbortController,
        executor: AbortablePromiseExecutor<T>,
    ) {
        this.promise = new Promise<T>((resolve, reject) => {
            let disposable: Disposable
            void new Promise<T>((res, rej) => {
                if (abortController.signal.aborted) {
                    return rej(abortController.signal)
                }

                disposable = addAbortListener(abortController.signal, () => rej(abortController.signal))

                try {
                    executor(res, rej, cb => this.teardownCallbacks.add(cb))
                } catch(r) {
                    rej(r)
                }
            })
                .finally(() => disposable[Symbol.dispose]())
                .then(
                    value => this.teardown(value),
                    reason => this.teardown(undefined, reason),
                ).then(
                    value => resolve(value),
                    reason => reject(reason),
                )
        })
    }
    protected promise: Promise<T>
    protected teardownCallbacks = new Set<(reason?: unknown) => void|PromiseLike<void>>()

    protected teardown(value: T): Promise<T>
    protected teardown(value: undefined, reason: unknown): Promise<T>
    protected async teardown(value?: T, reason?: unknown) {
        let reject = arguments.length > 1, rejectReason = reason

        const teardownPromises: Promise<void>[] = []
        for (const cb of this.teardownCallbacks.values()) {
            teardownPromises.push(
                (async () => {
                    await (arguments.length > 1 ? cb(reason) : cb())
                })().catch(r => {
                    if (!reject) {
                        reject = true
                        rejectReason = r
                    }
                }),
            )
        }
        await Promise.allSettled(teardownPromises)

        if (reject) {
            throw rejectReason
        }
        return value
    }

    get then() {
        return this.promise.then.bind(this.promise)
    }
    get catch() {
        return this.promise.catch.bind(this.promise)
    }
    get finally() {
        return this.promise.finally.bind(this.promise)
    }
    get abort() {
        return this.abortController.abort.bind(this.abortController)
    }
    get signal() {
        return this.abortController.signal
    }

    get [Symbol.toStringTag]() {
        return AbortablePromise.name
    }
}
