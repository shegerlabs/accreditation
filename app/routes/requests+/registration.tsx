import { parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import { Action, RequestStatus } from '@prisma/client'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import ReactDOMServer from 'react-dom/server'
import { RegistrationEmail } from '~/components/registration-confirmation'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from '~/utils/email.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { getDomainUrl, invariantResponse } from '~/utils/misc'
import { createRegistrationCode } from '~/utils/registration.server'
import { deleteFileIfExists, uploadFile } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'
import { processParticipant } from '~/utils/workflow.server'
import {
	RegistrationEditor,
	RegistrationEditorSchema,
} from './__registration-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const url = new URL(request.url)
	const eventId = url.searchParams.get('eventId')
	const tenantId = url.searchParams.get('tenantId')
	const participantId = url.searchParams.get('participantId')

	if (!eventId || !tenantId) {
		return redirect('/events')
	}

	// If participantId is provided, load existing participant for editing
	let existingParticipant = null
	if (participantId) {
		existingParticipant = await prisma.participant.findUnique({
			where: { id: participantId },
			include: {
				documents: true,
			},
		})

		invariantResponse(existingParticipant, 'Participant not found', {
			status: 404,
		})
		invariantResponse(existingParticipant.userId === user.id, 'Unauthorized', {
			status: 403,
		})
		invariantResponse(
			existingParticipant.status === 'REJECTED',
			'Unauthorized',
			{ status: 403 },
		)
	} else {
		// Check if user already has a participant for this event (for new registrations)
		const existingParticipantForEvent = await prisma.participant.findUnique({
			where: {
				tenantId_eventId_email: {
					eventId,
					tenantId,
					email: user.email,
				},
			},
			select: { id: true },
		})

		if (existingParticipantForEvent) {
			return redirect(`/requests/${existingParticipantForEvent.id}`)
		}
	}

	// Get invitations data
	const result = await prisma.$queryRaw`
		WITH invitation_data AS (
			SELECT 
				json_build_object(
					'id', i.id,
					'tenantId', i."tenantId",
					'eventId', i."eventId",
					'email', i.email,
					'organization', i.organization,
					'participantTypeId', i."participantTypeId",
					'restrictionId', i."restrictionId",
					'maximumQuota', i."maximumQuota",
					'createdAt', i."createdAt",
					'updatedAt', i."updatedAt",
					'participantType', json_build_object(
						'id', pt.id,
						'name', pt.name
					),
					'participants', (
						SELECT COALESCE(json_agg(
							json_build_object(
								'organization', p.organization,
								'participantType', json_build_object('id', ppt.id, 'name', ppt.name)
							)
						), '[]'::json)
						FROM "Participant" p
						LEFT JOIN "ParticipantType" ppt ON p."participantTypeId" = ppt.id
						WHERE p."invitationId" = i.id
						AND p."tenantId" = ${tenantId}
						AND p."eventId" = ${eventId}
					),
					'restriction', (
						SELECT json_build_object(
							'constraints', COALESCE((
								SELECT json_agg(
									json_build_object(
										'id', c.id,
										'quota', c.quota,
										'participantTypeId', c."participantTypeId",
										'participantType', json_build_object(
											'id', cpt.id,
											'name', cpt.name,
											'participants', COALESCE((
												SELECT json_agg(
													json_build_object('organization', cp.organization)
												)
												FROM "Participant" cp
												WHERE cp."participantTypeId" = cpt.id
												AND cp."tenantId" = ${tenantId}
												AND cp."eventId" = ${eventId}
											), '[]'::json)
										)
									)
								)
								FROM "Constraint" c
								LEFT JOIN "ParticipantType" cpt ON c."participantTypeId" = cpt.id
								WHERE c."restrictionId" = r.id
							), '[]'::json)
						)
						FROM "Restriction" r
						WHERE r.id = i."restrictionId"
					)
				) as invitation_json
			FROM "Invitation" i
			LEFT JOIN "ParticipantType" pt ON i."participantTypeId" = pt.id
			WHERE i."tenantId" = ${tenantId}
			AND i."eventId" = ${eventId}
			AND i.email = ${user.email}
			ORDER BY (
				SELECT COUNT(*) 
				FROM "Participant" p 
				WHERE p."invitationId" = i.id
			) DESC,
			i.organization ASC
		),
		lookup_data AS (
			SELECT 
				COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name)), '[]'::json) as tenants,
				COALESCE((SELECT json_agg(json_build_object('id', e.id, 'name', e.name)) FROM "Event" e), '[]'::json) as events,
				COALESCE((SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name)) FROM "ParticipantType" pt), '[]'::json) as "participantTypes",
				COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name)) FROM "Country" c), '[]'::json) as countries
			FROM "Tenant" t
		)
		SELECT 
			COALESCE((SELECT json_agg(invitation_json) FROM invitation_data), '[]'::json) as invitations,
			l.tenants,
			l.events,
			l."participantTypes",
			l.countries
		FROM lookup_data l;
	`

	// Cast the result to any first to bypass type checking, then to the expected type
	const data = (result as any)[0] as {
		invitations: Array<any>
		tenants: Array<{ id: string; name: string }>
		events: Array<{ id: string; name: string }>
		participantTypes: Array<{ id: string; name: string }>
		countries: Array<{ id: string; name: string }>
	}

	// Get meeting types
	const meetingTypes = await prisma.meetingType.findMany({
		where: { tenantId },
		select: { id: true, name: true },
	})

	// Get closed session count
	const closedSessionType = await prisma.meetingType.findFirst({
		where: {
			tenantId,
			name: 'Closed Session',
		},
		select: { id: true },
	})

	const invitationIds = data.invitations.map((invitation: any) => invitation.id)
	const closedSessionCount = closedSessionType
		? await prisma.participant.count({
				where: {
					tenantId,
					eventId,
					invitationId: { in: invitationIds },
					wishList: {
						contains: closedSessionType.id,
					},
				},
			})
		: 0

	const invitation = data.invitations.find((invitation: any) =>
		invitation.restriction?.constraints.some(
			(constraint: any) => constraint.name === 'Closed Session',
		),
	)

	const closedSessionConstraint = invitation?.restriction?.constraints.find(
		(constraint: any) => constraint.name === 'Closed Session',
	)
	const quota = closedSessionConstraint?.quota ?? 0
	const available = quota - closedSessionCount

	// Look up participant templates based on participant type
	const participantType = await prisma.participantType.findFirst({
		where: {
			id: { in: data.participantTypes.map(pt => pt.id) },
		},
		select: {
			templates: {
				select: {
					attachments: true,
				},
			},
		},
	})

	return json({
		eventId,
		tenantId,
		userEmail: user.email,
		participant: existingParticipant,
		invitations: data.invitations,
		tenants: data.tenants,
		events: data.events,
		participantTypes: data.participantTypes,
		countries: data.countries,
		meetingTypes,
		availableClosedSessionQuota: available,
		templates: participantType?.templates,
		status: RequestStatus.PENDING,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: RegistrationEditorSchema.transform(
			async ({ documents = [], ...data }) => {
				return {
					...data,
					updatedDocuments: await Promise.all(
						documents
							.filter((i: any) => i.id)
							.map(async (i: any) => {
								const attachment = await prisma.attachment.findUnique({
									where: { id: i.id },
								})

								if (i.file) {
									return {
										id: i.id,
										altText: i.altText,
										contentType: i.file.type,
										blob: Buffer.from(await i.file.arrayBuffer()),
										fileName: attachment?.fileName ?? cuid(),
										extension: i.file.name.split('.').pop() ?? '',
									}
								} else {
									return { id: i.id }
								}
							}),
					),
					newDocuments: await Promise.all(
						documents
							.filter((i: any) => i.file)
							.filter((i: any) => !i.id)
							.map(async (i: any) => {
								const extension = i.file.name.split('.').pop() ?? ''
								return {
									altText: `${i.file.name}`,
									contentType: i.file.type,
									documentType: i.documentType,
									blob: Buffer.from(await i.file.arrayBuffer()),
									fileName: cuid(),
									extension,
								}
							}),
					),
				}
			},
		),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { updatedDocuments, newDocuments, ...participantData } =
		submission.value

	// Check if this is an edit operation by looking up an existing participant
	const existingParticipant =
		participantData.id && participantData.id !== ''
			? await prisma.participant.findUnique({
					where: { id: participantData.id },
					select: { id: true, registrationCode: true },
				})
			: null

	const deletedDocuments = existingParticipant
		? await prisma.participantDocument.findMany({
				select: { fileName: true, extension: true },
				where: { id: { notIn: updatedDocuments.map((i: any) => i.id) } },
			})
		: []

	const requestReceived = await prisma.step.findFirstOrThrow({
		where: { name: 'Request Received' },
	})

	const invitationOrganization = participantData.invitationId
		? (
				await prisma.invitation.findUnique({
					where: { id: participantData.invitationId },
				})
			)?.organization
		: undefined

	// Generate or reuse registration code
	let registrationCode: string
	if (existingParticipant?.registrationCode) {
		registrationCode = existingParticipant.registrationCode
	} else {
		let attempts = 0
		const MAX_ATTEMPTS = 5
		let generatedCode: string | null = null

		while (!generatedCode && attempts < MAX_ATTEMPTS) {
			try {
				generatedCode = await createRegistrationCode(
					participantData.eventId,
					participantData.participantTypeId,
				)

				// Try to find if this code already exists
				const existing = await prisma.participant.findUnique({
					where: { registrationCode: generatedCode },
					select: { id: true },
				})

				if (existing) {
					generatedCode = null // Reset and try again
					attempts++
				}
			} catch (error) {
				attempts++
				invariantResponse(
					attempts < MAX_ATTEMPTS,
					'Could not generate unique registration code',
					{ status: 500 },
				)
			}
		}

		invariantResponse(
			generatedCode,
			'Could not generate unique registration code',
		)
		registrationCode = generatedCode
	}

	// Ensure required fields are present (schema validation should have caught this)
	invariantResponse(participantData.firstName, 'First name is required')
	invariantResponse(participantData.familyName, 'Family name is required')
	invariantResponse(participantData.title, 'Title is required')
	invariantResponse(participantData.gender, 'Gender is required')
	invariantResponse(participantData.dateOfBirth, 'Date of birth is required')
	invariantResponse(participantData.nationalityId, 'Nationality is required')
	invariantResponse(
		participantData.passportNumber,
		'Passport number is required',
	)
	invariantResponse(
		participantData.passportExpiry,
		'Passport expiry is required',
	)
	invariantResponse(participantData.organization, 'Organization is required')
	invariantResponse(participantData.jobTitle, 'Job title is required')
	invariantResponse(participantData.countryId, 'Country is required')
	invariantResponse(participantData.city, 'City is required')
	invariantResponse(participantData.email, 'Email is required')
	invariantResponse(
		participantData.preferredLanguage,
		'Preferred language is required',
	)

	const data = {
		userId: user.id,
		tenantId: participantData.tenantId,
		eventId: participantData.eventId,
		participantTypeId: participantData.participantTypeId,
		invitationId: participantData.invitationId,
		gender: participantData.gender,
		title: participantData.title,
		firstName: participantData.firstName,
		familyName: participantData.familyName,
		dateOfBirth: participantData.dateOfBirth,
		nationalityId: participantData.nationalityId,
		passportNumber: participantData.passportNumber,
		passportExpiry: participantData.passportExpiry,
		email:
			participantData.requestFor === 'MYSELF'
				? user.email
				: participantData.email,
		organization: invitationOrganization ?? participantData.organization,
		jobTitle: participantData.jobTitle,
		countryId: participantData.countryId,
		city: participantData.city,
		website: participantData.website,
		telephone: participantData.telephone,
		address: participantData.address,
		preferredLanguage: participantData.preferredLanguage,
		needsVisa: participantData.needsVisa,
		needsCarPass: participantData.needsCarPass,
		vehicleType: participantData.vehicleType,
		vehiclePlateNumber: participantData.vehiclePlateNumber,
		needsCarFromOrganizer: participantData.needsCarFromOrganizer,
		flightNumber: participantData.flightNumber,
		arrivalDate: participantData.arrivalDate,
		wishList: participantData.meetings?.join(','),
		stepId: requestReceived.id,
	} as const

	const participant = await prisma.participant.upsert({
		select: { id: true, email: true, firstName: true, familyName: true },
		where: {
			id:
				participantData.id && participantData.id !== ''
					? participantData.id
					: '__new_participant__',
		},
		create: {
			...data,
			status: RequestStatus.PENDING,
			documents: {
				create: newDocuments.map(({ blob, ...attachment }: any) => attachment),
			},
			registrationCode,
		},
		update: {
			...data,
			documents: {
				deleteMany: { id: { notIn: updatedDocuments.map((i: any) => i.id) } },
				updateMany: updatedDocuments.map(({ blob, ...updates }: any) => ({
					where: { id: updates.id },
					data: { ...updates, id: blob ? cuid() : updates.id },
				})),
				create: newDocuments.map(({ blob, ...attachment }: any) => attachment),
			},
		},
	})

	invariantResponse(participant.id, 'Could not create participant')

	const domainUrl = getDomainUrl(request)
	const lookupUrl = `${domainUrl}/requests/${participant.id}`

	void sendEmailAzure({
		to: participant.email,
		subject: 'Event Registration Code',
		plainText: `Your registration code is: ${registrationCode}`,
		html: ReactDOMServer.renderToString(
			<RegistrationEmail
				participantName={`${participant.firstName} ${participant.familyName}`}
				registrationCode={registrationCode}
				eventName={'African Union Summit Accreditation'}
				lookupUrl={lookupUrl}
			/>,
		),
	})

	await processParticipant(
		participant.id,
		user.id,
		Action.APPROVE,
		`${participantData.id && participantData.id !== '' ? 'Updated' : 'Initial'} Request Received`,
	)

	await processParticipant(
		participant.id,
		user.id,
		Action.APPROVE,
		`${participantData.id && participantData.id !== '' ? 'Updated' : 'Initial'} Request Reviewed`,
	)

	const deletePromises = deletedDocuments.map((attachment: any) =>
		deleteFileIfExists({
			containerName: 'accreditation',
			prefix: `participants/${participant.id}`,
			fileName: attachment.fileName,
		}),
	)

	const updatePromises = updatedDocuments.map((attachment: any) => {
		if (attachment.blob) {
			return uploadFile({
				containerName: 'accreditation',
				directory: `participants/${participant.id}`,
				fileName: attachment.fileName,
				extension: attachment.extension,
				blob: attachment.blob,
			})
		}
		return Promise.resolve()
	})

	const newAttachmentsPromises = newDocuments.map((attachment: any) =>
		uploadFile({
			containerName: 'accreditation',
			directory: `participants/${participant.id}`,
			fileName: attachment.fileName,
			extension: attachment.extension,
			blob: attachment.blob,
		}),
	)

	await Promise.all([
		...deletePromises,
		...updatePromises,
		...newAttachmentsPromises,
	])

	return redirectWithToast(`/requests/${participant.id}`, {
		type: 'success',
		title: `Participant Created`,
		description: `Participant created successfully.`,
	})
}

export default function RegistrationRoute() {
	const {
		eventId,
		tenantId,
		userEmail,
		participant: existingParticipant,
		invitations,
		tenants,
		events,
		participantTypes,
		countries,
		meetingTypes,
		availableClosedSessionQuota,
		templates,
		status,
	} = useLoaderData<typeof loader>()

	const participant = existingParticipant
		? {
				id: existingParticipant.id,
				tenantId: existingParticipant.tenantId,
				eventId: existingParticipant.eventId,
				participantTypeId: existingParticipant.participantTypeId,
				countryId: existingParticipant.countryId,
				requestFor:
					existingParticipant.email === userEmail
						? ('MYSELF' as const)
						: ('OTHERS' as const),
				invitationId: existingParticipant.invitationId,
				firstName: existingParticipant.firstName,
				familyName: existingParticipant.familyName,
				title: existingParticipant.title,
				gender: existingParticipant.gender,
				dateOfBirth: existingParticipant.dateOfBirth,
				nationalityId: existingParticipant.nationalityId,
				passportNumber: existingParticipant.passportNumber,
				passportExpiry: existingParticipant.passportExpiry,
				email: existingParticipant.email,
				organization: existingParticipant.organization,
				jobTitle: existingParticipant.jobTitle,
				city: existingParticipant.city,
				website: existingParticipant.website,
				telephone: existingParticipant.telephone,
				address: existingParticipant.address,
				preferredLanguage: existingParticipant.preferredLanguage,
				needsVisa: existingParticipant.needsVisa,
				needsCarPass: existingParticipant.needsCarPass,
				vehicleType: existingParticipant.vehicleType,
				vehiclePlateNumber: existingParticipant.vehiclePlateNumber,
				needsCarFromOrganizer: existingParticipant.needsCarFromOrganizer,
				flightNumber: existingParticipant.flightNumber,
				arrivalDate: existingParticipant.arrivalDate,
				meetings:
					existingParticipant.wishList?.split(',').filter(Boolean) || [],
				documents: existingParticipant.documents || [],
			}
		: {
				id: '',
				tenantId,
				eventId,
				participantTypeId: '',
				countryId: '',
				requestFor: 'MYSELF' as const,
				invitationId: '',
				firstName: '',
				familyName: '',
				title: 'MR.' as const,
				gender: 'MALE' as const,
				dateOfBirth: '',
				nationalityId: '',
				passportNumber: '',
				passportExpiry: '',
				email: userEmail,
				organization: '',
				jobTitle: '',
				city: '',
				website: '',
				telephone: '',
				address: '',
				preferredLanguage: 'ENGLISH' as const,
				needsVisa: false,
				needsCarPass: false,
				vehicleType: '',
				vehiclePlateNumber: '',
				needsCarFromOrganizer: false,
				flightNumber: '',
				arrivalDate: '',
				meetings: [],
				documents: [],
			}

	return (
		<RegistrationEditor
			intent={existingParticipant ? 'edit' : 'add'}
			participant={participant}
			invitations={invitations}
			tenants={tenants}
			events={events}
			participantTypes={participantTypes}
			countries={countries}
			meetingTypes={meetingTypes}
			availableClosedSessionQuota={availableClosedSessionQuota}
			templates={templates}
			status={status}
		/>
	)
}
