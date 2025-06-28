import type { SessionData, SessionStorage } from '@remix-run/node'
import { createCookieSessionStorage, redirect } from '@remix-run/node'

export type WizardData = {
	[key: string]: any
}

export type WizardRegisterResponse<T = WizardData> = {
	data: T
	session: SessionData
	storage: SessionStorage<SessionData, SessionData>
	getHeaders: () => Promise<Headers>
	save: (key: string, data: T[keyof T]) => void
	nextStep: () => Promise<Response>
	prevStep: () => Promise<Response>
	jumpToStep: (jumpTo: number | string) => Promise<Response>
	destroy: () => Promise<Headers>
	hasData: () => boolean
	currentStep: number | null
	routes: string[]
}

export type WizardConfig = {
	name: string
	routes: string[]
	storage?: SessionStorage<SessionData, SessionData>
	onStepChange?: (currentStep: number, nextStep: number) => void
	validateStep?: (stepData: any, currentStep: number) => boolean
}

export const createWizard = <T extends WizardData>(config: WizardConfig) => {
	let { storage } = config
	const { name, routes, onStepChange, validateStep } = config

	if (!storage) {
		storage = createCookieSessionStorage({
			cookie: {
				name,
				sameSite: 'lax',
				path: '/',
				httpOnly: true,
				secrets: process.env.SESSION_SECRET.split(','),
				secure: process.env.NODE_ENV === 'production',
				// Optionally add other cookie options like maxAge, domain, etc.
			},
		})
	}

	const getStepFromUrl = (urlString: string): number | null => {
		try {
			const url = new URL(urlString)
			const pathname = url.pathname
			const step = routes.findIndex(stepUrl => pathname === stepUrl)
			return step !== -1 ? step : null
		} catch (error) {
			console.error('Invalid URL:', urlString)
			return null
		}
	}

	return {
		register: async (request: Request): Promise<WizardRegisterResponse<T>> => {
			const cookie = request.headers.get('cookie')
			const session = await storage.getSession(cookie)
			const data = session.data || ({} as T)

			const getHeaders = async () => {
				const headers = new Headers()
				headers.append('set-cookie', await storage.commitSession(session))
				return headers
			}

			const save = (key: string, value: T[keyof T]) => {
				session.set(key, value)
			}

			const currentStep = getStepFromUrl(request.url)

			const nextStep = async () => {
				if (currentStep === null) {
					throw new Error('Cannot navigate to next step from a non-step URL.')
				}

				const headers = new Headers()
				headers.append('set-cookie', await storage.commitSession(session))

				if (currentStep + 1 >= routes.length) {
					throw new Error('Already at the last step.')
				}

				if (validateStep && !validateStep(data, currentStep)) {
					throw new Error('Validation failed for the current step.')
				}

				if (onStepChange) {
					onStepChange(currentStep, currentStep + 1)
				}

				return redirect(routes[currentStep + 1], { headers })
			}

			const prevStep = async () => {
				if (currentStep === null) {
					throw new Error(
						'Cannot navigate to previous step from a non-step URL.',
					)
				}

				const headers = new Headers()
				headers.append('set-cookie', await storage.commitSession(session))

				if (currentStep - 1 < 0) {
					throw new Error('Already at the first step.')
				}

				if (onStepChange) {
					onStepChange(currentStep, currentStep - 1)
				}

				return redirect(routes[currentStep - 1], { headers })
			}

			const jumpToStep = async (jumpTo: string | number) => {
				if (currentStep === null) {
					throw new Error('Cannot jump steps from a non-step URL.')
				}

				const headers = new Headers()
				headers.append('set-cookie', await storage.commitSession(session))
				const targetStep =
					typeof jumpTo === 'string' ? getStepFromUrl(jumpTo) : jumpTo

				if (
					targetStep === null ||
					targetStep < 0 ||
					targetStep >= routes.length
				) {
					throw new Error(`Invalid step number: ${targetStep}`)
				}

				if (onStepChange) {
					onStepChange(currentStep, targetStep)
				}

				return redirect(routes[targetStep], { headers })
			}

			const destroy = async () => {
				const headers = new Headers()
				headers.append('set-cookie', await storage.destroySession(session))
				return headers
			}

			const hasData = () => {
				return Object.keys(data).length > 0
			}

			return {
				data: data as T,
				session,
				storage,
				getHeaders,
				save,
				nextStep,
				prevStep,
				jumpToStep,
				destroy,
				hasData,
				currentStep,
				routes,
			}
		},
	}
}
