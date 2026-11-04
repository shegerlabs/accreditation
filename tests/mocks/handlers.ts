import { http, HttpResponse } from 'msw'

// Define handlers for API mocking
export const handlers = [
	// Example: Mock authentication endpoint
	http.post('/api/auth/login', async ({ request }) => {
		const body = await request.json() as { email: string; password: string }

		if (body.email === 'test@example.com' && body.password === 'password123') {
			return HttpResponse.json({
				user: {
					id: 'test-user-id',
					email: 'test@example.com',
					name: 'Test User',
				},
			})
		}

		return HttpResponse.json(
			{ error: 'Invalid credentials' },
			{ status: 401 }
		)
	}),

	// Example: Mock invitations endpoint
	http.get('/api/invitations', () => {
		return HttpResponse.json({
			invitations: [
				{
					id: 'inv-1',
					organization: 'Test Organization',
					maximumQuota: 10,
					participants: [],
					invitationConstraints: [],
				},
			],
		})
	}),

	// Example: Mock participant types endpoint
	http.get('/api/participant-types', () => {
		return HttpResponse.json({
			participantTypes: [
				{ id: 'pt-1', name: 'Delegate' },
				{ id: 'pt-2', name: 'Observer' },
				{ id: 'pt-3', name: 'Press' },
			],
		})
	}),

	// Add more handlers as needed for your application
]
