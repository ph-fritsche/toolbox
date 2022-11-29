const listeners = process.listeners('warning')

process.removeAllListeners('warning')

process.prependListener('warning', (warning) => {
    if (warning.name !== 'ExperimentalWarning') {
        listeners[0](warning)
    }
})
