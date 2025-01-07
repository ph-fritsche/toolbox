import { pathToFileURL } from 'node:url'
import { SourceLocation, SourceLocationResolver } from './ErrorStackResolver'
import { spawn } from 'node:child_process'

export class GitHubResolver implements SourceLocationResolver {
    constructor(
        readonly GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE,
        readonly GITHUB_SHA = process.env.GITHUB_SHA,
        readonly GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY,
        readonly GITHUB_SERVER_URL = process.env.GITHUB_SERVER_URL,
    ) {
        if (GITHUB_WORKSPACE) {
            this.workspaceUrl = String(pathToFileURL(GITHUB_WORKSPACE))
            if (!this.workspaceUrl.endsWith('/')) {
                this.workspaceUrl += '/'
            }
        }
    }

    protected workspaceUrl?: string
    protected resolvedWorkspaceUrl?: Promise<string>
    protected treeObjects?: Promise<string[]>

    async resolve(loc: SourceLocation): Promise<SourceLocation | undefined> {
        if (!this.workspaceUrl || !loc.file?.startsWith(this.workspaceUrl)) {
            return undefined
        }
        const path = loc.file.substring(this.workspaceUrl.length)

        if (!this.resolvedWorkspaceUrl) {
            this.resolvedWorkspaceUrl = this.getGitAbbrevSha()
                .then(abbrev => [
                    this.GITHUB_SERVER_URL,
                    this.GITHUB_REPOSITORY,
                    'blob',
                    abbrev,
                ].join('/'))
        }
        if (!this.treeObjects) {
            this.treeObjects = this.getGitTreeObjects()
        }
        const resolvedUrl = await this.resolvedWorkspaceUrl
        const tree = await this.treeObjects

        if (tree.includes(path)) {
            return {...loc,
                url: resolvedUrl + '/' + path + (loc.position ? `#L${loc.position.line}` : ''),
            }
        }
    }

    protected getGitAbbrevSha(): Promise<string> {
        return this.runGitCmd([
            'rev-parse',
            '--short',
            'HEAD',
        ])
    }

    protected async getGitTreeObjects(): Promise<string[]> {
        const out = await this.runGitCmd([
            'ls-tree',
            '--name-only',
            '-r',
            'HEAD',
        ])
        return out.split('\n')
    }

    protected runGitCmd(args: string[]): Promise<string> {
        if (!this.GITHUB_WORKSPACE) {
            return Promise.reject(`GITHUB_WORKSPACE is not set.`)
        }

        return new Promise((res, rej) => {
            const child = spawn('git', args, {
                cwd: this.GITHUB_WORKSPACE,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            let out = '', err = ''
            child.stdout.on('data', c => {
                out += String(c)
            })
            child.stderr.on('data', c => {
                err += String(c)
            })
            child.on('exit', (code, signal) => {
                if (code || signal) {
                    rej(`Git command failed: ${JSON.stringify(args)}\n` + err)
                } else {
                    res(out.trimEnd())
                }
            })
        })
    }
}
