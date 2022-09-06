import {createServer, IncomingMessage, ServerResponse} from 'http'
import { OutputFilesMap } from '../builder'
import { EventEmitter } from '../event'

type HttpFileServerEventMap = {
    connection: {
        request: IncomingMessage
        response: ServerResponse
    }
}

export class HttpFileServer {
    constructor(
        port = 0,
        host = '127.0.0.1',
    ) {
        this._url = new Promise<URL>((res, rej) => {
            this.server.listen(port, host, () => {
                const url = this.getUrl()
                if (url) {
                    res(url)
                } else {
                    rej()
                }
            })
            this._server.on('error', e => {
                rej(e)
                throw e
            })
            this._server.on('close', () => {
                this._url = Promise.reject('Server is already closed.')
            })
        })
    }
    private _server = createServer((req, res) => {
        if (req.method === 'GET') {
            const subpath = req.url?.startsWith('/') ? req.url.substring(1) : undefined
            const file = subpath && this.files.get(subpath)
            if (file) {
                const queryPos = subpath.indexOf('?')
                const filename = subpath.substring(0, queryPos >= 0 ? queryPos : undefined)
                if (filename.endsWith('.js')) {
                    res.setHeader('Content-Type', 'text/javascript')
                }
                res.end(file.content)
            } else {
                res.writeHead(404, 'Not Found')
                res.end()
            }
        } else {
            res.writeHead(501, 'Method not implemented')
            res.end()
        }

        this.emitter.dispatch('connection', {
            request: req,
            response: res,
        })
    })
    private _url: Promise<URL>

    get server() {
        return this._server
    }
    get url() {
        return this._url
    }
    
    readonly emitter = new EventEmitter<HttpFileServerEventMap>()

    files: OutputFilesMap = new Map()

    private getUrl() {
        const addr = this._server.address()
        if (!addr) {
            return
        } else if (typeof addr === 'string') {
            return new URL(addr)
        }
        return new URL(`http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}/`)
    }
}
