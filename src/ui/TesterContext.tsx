import { createProvidedContext } from '../util/react/context'
import { Tester } from './Tester'

export const TesterContext = createProvidedContext<Tester>('TesterContext')

export const useTester = TesterContext.useContext
