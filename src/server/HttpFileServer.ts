import {createServer, IncomingMessage, ServerResponse} from 'http'
import { FileProvider } from './FileProvider'
import { FileServer, FileServerEventMap } from './FileServer'
import { getEventDispatch } from '../event'

type HttpFileServerEventMap = FileServerEventMap & {
    connection: {
        request: IncomingMessage
        response: ServerResponse
    }
}

export class HttpFileServer extends FileServer<HttpFileServerEventMap> {
    constructor(
        provider: FileProvider,
        port = 0,
        host = '127.0.0.1',
    ) {
        super(provider)
        this.listen(port, host)
    }
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    readonly server = createServer(async (req, res) => {
        if (req.method === 'GET') {
            const [subpath] = (req.url?.startsWith('/') ? req.url.substring(1) : '').split(':')
            const file = subpath ? this.provider.getFile(subpath) : Promise.reject()
            await file.then(
                ({content}) => {
                    const queryPos = subpath.indexOf('?')
                    const filename = subpath.substring(0, queryPos >= 0 ? queryPos : undefined)
                    if (filename.endsWith('.js')) {
                        res.setHeader('Content-Type', 'text/javascript')
                    }
                    res.setHeader('Access-Control-Allow-Origin', '*')
                    res.end(content)
                },
                () => {
                    res.writeHead(404, 'Not Found')
                    res.end()
                },
            )
        } else {
            res.writeHead(501, 'Method not implemented')
            res.end()
        }

        this.dispatch('connection', {
            request: req,
            response: res,
        })
    })
    protected readonly dispatch = getEventDispatch(this.emitter)

    private getUrl() {
        const addr = this.server.address()
        if (!addr) {
            return
        } else if (typeof addr === 'string') {
            return new URL(addr)
        }
        return new URL(`http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}/`)
    }

    listen(
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
            this.server.on('error', e => {
                rej(e)
                throw e
            })
            this.server.on('close', () => {
                this._url = 'Server has already been closed.'
            })
        })
    }

    close() {
        return this.url
            .then(
                () => new Promise<void>((res, rej) => this.server.close(e => (e ? rej(e) : res()))),
                (): void => void 0,
            )
    }
}
