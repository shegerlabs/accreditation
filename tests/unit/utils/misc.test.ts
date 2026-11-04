/**
 * Unit tests for app/utils/misc.tsx
 *
 * Tests the pure utility functions and React hooks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	cn,
	getErrorMessage,
	getDomainUrl,
	getReferrerRoute,
	mergeHeaders,
	combineHeaders,
	combineResponses,
	invariantResponse,
	invariant,
	getAttachmentFileSrc,
	getParticipantDocumentFileSrc,
	useIsPending,
	useDelayedIsPending,
	useDoubleCheck,
	useDebounce,
	downloadFile,
	logger,
} from '~/utils/misc'

// Mock Remix hooks
const mockUseFormAction = vi.fn()
const mockUseNavigation = vi.fn()
vi.mock('@remix-run/react', () => ({
	useFormAction: () => mockUseFormAction(),
	useNavigation: () => mockUseNavigation(),
}))

// Mock spin-delay
const mockUseSpinDelay = vi.fn()
vi.mock('spin-delay', () => ({
	useSpinDelay: (value: boolean) => mockUseSpinDelay(value),
}))

// Mock React hooks for useDoubleCheck and useDebounce
let mockState = false
const mockSetState = vi.fn((val) => {
	mockState = typeof val === 'function' ? val(mockState) : val
})
let mockRefValue: any = null
const mockUseMemoFn = vi.fn()

vi.mock('react', async () => {
	const actual = await vi.importActual('react')
	return {
		...actual,
		useState: (initial: any) => {
			if (mockState === false && initial === false) {
				// First call, initialize
			}
			return [mockState, mockSetState]
		},
		useRef: (initial: any) => {
			mockRefValue = initial
			return { current: mockRefValue }
		},
		useEffect: (fn: () => void) => {
			fn()
		},
		useMemo: (fn: () => any) => {
			const result = fn()
			mockUseMemoFn(result)
			return result
		},
	}
})

describe('misc.tsx', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockState = false
		mockRefValue = null
	})

	describe('cn (className utility)', () => {
		it('should merge class names', () => {
			const result = cn('class1', 'class2')
			expect(result).toBe('class1 class2')
		})

		it('should handle conditional classes', () => {
			const result = cn('base', true && 'included', false && 'excluded')
			expect(result).toBe('base included')
		})

		it('should merge tailwind classes correctly', () => {
			const result = cn('px-2 py-1', 'px-4')
			expect(result).toBe('py-1 px-4')
		})

		it('should handle undefined and null', () => {
			const result = cn('base', undefined, null, 'end')
			expect(result).toBe('base end')
		})

		it('should handle empty string', () => {
			const result = cn('base', '', 'end')
			expect(result).toBe('base end')
		})

		it('should handle array of classes', () => {
			const result = cn(['class1', 'class2'])
			expect(result).toBe('class1 class2')
		})

		it('should handle object notation', () => {
			const result = cn({ active: true, disabled: false })
			expect(result).toBe('active')
		})
	})

	describe('getErrorMessage', () => {
		it('should return string error as-is', () => {
			const result = getErrorMessage('This is an error')
			expect(result).toBe('This is an error')
		})

		it('should extract message from Error object', () => {
			const error = new Error('Something went wrong')
			const result = getErrorMessage(error)
			expect(result).toBe('Something went wrong')
		})

		it('should extract message from object with message property', () => {
			const error = { message: 'Custom error message' }
			const result = getErrorMessage(error)
			expect(result).toBe('Custom error message')
		})

		it('should return "Unknown Error" for null', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			const result = getErrorMessage(null)
			expect(result).toBe('Unknown Error')
			consoleSpy.mockRestore()
		})

		it('should return "Unknown Error" for undefined', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			const result = getErrorMessage(undefined)
			expect(result).toBe('Unknown Error')
			consoleSpy.mockRestore()
		})

		it('should return "Unknown Error" for number', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			const result = getErrorMessage(123)
			expect(result).toBe('Unknown Error')
			consoleSpy.mockRestore()
		})

		it('should return "Unknown Error" for object without message', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			const result = getErrorMessage({ code: 500 })
			expect(result).toBe('Unknown Error')
			consoleSpy.mockRestore()
		})
	})

	describe('getDomainUrl', () => {
		it('should extract domain from request URL', () => {
			const request = new Request('https://example.com/path')
			const result = getDomainUrl(request)
			expect(result).toBe('http://example.com')
		})

		it('should use X-Forwarded-Host header if present', () => {
			const request = new Request('https://internal.local/path', {
				headers: { 'X-Forwarded-Host': 'example.com' },
			})
			const result = getDomainUrl(request)
			expect(result).toBe('http://example.com')
		})

		it('should use X-Forwarded-Proto header if present', () => {
			const request = new Request('http://example.com/path', {
				headers: {
					'X-Forwarded-Host': 'example.com',
					'X-Forwarded-Proto': 'https',
				},
			})
			const result = getDomainUrl(request)
			expect(result).toBe('https://example.com')
		})

		it('should use host header if present', () => {
			const request = new Request('http://localhost/path', {
				headers: { host: 'example.com:3000' },
			})
			const result = getDomainUrl(request)
			expect(result).toBe('http://example.com:3000')
		})
	})

	describe('getReferrerRoute', () => {
		it('should return route from referer header when protocol matches', () => {
			// Note: getDomainUrl defaults to http:// unless X-Forwarded-Proto is set
			const request = new Request('http://example.com/current', {
				headers: { referer: 'http://example.com/previous' },
			})
			const result = getReferrerRoute(request)
			expect(result).toBe('/previous')
		})

		it('should return "/" if referer is from different domain', () => {
			const request = new Request('https://example.com/current', {
				headers: { referer: 'https://other.com/page' },
			})
			const result = getReferrerRoute(request)
			expect(result).toBe('/')
		})

		it('should return "/" if no referer', () => {
			const request = new Request('https://example.com/current')
			const result = getReferrerRoute(request)
			expect(result).toBe('/')
		})

		it('should handle referer with query params when protocol matches', () => {
			const request = new Request('http://example.com/current', {
				headers: { referer: 'http://example.com/search?q=test' },
			})
			const result = getReferrerRoute(request)
			expect(result).toBe('/search?q=test')
		})

		it('should return "/" when protocol differs (http vs https)', () => {
			// getDomainUrl returns http:// by default, but referer is https://
			const request = new Request('https://example.com/current', {
				headers: { referer: 'https://example.com/previous' },
			})
			const result = getReferrerRoute(request)
			// Protocol mismatch means domain doesn't match
			expect(result).toBe('/')
		})
	})

	describe('mergeHeaders', () => {
		it('should merge multiple header objects', () => {
			const result = mergeHeaders(
				{ 'Content-Type': 'application/json' },
				{ Authorization: 'Bearer token' },
			)
			expect(result.get('Content-Type')).toBe('application/json')
			expect(result.get('Authorization')).toBe('Bearer token')
		})

		it('should override duplicate headers', () => {
			const result = mergeHeaders(
				{ 'Content-Type': 'text/plain' },
				{ 'Content-Type': 'application/json' },
			)
			expect(result.get('Content-Type')).toBe('application/json')
		})

		it('should handle null headers', () => {
			const result = mergeHeaders(null, { 'X-Custom': 'value' })
			expect(result.get('X-Custom')).toBe('value')
		})

		it('should handle undefined headers', () => {
			const result = mergeHeaders(undefined, { 'X-Custom': 'value' })
			expect(result.get('X-Custom')).toBe('value')
		})

		it('should return empty Headers for no arguments', () => {
			const result = mergeHeaders()
			expect([...result.entries()]).toHaveLength(0)
		})
	})

	describe('combineHeaders', () => {
		it('should combine multiple header objects', () => {
			const result = combineHeaders(
				{ 'Content-Type': 'application/json' },
				{ Authorization: 'Bearer token' },
			)
			expect(result.get('Content-Type')).toBe('application/json')
			expect(result.get('Authorization')).toBe('Bearer token')
		})

		it('should append (not override) duplicate headers', () => {
			const result = combineHeaders(
				{ 'Set-Cookie': 'cookie1=value1' },
				{ 'Set-Cookie': 'cookie2=value2' },
			)
			// Headers.append creates comma-separated values for most headers
			const cookieHeader = result.get('Set-Cookie')
			expect(cookieHeader).toContain('cookie1=value1')
			expect(cookieHeader).toContain('cookie2=value2')
		})

		it('should handle null headers', () => {
			const result = combineHeaders(null, { 'X-Custom': 'value' })
			expect(result.get('X-Custom')).toBe('value')
		})

		it('should handle undefined headers', () => {
			const result = combineHeaders(undefined, { 'X-Custom': 'value' })
			expect(result.get('X-Custom')).toBe('value')
		})
	})

	describe('combineResponses', () => {
		it('should combine response init objects (later wins for non-header properties)', () => {
			// Note: combineResponses spreads objects, so later objects override earlier ones
			// The second object has no status, so status becomes undefined
			const result = combineResponses(
				{ status: 200, headers: { 'X-First': 'one' } },
				{ headers: { 'Content-Type': 'application/json' } },
			)
			// Status is overwritten to undefined because second object doesn't have it
			expect(result.status).toBeUndefined()
			// Headers are combined
			const headers = result.headers as Headers
			expect(headers?.get('Content-Type')).toBe('application/json')
			expect(headers?.get('X-First')).toBe('one')
		})

		it('should override status with later value', () => {
			const result = combineResponses({ status: 200 }, { status: 201 })
			expect(result.status).toBe(201)
		})

		it('should combine headers from multiple responses', () => {
			const result = combineResponses(
				{ headers: { 'X-First': 'one' } },
				{ headers: { 'X-Second': 'two' } },
			)
			const headers = result.headers as Headers
			expect(headers?.get('X-First')).toBe('one')
			expect(headers?.get('X-Second')).toBe('two')
		})

		it('should handle null response inits', () => {
			const result = combineResponses(null, { status: 200 })
			expect(result.status).toBe(200)
		})

		it('should handle undefined response inits', () => {
			const result = combineResponses(undefined, { status: 200 })
			expect(result.status).toBe(200)
		})
	})

	describe('invariantResponse', () => {
		it('should not throw when condition is truthy', () => {
			expect(() => invariantResponse(true, 'Error')).not.toThrow()
		})

		it('should throw Response when condition is falsy', () => {
			expect(() => invariantResponse(false, 'Error message')).toThrow(Response)
		})

		it('should throw Response with correct message', async () => {
			try {
				invariantResponse(false, 'Custom error')
			} catch (e) {
				expect(e).toBeInstanceOf(Response)
				const response = e as Response
				expect(response.status).toBe(400)
				expect(await response.text()).toBe('Custom error')
			}
		})

		it('should accept message function', async () => {
			try {
				invariantResponse(false, () => 'Dynamic error')
			} catch (e) {
				expect(e).toBeInstanceOf(Response)
				const response = e as Response
				expect(await response.text()).toBe('Dynamic error')
			}
		})

		it('should use custom response init', async () => {
			try {
				invariantResponse(false, 'Not found', { status: 404 })
			} catch (e) {
				expect(e).toBeInstanceOf(Response)
				const response = e as Response
				expect(response.status).toBe(404)
			}
		})

		it('should not throw for truthy values', () => {
			expect(() => invariantResponse(1, 'Error')).not.toThrow()
			expect(() => invariantResponse('string', 'Error')).not.toThrow()
			expect(() => invariantResponse({}, 'Error')).not.toThrow()
			expect(() => invariantResponse([], 'Error')).not.toThrow()
		})

		it('should throw for falsy values', () => {
			expect(() => invariantResponse(0, 'Error')).toThrow()
			expect(() => invariantResponse('', 'Error')).toThrow()
			expect(() => invariantResponse(null, 'Error')).toThrow()
			expect(() => invariantResponse(undefined, 'Error')).toThrow()
		})
	})

	describe('invariant', () => {
		it('should not throw when condition is truthy', () => {
			expect(() => invariant(true, 'Error')).not.toThrow()
		})

		it('should throw Error when condition is falsy', () => {
			expect(() => invariant(false, 'Error message')).toThrow(Error)
		})

		it('should throw Error with correct message', () => {
			try {
				invariant(false, 'Custom error')
			} catch (e) {
				expect(e).toBeInstanceOf(Error)
				expect((e as Error).message).toBe('Custom error')
			}
		})

		it('should accept message function', () => {
			try {
				invariant(false, () => 'Dynamic error')
			} catch (e) {
				expect(e).toBeInstanceOf(Error)
				expect((e as Error).message).toBe('Dynamic error')
			}
		})

		it('should not throw for truthy values', () => {
			expect(() => invariant(1, 'Error')).not.toThrow()
			expect(() => invariant('string', 'Error')).not.toThrow()
			expect(() => invariant({}, 'Error')).not.toThrow()
		})

		it('should throw for falsy values', () => {
			expect(() => invariant(0, 'Error')).toThrow()
			expect(() => invariant('', 'Error')).toThrow()
			expect(() => invariant(null, 'Error')).toThrow()
		})
	})

	describe('getAttachmentFileSrc', () => {
		it('should return correct path for attachment ID', () => {
			const result = getAttachmentFileSrc('abc123')
			expect(result).toBe('/resources/attachments/abc123')
		})

		it('should handle UUID format', () => {
			const uuid = '550e8400-e29b-41d4-a716-446655440000'
			const result = getAttachmentFileSrc(uuid)
			expect(result).toBe(`/resources/attachments/${uuid}`)
		})

		it('should handle cuid format', () => {
			const cuid = 'clh4xxxxxx0000xxxxxxx'
			const result = getAttachmentFileSrc(cuid)
			expect(result).toBe(`/resources/attachments/${cuid}`)
		})
	})

	describe('getParticipantDocumentFileSrc', () => {
		it('should return correct path for participant document ID', () => {
			const result = getParticipantDocumentFileSrc('doc456')
			expect(result).toBe('/resources/participants/doc456')
		})

		it('should handle UUID format', () => {
			const uuid = '550e8400-e29b-41d4-a716-446655440000'
			const result = getParticipantDocumentFileSrc(uuid)
			expect(result).toBe(`/resources/participants/${uuid}`)
		})

		it('should handle cuid format', () => {
			const cuid = 'clh4xxxxxx0000xxxxxxx'
			const result = getParticipantDocumentFileSrc(cuid)
			expect(result).toBe(`/resources/participants/${cuid}`)
		})
	})

	describe('useIsPending', () => {
		it('should return true when navigation is pending and matches form action', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'submitting',
				formAction: '/test-action',
				formMethod: 'POST',
			})

			const result = useIsPending()
			expect(result).toBe(true)
		})

		it('should return false when navigation is idle', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'idle',
				formAction: '/test-action',
				formMethod: 'POST',
			})

			const result = useIsPending()
			expect(result).toBe(false)
		})

		it('should return false when form action does not match', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'submitting',
				formAction: '/other-action',
				formMethod: 'POST',
			})

			const result = useIsPending()
			expect(result).toBe(false)
		})

		it('should return false when form method does not match', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'submitting',
				formAction: '/test-action',
				formMethod: 'GET',
			})

			const result = useIsPending()
			expect(result).toBe(false)
		})

		it('should use custom form action when provided', () => {
			mockUseFormAction.mockReturnValue('/default-action')
			mockUseNavigation.mockReturnValue({
				state: 'submitting',
				formAction: '/custom-action',
				formMethod: 'POST',
			})

			const result = useIsPending({ formAction: '/custom-action' })
			expect(result).toBe(true)
		})

		it('should check for specific state when provided', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'loading',
				formAction: '/test-action',
				formMethod: 'POST',
			})

			const resultSubmitting = useIsPending({ state: 'submitting' })
			expect(resultSubmitting).toBe(false)

			const resultLoading = useIsPending({ state: 'loading' })
			expect(resultLoading).toBe(true)
		})

		it('should handle non-idle state check', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'loading',
				formAction: '/test-action',
				formMethod: 'POST',
			})

			const result = useIsPending({ state: 'non-idle' })
			expect(result).toBe(true)
		})
	})

	describe('useDelayedIsPending', () => {
		it('should call useSpinDelay with isPending result', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'submitting',
				formAction: '/test-action',
				formMethod: 'POST',
			})
			mockUseSpinDelay.mockReturnValue(true)

			const result = useDelayedIsPending()
			expect(mockUseSpinDelay).toHaveBeenCalledWith(true)
			expect(result).toBe(true)
		})

		it('should return false when not pending', () => {
			mockUseFormAction.mockReturnValue('/test-action')
			mockUseNavigation.mockReturnValue({
				state: 'idle',
				formAction: '/test-action',
				formMethod: 'POST',
			})
			mockUseSpinDelay.mockReturnValue(false)

			const result = useDelayedIsPending()
			expect(mockUseSpinDelay).toHaveBeenCalledWith(false)
			expect(result).toBe(false)
		})

		it('should pass custom options', () => {
			mockUseFormAction.mockReturnValue('/default')
			mockUseNavigation.mockReturnValue({
				state: 'submitting',
				formAction: '/custom',
				formMethod: 'POST',
			})
			mockUseSpinDelay.mockReturnValue(true)

			useDelayedIsPending({ formAction: '/custom', delay: 500, minDuration: 400 })
			expect(mockUseSpinDelay).toHaveBeenCalled()
		})
	})

	describe('useDoubleCheck', () => {
		it('should return doubleCheck state and getButtonProps function', () => {
			const result = useDoubleCheck()
			expect(result).toHaveProperty('doubleCheck')
			expect(result).toHaveProperty('getButtonProps')
			expect(typeof result.getButtonProps).toBe('function')
		})

		it('should return button props with event handlers', () => {
			const { getButtonProps } = useDoubleCheck()
			const props = getButtonProps()

			expect(props).toHaveProperty('onBlur')
			expect(props).toHaveProperty('onClick')
			expect(props).toHaveProperty('onKeyUp')
		})

		it('should merge custom props with generated props', () => {
			const { getButtonProps } = useDoubleCheck()
			const customOnClick = vi.fn()
			const props = getButtonProps({ className: 'custom', onClick: customOnClick })

			expect(props.className).toBe('custom')
			expect(props.onClick).toBeDefined()
		})

		it('should handle onClick to set doubleCheck', () => {
			mockState = false
			const { getButtonProps } = useDoubleCheck()
			const props = getButtonProps()

			const mockEvent = { preventDefault: vi.fn() } as any
			props.onClick?.(mockEvent)

			expect(mockEvent.preventDefault).toHaveBeenCalled()
			expect(mockSetState).toHaveBeenCalledWith(true)
		})

		it('should handle onBlur to reset doubleCheck', () => {
			mockState = true
			const { getButtonProps } = useDoubleCheck()
			const props = getButtonProps()

			props.onBlur?.({} as any)
			expect(mockSetState).toHaveBeenCalledWith(false)
		})

		it('should handle Escape key to reset doubleCheck', () => {
			mockState = true
			const { getButtonProps } = useDoubleCheck()
			const props = getButtonProps()

			props.onKeyUp?.({ key: 'Escape' } as any)
			expect(mockSetState).toHaveBeenCalledWith(false)
		})

		it('should not reset on other keys', () => {
			mockState = true
			mockSetState.mockClear()
			const { getButtonProps } = useDoubleCheck()
			const props = getButtonProps()

			props.onKeyUp?.({ key: 'Enter' } as any)
			// setState should not be called for Enter key
			expect(mockSetState).not.toHaveBeenCalled()
		})
	})

	describe('useDebounce', () => {
		it('should return a debounced function', () => {
			const callback = vi.fn()
			const debounced = useDebounce(callback, 300)

			expect(typeof debounced).toBe('function')
		})

		it('should call useMemo to create debounced function', () => {
			const callback = vi.fn()
			useDebounce(callback, 300)

			expect(mockUseMemoFn).toHaveBeenCalled()
		})

		it('should debounce the callback execution', async () => {
			vi.useFakeTimers()
			const callback = vi.fn()
			const debounced = useDebounce(callback, 300)

			// Call the debounced function multiple times
			debounced('arg1')
			debounced('arg2')
			debounced('arg3')

			// Callback should not be called yet
			expect(callback).not.toHaveBeenCalled()

			// Fast forward time
			vi.advanceTimersByTime(300)

			// Now callback should be called once with last args
			expect(callback).toHaveBeenCalledTimes(1)
			expect(callback).toHaveBeenCalledWith('arg3')

			vi.useRealTimers()
		})

		it('should clear previous timer when called again', async () => {
			vi.useFakeTimers()
			const callback = vi.fn()
			const debounced = useDebounce(callback, 300)

			// First call
			debounced('first')
			vi.advanceTimersByTime(100)

			// Second call before timeout
			debounced('second')
			vi.advanceTimersByTime(100)

			// Third call before timeout
			debounced('third')

			// Not called yet
			expect(callback).not.toHaveBeenCalled()

			// Complete the final timeout
			vi.advanceTimersByTime(300)

			// Only called once with final value
			expect(callback).toHaveBeenCalledTimes(1)
			expect(callback).toHaveBeenCalledWith('third')

			vi.useRealTimers()
		})
	})

	describe('downloadFile', () => {
		const originalFetch = global.fetch
		let mockFetch: ReturnType<typeof vi.fn>

		beforeEach(() => {
			mockFetch = vi.fn()
			global.fetch = mockFetch as typeof fetch
		})

		afterEach(() => {
			global.fetch = originalFetch
		})

		it('should download file successfully', async () => {
			const mockBlob = new ArrayBuffer(8)
			const mockResponse = {
				ok: true,
				headers: new Headers({ 'content-type': 'image/png' }),
				arrayBuffer: () => Promise.resolve(mockBlob),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await downloadFile('https://example.com/image.png')

			expect(result.contentType).toBe('image/png')
			expect(result.blob).toBeInstanceOf(Buffer)
		})

		it('should use default content type when not provided', async () => {
			const mockBlob = new ArrayBuffer(8)
			const mockResponse = {
				ok: true,
				headers: new Headers(),
				arrayBuffer: () => Promise.resolve(mockBlob),
			}
			mockFetch.mockResolvedValue(mockResponse)

			const result = await downloadFile('https://example.com/image')

			expect(result.contentType).toBe('image/jpg')
		})

		it('should retry on failure', async () => {
			const mockBlob = new ArrayBuffer(8)
			const mockResponse = {
				ok: true,
				headers: new Headers({ 'content-type': 'image/png' }),
				arrayBuffer: () => Promise.resolve(mockBlob),
			}

			mockFetch
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValue(mockResponse)

			const result = await downloadFile('https://example.com/image.png')

			expect(global.fetch).toHaveBeenCalledTimes(2)
			expect(result.contentType).toBe('image/png')
		})

		it('should throw after max retries', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			await expect(downloadFile('https://example.com/image.png', 4)).rejects.toThrow(
				'Network error',
			)
		})

		it('should throw for non-ok response', async () => {
			const mockResponse = {
				ok: false,
				status: 404,
			}
			mockFetch.mockResolvedValue(mockResponse)

			await expect(downloadFile('https://example.com/image.png', 4)).rejects.toThrow(
				'Failed to fetch image with status 404',
			)
		})
	})

	describe('logger', () => {
		it('should log object with default label', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
			const consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {})

			const testObj = { foo: 'bar' }
			logger(testObj)

			expect(consoleSpy).toHaveBeenCalledWith('Object:')
			expect(consoleDirSpy).toHaveBeenCalledWith(testObj, { depth: Infinity })

			consoleSpy.mockRestore()
			consoleDirSpy.mockRestore()
		})

		it('should log object with custom label', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
			const consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {})

			const testObj = { foo: 'bar' }
			logger(testObj, 'TestLabel')

			expect(consoleSpy).toHaveBeenCalledWith('TestLabel:')
			expect(consoleDirSpy).toHaveBeenCalledWith(testObj, { depth: Infinity })

			consoleSpy.mockRestore()
			consoleDirSpy.mockRestore()
		})

		it('should handle null object', () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
			const consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {})

			logger(null, 'NullTest')

			expect(consoleSpy).toHaveBeenCalledWith('NullTest:')
			expect(consoleDirSpy).toHaveBeenCalledWith(null, { depth: Infinity })

			consoleSpy.mockRestore()
			consoleDirSpy.mockRestore()
		})
	})
})
