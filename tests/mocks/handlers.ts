import { type HttpHandler } from 'msw'
import { handlers as resendHandlers } from './resend'

export const handlers: Array<HttpHandler> = [...resendHandlers]

console.info('🔶 Mock server installed')
