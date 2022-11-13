import { EventEmitter } from '../event'
import { FileProvider } from './FileProvider'

export type FileServerEventMap = {
}

export abstract class FileServer<EventMap extends FileServerEventMap = FileServerEventMap> {
    constructor(
        public provider: FileProvider,
    ) {
    }

    protected _url: Promise<URL> = new SafeRejectedPromise('FileServer is not initialized.')
    get url() {
        return this._url
    }

    readonly emitter = new EventEmitter<EventMap>()
}

class SafeRejectedPromise<T> implements Promise<T> {
    constructor(
        private readonly reason: unknown,
    ) {}

    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined): Promise<TResult1 | TResult2> {
        return Promise.reject(this.reason).then(onfulfilled, onrejected)
    }

    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined): Promise<T | TResult> {
        return Promise.reject(this.reason).catch(onrejected)
    }

    finally(onfinally?: (() => void) | null | undefined): Promise<T> {
        return Promise.reject(this.reason).finally(onfinally)
    }

    get [Symbol.toStringTag]() {
        return 'SafeRejectedPromise'
    }
}
