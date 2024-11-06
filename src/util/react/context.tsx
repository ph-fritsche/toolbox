import React, { createContext, useContext } from 'react'

// eslint-disable-next-line @typescript-eslint/ban-types
export function createProvidedContext<T extends {}>(displayName = 'ProvidedContext') {
    const context = createContext<T | undefined>(undefined)
    context.displayName = displayName

    return {
        Provider: context.Provider as React.Provider<T>,
        Consumer: <R extends React.ReactNode>({ children }: { children: (context: T) => R }) =>
            <context.Consumer>{c => children(validateProvidedValue(c, context.displayName))}</context.Consumer>,
        useContext: () => useProvidedContext(context),
        displayName,
    }
}

export function useProvidedContext<T>(context: React.Context<T | undefined>) {
    return validateProvidedValue(useContext(context), context.displayName)
}

function validateProvidedValue<T>(value: T | undefined, displayName?: string) {
    if (value === undefined) {
        throw Error(`This component must be placed inside a Provider for ${
            displayName ? `"${displayName}"` : 'unnamed context'
        }`)
    }
    return value
}
