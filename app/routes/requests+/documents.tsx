import { parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import { Action, RequestStatus } from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
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
	attachmentHasFile,
	attachmentHasId,
	DocumentsEditor,
	DocumentsEditorSchema,
} from './__documents-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const draft = await prisma.draft.findUnique({
		where: { userId: user.id },
	})

	invariantResponse(draft, 'No draft found', { status: 404 })
	invariantResponse(draft.tenantId, 'Invalid draft state', { status: 400 })
	invariantResponse(draft.eventId, 'Invalid draft state', { status: 400 })

	// Look up participant templates based on participant type
	const participantType = await prisma.participantType.findUnique({
		where: { id: draft.participantTypeId },
		select: {
			templates: {
				select: {
					attachments: true,
				},
			},
		},
	})

	const participant = await prisma.participant.findUnique({
		where: { id: draft.id },
		include: {
			documents: true,
		},
	})

	return json({
		draft,
		templates: participantType?.templates,
		documents: participant?.documents,
		status: RequestStatus.PENDING,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const draft = await prisma.draft.findUnique({
		where: { userId: user.id },
	})
	invariantResponse(draft, 'No draft found', { status: 404 })

	const submission = await parseWithZod(formData, {
		schema: DocumentsEditorSchema.transform(async ({ documents = [] }) => {
			return {
				id: draft.id,
				updatedDocuments: await Promise.all(
					documents.filter(attachmentHasId).map(async i => {
						const attachment = await prisma.attachment.findUnique({
							where: { id: i.id },
						})

						if (attachmentHasFile(i)) {
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
						.filter(attachmentHasFile)
						.filter(image => !image.id)
						.map(async image => {
							const extension = image.file.name.split('.').pop() ?? ''
							return {
								altText: `${image.file.name}`,
								contentType: image.file.type,
								documentType: image.documentType,
								blob: Buffer.from(await image.file.arrayBuffer()),
								fileName: cuid(),
								extension,
							}
						}),
				),
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id: participantId, updatedDocuments, newDocuments } = submission.value

	// Check if this is an edit operation by looking up an existing participant
	const existingParticipant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: { id: true, registrationCode: true },
	})

	const deletedDocuments = await prisma.participantDocument.findMany({
		select: { fileName: true, extension: true },
		where: { id: { notIn: updatedDocuments.map(i => i.id) } },
	})

	const requestReceived = await prisma.step.findFirstOrThrow({
		where: { name: 'Request Received' },
	})

	const invitationOrganization = draft.invitationId
		? (
				await prisma.invitation.findUnique({
					where: { id: draft.invitationId },
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
					draft.eventId,
					draft.participantTypeId,
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

	const data = {
		userId: user.id,
		tenantId: draft.tenantId,
		eventId: draft.eventId,
		participantTypeId: draft.participantTypeId,
		invitationId: draft.invitationId,
		gender: draft.gender,
		title: draft.title,
		firstName: draft.firstName,
		familyName: draft.familyName,
		dateOfBirth: draft.dateOfBirth,
		nationalityId: draft.nationalityId,
		passportNumber: draft.passportNumber,
		passportExpiry: draft.passportExpiry,
		email: draft.requestFor === 'MYSELF' ? user.email : draft.email,
		organization: invitationOrganization ?? draft.organization,
		jobTitle: draft.jobTitle,
		countryId: draft.countryId,
		city: draft.city,
		website: draft.website,
		telephone: draft.telephone,
		address: draft.address,
		preferredLanguage: draft.preferredLanguage,
		needsVisa: draft.needsVisa,
		needsCarPass: draft.needsCarPass,
		vehicleType: draft.vehicleType,
		vehiclePlateNumber: draft.vehiclePlateNumber,
		needsCarFromOrganizer: draft.needsCarFromOrganizer,
		flightNumber: draft.flightNumber,
		arrivalDate: draft.arrivalDate,
		wishList: draft.wishList,
		stepId: requestReceived.id,
	}

	const participant = await prisma.participant.upsert({
		select: { id: true, email: true, firstName: true, familyName: true },
		where: { id: participantId ?? '__new_participant__' },
		create: {
			...data,
			status: RequestStatus.PENDING,
			documents: {
				create: newDocuments.map(({ blob, ...attachment }) => attachment),
			},
			registrationCode,
		},
		update: {
			...data,
			documents: {
				deleteMany: { id: { notIn: updatedDocuments.map(i => i.id) } },
				updateMany: updatedDocuments.map(({ blob, ...updates }) => ({
					where: { id: updates.id },
					data: { ...updates, id: blob ? cuid() : updates.id },
				})),
				create: newDocuments.map(({ blob, ...attachment }) => attachment),
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
		`${participantId ? 'Updated' : 'Initial'} Request Received`,
	)

	await processParticipant(
		participant.id,
		user.id,
		Action.APPROVE,
		`${participantId ? 'Updated' : 'Initial'} Request Reviewed`,
	)

	const deletePromises = deletedDocuments.map(attachment =>
		deleteFileIfExists({
			containerName: 'accreditation',
			prefix: `participants/${participant.id}`,
			fileName: attachment.fileName,
		}),
	)

	const updatePromises = updatedDocuments.map(attachment => {
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

	const newAttachmentsPromises = newDocuments.map(attachment =>
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

	// Delete the draft after successful participant creation
	await prisma.draft.deleteMany({
		where: { userId: user.id },
	})

	return redirectWithToast(`/requests/${participant.id}`, {
		type: 'success',
		title: `Participant Created`,
		description: `Participant created successfully.`,
	})
}

export default function AddDocumentsRoute() {
	const { draft, status, documents } = useLoaderData<typeof loader>()

	const participant = {
		id: draft.id,
		documents: documents ?? [], // Documents will be handled by the editor
	}

	return (
		<DocumentsEditor intent="add" participant={participant} status={status} />
	)
}
