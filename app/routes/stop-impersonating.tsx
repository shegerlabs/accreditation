import { ActionFunctionArgs } from '@remix-run/node'
import { endImpersonation } from '~/utils/auth.server'

export async function action({ request }: ActionFunctionArgs) {
	// End impersonation and redirect to home (which will show login)
	return endImpersonation({ request, redirectTo: '/' })
}

export async function loader() {
	// Redirect GET requests to home
	return new Response(null, {
		status: 302,
		headers: { Location: '/' },
	})
}
