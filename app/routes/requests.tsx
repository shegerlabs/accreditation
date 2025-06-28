import { LoaderFunctionArgs } from '@remix-run/node'
import { json, Outlet, useLoaderData, useMatches } from '@remix-run/react'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import Steps from '~/components/steps'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

const REGISTRATION_STEPS = [
	{ id: '01', name: 'General', href: 'general' },
	{ id: '02', name: 'Professional', href: 'professional' },
	{ id: '03', name: 'Wishlist', href: 'wishlist' },
	{ id: '04', name: 'Documents', href: 'documents' },
]

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	// Get current URL path
	const url = new URL(request.url)
	const currentPath = url.pathname.split('/').pop() || ''

	// Check if we're in a registration step
	const currentStepIndex = REGISTRATION_STEPS.findIndex(
		step => step.href === currentPath,
	)

	// Check if there's a draft (which indicates we're in registration process)
	const draft = await prisma.draft.findUnique({
		where: { userId: user.id },
		select: { id: true },
	})

	const showSteps = currentStepIndex !== -1 && draft !== null
	let stepsWithStatus: Array<{
		id: string
		name: string
		href: string
		status: 'complete' | 'current' | 'upcoming'
	}> = []

	if (showSteps) {
		stepsWithStatus = REGISTRATION_STEPS.map((step, index) => {
			let status: 'complete' | 'current' | 'upcoming' = 'upcoming'
			if (index < currentStepIndex) status = 'complete'
			else if (index === currentStepIndex) status = 'current'
			return {
				...step,
				status,
				href: `/requests/${step.href}`, // Add back the full path for the links
			}
		})
	}

	return json({
		showSteps,
		steps: stepsWithStatus,
	})
}

export default function RequestsRoute() {
	const { showSteps, steps } = useLoaderData<typeof loader>()

	const matches = useMatches()
	const isIndex = matches.some(match => match.id === 'routes/requests+/index')

	return (
		<div className="flex flex-col gap-4">
			{showSteps && !isIndex && steps?.length > 0 && <Steps steps={steps} />}
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
						message="You don't have permission to view requests."
						redirectUrl="/"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
