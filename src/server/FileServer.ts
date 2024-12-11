import { EventEmitter } from '../event'
import { FileProvider } from '../files'

export type FileServerEventMap = {[k: string]: object|null|undefined}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Latest Typescript versions report an error for declaration mismatch on the protected properties
export abstract class FileServer<EventMap extends FileServerEventMap = any> {
    constructor(
        public provider: FileProvider,
    ) {
    }

    protected _url: Promise<URL>|string = 'FileServer is not initialized.'
    get url() {
        return typeof this._url === 'string' ? Promise.reject(this._url) : this._url
    }

    readonly emitter = new EventEmitter<EventMap>()

    async close() {
        // close pointers
    }
}
