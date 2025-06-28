import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { registrationWizard } from '~/utils/registration.server'
import { WishlistEditor, WishlistEditorSchema } from './__wishlist-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const draft = await prisma.draft.findUnique({
		where: { userId: user.id },
	})

	invariantResponse(draft, 'No draft found', { status: 404 })
	invariantResponse(draft.tenantId, 'Invalid draft state', { status: 400 })
	invariantResponse(draft.eventId, 'Invalid draft state', { status: 400 })

	const invitations = await prisma.invitation.findMany({
		where: {
			tenantId: draft.tenantId,
			eventId: draft.eventId,
			email: user.email,
		},
		include: {
			participantType: true,
			participants: {
				include: {
					participantType: true,
				},
			},
			restriction: {
				include: {
					constraints: {
						include: {
							participantType: {
								include: {
									participants: true,
								},
							},
						},
					},
				},
			},
		},
		orderBy: {
			participants: {
				_count: 'desc',
			},
		},
	})

	const invitation = invitations.find(invitation =>
		invitation.restriction?.constraints.some(
			constraint => constraint.name === 'Closed Session',
		),
	)

	const closedSessionType = await prisma.meetingType.findFirst({
		where: {
			tenantId: draft.tenantId,
			name: 'Closed Session',
		},
		select: {
			id: true,
		},
	})

	const invitationIds = invitations.map(invitation => invitation.id)

	const closedSessionCount = closedSessionType
		? await prisma.participant.count({
				where: {
					tenantId: draft.tenantId,
					eventId: draft.eventId,
					invitationId: { in: invitationIds },
					wishList: {
						contains: closedSessionType.id,
					},
				},
			})
		: 0

	const closedSessionConstraint = invitation?.restriction?.constraints.find(
		constraint => constraint.name === 'Closed Session',
	)
	const quota = closedSessionConstraint?.quota ?? 0

	const available = quota - closedSessionCount

	const meetingTypes = await prisma.meetingType.findMany({
		where: { tenantId: draft.tenantId },
		select: { id: true, name: true },
	})

	return json({ draft, availableClosedSessionQuota: available, meetingTypes })
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { nextStep } = await registrationWizard.register(request)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'wishlist') {
		const draft = await prisma.draft.findUnique({
			where: { userId: user.id },
		})
		invariantResponse(draft, 'No draft found', { status: 404 })

		const submission = await parseWithZod(formData, {
			schema: WishlistEditorSchema,
			async: true,
		})

		if (submission.status !== 'success') {
			return json(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		await prisma.draft.update({
			where: { id: draft.id },
			data: {
				needsVisa: submission.value.needsVisa,
				needsCarPass: submission.value.needsCarPass,
				vehicleType: submission.value.vehicleType,
				vehiclePlateNumber: submission.value.vehiclePlateNumber,
				needsCarFromOrganizer: submission.value.needsCarFromOrganizer,
				flightNumber: submission.value.flightNumber,
				arrivalDate: submission.value.arrivalDate,
				wishList: submission.value.meetings?.join(','),
			},
		})

		return nextStep()
	}
}

export default function AddWishlistRoute() {
	const { draft, availableClosedSessionQuota, meetingTypes } =
		useLoaderData<typeof loader>()

	return (
		<WishlistEditor
			intent="add"
			participant={
				{
					id: draft.id,
					tenantId: draft.tenantId,
					eventId: draft.eventId,
					participantTypeId: draft.participantTypeId,
					meetings: draft.wishList?.split(','),
				} as any
			}
			availableClosedSessionQuota={availableClosedSessionQuota}
			meetingTypes={meetingTypes}
		/>
	)
}
