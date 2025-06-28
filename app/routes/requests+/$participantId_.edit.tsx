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

	// Delete any existing draft
	await prisma.draft.deleteMany({
		where: { userId: user.id },
	})

	// Create new draft with participant data
	await prisma.draft.create({
		data: {
			id: participant.id, // Use the same ID as the participant for edit mode
			userId: user.id,
			tenantId: participant.tenantId,
			eventId: participant.eventId,
			participantTypeId: participant.participantTypeId,
			invitationId: participant.invitationId,

			// General Info
			requestFor: participant.email === user.email ? 'MYSELF' : 'OTHERS',
			gender: participant.gender,
			title: participant.title,
			firstName: participant.firstName,
			familyName: participant.familyName,
			dateOfBirth: participant.dateOfBirth,
			nationalityId: participant.nationalityId,
			passportNumber: participant.passportNumber,
			passportExpiry: participant.passportExpiry,

			// Professional Info
			organization: participant.organization,
			jobTitle: participant.jobTitle,
			countryId: participant.countryId,
			city: participant.city,
			email: participant.email,
			website: participant.website ?? undefined,
			telephone: participant.telephone ?? undefined,
			address: participant.address ?? undefined,
			preferredLanguage: participant.preferredLanguage ?? undefined,

			// Wishlist
			needsVisa: participant.needsVisa ?? false,
			needsCarPass: participant.needsCarPass ?? false,
			vehicleType: participant.vehicleType ?? undefined,
			vehiclePlateNumber: participant.vehiclePlateNumber ?? undefined,
			needsCarFromOrganizer: participant.needsCarFromOrganizer,
			flightNumber: participant.flightNumber ?? undefined,
			arrivalDate: participant.arrivalDate ?? undefined,
			wishList: participant.wishList ?? undefined,

			// Metadata for edit mode
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
		},
	})

	return redirect('/requests/general')
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
