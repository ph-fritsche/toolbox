import process from 'node:process'

const hasExperimentalMetaResolve = import.meta.resolve('./some.js') !== import.meta.resolve('./foo.js', 'http://localhost/bar.js')

if (hasExperimentalMetaResolve && process.env.CI && process.env.GITHUB_ACTIONS && process.stdout.isTTY === undefined) {
    const chalkUrl = await (async () => {
        const inkUrl = await import.meta.resolve('ink')
        return import.meta.resolve('chalk', inkUrl)
    })()
    const {default: chalk} = await import(chalkUrl)

    chalk.level = 3
}
