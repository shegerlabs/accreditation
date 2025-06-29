import { LoaderFunctionArgs, redirect } from '@remix-run/node'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
	})

	invariantResponse(participant, 'Not Found', { status: 404 })
	invariantResponse(participant.userId === user.id, 'Unauthorized', {
		status: 403,
	})
	invariantResponse(participant.status === 'REJECTED', 'Unauthorized', {
		status: 403,
	})

	// Redirect to the new registration route with participant data
	return redirect(
		`/requests/registration?eventId=${participant.eventId}&tenantId=${participant.tenantId}&participantId=${participant.id}`,
	)
}

export default function EditParticipantRoute() {
	return null
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You are not authorized to do that."
						redirectUrl="/requests"
						errorCode={403}
					/>
				),
			}}
		/>
	)
}
