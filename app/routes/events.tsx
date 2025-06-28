import { LoaderFunctionArgs } from '@remix-run/node'
import { json, Outlet } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])

	return json({})
}

export default function EventsRoute() {
	return (
		<div className="flex flex-col gap-4">
			<Outlet />
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You don't have permission to view events."
						redirectUrl="/"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
