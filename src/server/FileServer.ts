import { EventEmitter } from '../event'
import { FileProvider } from '../files'

export type FileServerEventMap = unknown

export abstract class FileServer<EventMap extends FileServerEventMap = FileServerEventMap> {
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
