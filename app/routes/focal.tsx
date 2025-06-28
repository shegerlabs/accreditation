import { LoaderFunctionArgs } from '@remix-run/node'
import { json, Outlet } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { requireUserWithRole } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'focal')
	return json({})
}

export default function FocalRoute() {
	return <Outlet />
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view this page."
						redirectUrl="/"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
