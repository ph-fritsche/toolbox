import { promise } from './promise'

export class Trigger<T> {
    constructor(
        public callback: () => Promise<T>,
        public debounce?: number,
    ) {}

    protected current?: Promise<T>
    protected next?: Promise<T>
    protected debouncePromise?: ReturnType<typeof promise<void>>
    protected debounceTimeout?: NodeJS.Timeout|number

    protected triggerI = 0
    activate(): Promise<T> {
        if (this.debounce !== undefined) {
            globalThis.clearTimeout(this.debounceTimeout)
            if (!this.debouncePromise) {
                this.debouncePromise = promise<void>()
            }
            this.debounceTimeout = globalThis.setTimeout(() => {
                this.debouncePromise?.resolve()
                delete this.debouncePromise
            }, this.debounce)
        }

        if (this.next) {
            return this.next
        }

        const next = async () => {
            // this.next is not be assigned until the first await
            await this.debouncePromise?.Promise
            delete this.debouncePromise

            this.current = this.next
            delete this.next

            try {
                return await this.callback()
            } finally {
                delete this.current
            }
        }

        if (this.current) {
            return this.next = this.current.then(next, next)
        } else {
            return this.next = next()
        }
    }
}
