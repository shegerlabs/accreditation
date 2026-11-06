import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import { Action, RequestStatus } from '@prisma/client'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
} from '@remix-run/node'
import {
	useActionData,
	useLoaderData,
} from '@remix-run/react'
import { AlertCircle, Camera, Eye, FileText, Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { CameraFileInputField } from '~/components/conform/CameraFileInputField'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { Requirements } from '~/components/requirements'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import {
	Card,
	CardContent,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import {
	validateDocumentFile,
	validatePhotoFile,
} from '~/utils/file-validation.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import {
	getDomainUrl,
	getParticipantDocumentFileSrc,
	invariantResponse,
	useIsPending,
} from '~/utils/misc'
import { uploadFile } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { xssTransform } from '~/utils/validations'
import { getAllowedParticipantTypes, isClosedSessionQuotaAvailable, validateQuotaForTypeChange } from '~/utils/quota.server'
import { NOT_REGISTRABLE_MESSAGE, isRegistrableType } from '~/utils/event-participant-types.server'
import { sendParticipantEmail } from '~/utils/participant-email.server'
import { processParticipant } from '~/utils/workflow.server'
import { FormCard } from '~/components/form-card'

// Default max upload size - actual limit fetched from settings in loader
// This is used for client-side validation; server validates against actual setting
const DEFAULT_MAX_UPLOAD_SIZE_MB = 3
const MAX_UPLOAD_SIZE = 1024 * 1024 * DEFAULT_MAX_UPLOAD_SIZE_MB

const AttachmentFieldSetSchema = z
	.object({
		id: z.string().optional(),
		file: z
			.instanceof(File)
			.optional()
			.refine(file => !file || file.size <= MAX_UPLOAD_SIZE, {
				message: `File size must be less than ${DEFAULT_MAX_UPLOAD_SIZE_MB}MB`,
			}),
		altText: z.string().optional(),
		documentType: z.enum(['PASSPORT', 'PHOTO', 'LETTER']),
	})
	.superRefine((data, ctx) => {
		if (!data.file) return

		const isPhoto = data.documentType === 'PHOTO'
		const allowedTypes = isPhoto
			? ['image/png', 'image/jpeg']
			: ['image/png', 'image/jpeg', 'application/pdf']

		if (!allowedTypes.includes(data.file.type)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: isPhoto
					? 'Only PNG or JPG files are allowed for photos'
					: 'Only PNG, JPG, or PDF files are allowed',
				path: ['file'],
			})
		}
	})
	.refine(
		data => {
			return Boolean(data.id) || Boolean(data.file?.size)
		},
		{
			message: 'A file must be attached',
			path: ['file'],
		},
	)

type AttachmentFieldSet = z.infer<typeof AttachmentFieldSetSchema>

export function attachmentHasFile(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	file: NonNullable<AttachmentFieldSet['file']>
} {
	return Boolean(attachment.file?.size && attachment.file.size > 0)
}

export function attachmentHasId(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	id: NonNullable<AttachmentFieldSet['id']>
} {
	return attachment.id != null
}

export const EditParticipantSchema = z
	.object({
		// General Info
		participantId: z.string(),
		tenantId: z.string({ required_error: 'Tenant is required' }),
		eventId: z.string({ required_error: 'Event is required' }),
		participantTypeId: z.string({
			required_error: 'Participant Type is required',
		}),
		gender: z.enum(['MALE', 'FEMALE']),
		titleId: z.string(
			{
				required_error: 'Title is required',
			},
		),
		firstName: z
			.string({ required_error: 'First Name is required' })
			.transform(xssTransform),
		familyName: z
			.string({ required_error: 'Family Name is required' })
			.transform(xssTransform),
		// IMPORTANT: Use .refine() instead of .max() for date comparisons.
		// .max(new Date()) is evaluated once at module load time (server startup),
		// causing stale date comparisons if the server runs for days/weeks.
		// .refine() evaluates the date at validation time (each request).
		dateOfBirth: z
			.date({ required_error: 'Date of Birth is required' })
			.refine((date) => date <= new Date(), {
				message: 'Date of Birth cannot be in the future',
			}),
		nationalityId: z.string({ required_error: 'Nationality is required' }),
		passportNumber: z
			.string({ required_error: 'Passport Number is required' })
			.regex(/^[a-zA-Z0-9- ]+$/, { message: 'Invalid passport number' })
			.transform(xssTransform)
			.transform(value => value?.replace(/[- ]/g, '') ?? '')
			.transform(value => value.toUpperCase()),
		// IMPORTANT: Use .refine() instead of .min() for date comparisons.
		// .min(new Date()) is evaluated once at module load time (server startup),
		// causing stale date comparisons if the server runs for days/weeks.
		// .refine() evaluates the date at validation time (each request).
		// Passport must be valid today or in the future (not expired).
		passportExpiry: z
			.date({ required_error: 'Passport Expiry is required' })
			.refine(
				(date) => {
					const today = new Date()
					today.setHours(0, 0, 0, 0)
					return date >= today
				},
				{ message: 'Passport must not be expired' },
			),

		// Professional Info
		organization: z
			.string({ required_error: 'Organization is required' })
			.transform(xssTransform),
		jobTitle: z
			.string({ required_error: 'Job Title is required' })
			.transform(xssTransform),
		countryId: z.string({ required_error: 'Country is required' }),
		city: z
			.string({ required_error: 'City is required' })
			.transform(xssTransform),
		email: z
			.string()
			.email({ message: 'Email is invalid' })
			.min(3, { message: 'Email is too short' })
			.max(100, { message: 'Email is too long' })
			.transform(value => value.toLowerCase())
			.transform(xssTransform)
			.optional(),
		preferredLanguage: z.enum([
			'ENGLISH',
			'FRENCH',
			'PORTUGUESE',
			'ARABIC',
			'SWAHLI',
			'OTHER',
		]),

		// Wishlist
		needsVisa: z.boolean().default(false),
		needsCarPass: z.boolean().default(false),
		needsCarFromOrganizer: z.boolean().default(false),
		meetings: z.array(z.string()).optional(),

		// Documents
		documents: z.array(AttachmentFieldSetSchema),
	})
	.superRefine((data, ctx) => {
		// Validate all required documents are present
		const requiredTypes = ['PASSPORT', 'PHOTO', 'LETTER']
		const missingTypes = requiredTypes.filter(
			type =>
				!data.documents.some(
					doc =>
						doc.documentType === type &&
						(Boolean(doc.id) || Boolean(doc.file?.size)),
				),
		)

		if (missingTypes.length > 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Missing required documents: ${missingTypes.join(', ')}`,
				path: ['documents'],
			})
		}
	})

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: {
			documents: true,
			participantType: { select: { id: true, name: true } },
			invitation: {
				select: {
					id: true,
					invitationConstraints: {
						select: {
							accessLevel: true,
							participantType: { select: { id: true, name: true } },
						},
					},
				},
			},
		},
	})

	invariantResponse(participant, 'Not Found', { status: 404 })
	invariantResponse(participant.userId === user.id, 'Unauthorized', {
		status: 403,
	})
	invariantResponse(participant.status === 'REJECTED', 'Can only edit rejected requests', {
		status: 403,
	})

	// Check if user has focal role
	const userWithRoles = await prisma.user.findUnique({
		where: { id: user.id },
		select: { roles: { select: { name: true } } },
	})
	const isFocal = userWithRoles?.roles.some(r => r.name === 'focal') ?? false

	// Load all lookup data
	const countries = await prisma.country.findMany({
		orderBy: { name: 'asc' },
	})

	const meetingTypes = await prisma.meetingType.findMany({
		where: { tenantId: participant.tenantId },
	})

	const titles = await prisma.title.findMany({
		orderBy: { name: 'asc' },
	})

	// Fetch max upload size from settings
	const maxUploadSizeMB = await getSetting<number>(
		SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB,
	)

	// Fetch allowed participant types based on invitation constraints
	const allowedParticipantTypes = await getAllowedParticipantTypes({
		invitationId: participant.invitationId,
		tenantId: participant.tenantId,
		eventId: participant.eventId,
		currentTypeId: participant.participantTypeId,
	})

	// Check if Closed Session quota is still available for this participant
	// (excluding themselves from the count since they're being edited)
	const canSelectClosedSession = await isClosedSessionQuotaAvailable({
		participantId: participant.id,
		invitationId: participant.invitationId,
		participantTypeId: participant.participantTypeId,
	})

	return json({
		participant: {
			id: participant.id,
			tenantId: participant.tenantId,
			eventId: participant.eventId,
			invitationId: participant.invitationId,
			participantTypeId: participant.participantTypeId,
			gender: participant.gender,
			titleId: participant.titleId,
			firstName: participant.firstName,
			familyName: participant.familyName,
			dateOfBirth: participant.dateOfBirth,
			nationalityId: participant.nationalityId,
			passportNumber: participant.passportNumber,
			passportExpiry: participant.passportExpiry,
			organization: participant.organization,
			jobTitle: participant.jobTitle,
			countryId: participant.countryId,
			city: participant.city,
			email: participant.email,
			preferredLanguage: participant.preferredLanguage,
			needsVisa: participant.needsVisa,
			needsCarPass: participant.needsCarPass,
			needsCarFromOrganizer: participant.needsCarFromOrganizer,
			wishList: participant.wishList?.split(',') ?? [],
			documents: participant.documents.map(doc => ({
				id: doc.id,
				documentType: doc.documentType,
				altText: doc.altText,
			})),
			participantTypeName: participant.participantType.name,
			invitationConstraints: participant.invitation?.invitationConstraints ?? [],
		},
		countries,
		meetingTypes,
		titles,
		isFocal,
		maxUploadSizeMB,
		allowedParticipantTypes,
		canSelectClosedSession,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params
	invariantResponse(participantId, 'Participant not found', { status: 404 })

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: EditParticipantSchema.superRefine(async (data, ctx) => {
			// Verify participant exists and belongs to user
			const participant = await prisma.participant.findUnique({
				where: { id: participantId },
				select: {
					id: true,
					userId: true,
					status: true,
					passportNumber: true,
					email: true,
					invitationId: true,
					participantTypeId: true,
				},
			})

			if (!participant) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Participant not found',
				})
				return
			}

			if (participant.userId !== user.id) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Unauthorized',
				})
				return
			}

			if (participant.status !== RequestStatus.REJECTED) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Can only edit rejected requests',
				})
				return
			}

			// Check passport uniqueness (excluding current participant)
			if (data.passportNumber !== participant.passportNumber) {
				const participantWithPassport = await prisma.participant.findFirst({
					where: {
						tenantId: data.tenantId,
						eventId: data.eventId,
						passportNumber: data.passportNumber,
						id: { not: participantId },
					},
				})

				if (participantWithPassport) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'A participant with this passport number already exists.',
						path: ['passportNumber'],
					})
					return
				}
			}

			// Check email uniqueness (excluding current participant)
			// Only check if email is provided and changed
			if (data.email && data.email !== participant.email) {
				const participantWithEmail = await prisma.participant.findFirst({
					where: {
						tenantId: data.tenantId,
						eventId: data.eventId,
						email: data.email,
						id: { not: participantId },
					},
				})

				if (participantWithEmail) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'There is already a participant with this email',
						path: ['email'],
					})
					return
				}
			}

			// Validate quota for the new type and access level
			// We need to check quota whether type changed or not, because access level might change
			const typeChanged = data.participantTypeId !== participant.participantTypeId
			if (typeChanged && !(await isRegistrableType(data.eventId, data.participantTypeId))) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: NOT_REGISTRABLE_MESSAGE,
					path: ['participantTypeId'],
				})
				return
			}

			// Determine if user is requesting Closed Session
			let newAttendClosedSession = false
			if (!typeChanged && data.meetings && data.meetings.length > 0) {
				// Type didn't change - check if Closed Session is in selected meetings
				const closedSessionMeetingType = await prisma.meetingType.findFirst({
					where: {
						tenantId: data.tenantId,
						name: 'Closed Session',
						id: { in: data.meetings },
					},
					select: { id: true },
				})
				newAttendClosedSession = closedSessionMeetingType !== null
			}
			// If type changed, meetings are reset so attendClosedSession = false

			// Only validate if there's an invitation (quota enforcement)
			if (participant.invitationId) {
				const quotaCheck = await validateQuotaForTypeChange({
					participantId: participant.id,
					invitationId: participant.invitationId,
					newParticipantTypeId: data.participantTypeId,
					newAttendClosedSession,
				})

				if (!quotaCheck.allowed) {
					// Add error at form level for visibility at top of form
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: quotaCheck.reason ?? 'Quota exceeded for the selected participant type.',
					})
					return
				}
			}
		}).transform(async ({ documents = [], ...data }) => {
			// Get existing documents to retrieve their fileNames
			const existingDocs = await prisma.participantDocument.findMany({
				where: {
					id: {
						in: documents
							.filter(attachmentHasId)
							.map(d => d.id)
							.filter(Boolean) as string[],
					},
				},
				select: {
					id: true,
					fileName: true,
				},
			})

			const existingDocsMap = new Map(
				existingDocs.map(doc => [doc.id, doc.fileName]),
			)

			// Process and validate updated documents
			const updatedDocuments = await Promise.all(
				documents.filter(attachmentHasId).map(async i => {
					if (attachmentHasFile(i)) {
						const blob = Buffer.from(await i.file.arrayBuffer())

						// Server-side file type validation
						const isPhoto = i.documentType === 'PHOTO'
						const validation = isPhoto
							? await validatePhotoFile(blob, i.file.type)
							: await validateDocumentFile(blob, i.file.type)

						if (!validation.valid) {
							throw new Error(validation.error || 'Invalid file type')
						}

						// Use existing fileName to overwrite the file in Azure
						const existingFileName = existingDocsMap.get(i.id!)
						return {
							id: i.id,
							altText: i.altText,
							contentType: i.file.type,
							blob,
							fileName: existingFileName ?? i.id!, // Use existing fileName or document ID as fallback
							extension: i.file.name.split('.').pop() ?? '',
						}
					} else {
						return { id: i.id }
					}
				}),
			)

			// Process and validate new documents
			const newDocuments = await Promise.all(
				documents
					.filter(attachmentHasFile)
					.filter(image => !image.id)
					.map(async image => {
						const blob = Buffer.from(await image.file.arrayBuffer())

						// Server-side file type validation
						const isPhoto = image.documentType === 'PHOTO'
						const validation = isPhoto
							? await validatePhotoFile(blob, image.file.type)
							: await validateDocumentFile(blob, image.file.type)

						if (!validation.valid) {
							throw new Error(validation.error || 'Invalid file type')
						}

						const extension = image.file.name.split('.').pop() ?? ''
						return {
							altText: `${image.file.name}`,
							contentType: image.file.type,
							documentType: image.documentType,
							blob,
							fileName: cuid(),
							extension,
						}
					}),
			)

			return {
				...data,
				updatedDocuments,
				newDocuments,
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

	const { updatedDocuments, newDocuments, participantId: _, ...formValues } = submission.value

	// Get Request Received step for this participant's workflow
	const requestReceived = await prisma.step.findFirstOrThrow({
		where: {
			name: 'Request Received',
			workflow: {
				tenantId: formValues.tenantId,
				eventId: formValues.eventId,
				participantTypeId: formValues.participantTypeId,
			},
		},
	})

	// Check if participant type changed - if so, reset meetings
	const originalParticipant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: { participantTypeId: true },
	})
	const participantTypeChanged = originalParticipant?.participantTypeId !== formValues.participantTypeId
	// If type changed, reset meetings to empty
	const effectiveMeetings = participantTypeChanged ? [] : (formValues.meetings ?? [])

	// Update document metadata in database for replaced documents
	const documentsToUpdate = updatedDocuments.filter(doc => 'blob' in doc)
	for (const doc of documentsToUpdate) {
		await prisma.participantDocument.update({
			where: { id: doc.id },
			data: {
				contentType: doc.contentType,
				altText: doc.altText,
				extension: doc.extension,
			},
		})
	}

	// Determine if participant is requesting Closed Session (for attendClosedSession field)
	const closedSessionMeetingType = await prisma.meetingType.findFirst({
		where: { tenantId: formValues.tenantId, name: 'Closed Session' },
		select: { id: true },
	})
	const attendClosedSession = closedSessionMeetingType
		? effectiveMeetings.includes(closedSessionMeetingType.id)
		: false

	// Determine if participant is requesting Executive Council Closed Session
	const executiveCouncilClosedSessionMeetingType =
		await prisma.meetingType.findFirst({
			where: {
				tenantId: formValues.tenantId,
				name: 'Executive Council Closed Session',
			},
			select: { id: true },
		})
	const attendExecutiveCouncilClosedSession =
		executiveCouncilClosedSessionMeetingType
			? effectiveMeetings.includes(executiveCouncilClosedSessionMeetingType.id)
			: false

	// Update participant
	await prisma.participant.update({
		where: { id: participantId },
		data: {
			participantTypeId: formValues.participantTypeId,
			gender: formValues.gender,
			titleId: formValues.titleId,
			firstName: formValues.firstName!,
			familyName: formValues.familyName!,
			dateOfBirth: formValues.dateOfBirth,
			nationalityId: formValues.nationalityId,
			passportNumber: formValues.passportNumber,
			passportExpiry: formValues.passportExpiry,
			email: formValues.email ?? null,
			organization: formValues.organization!,
			jobTitle: formValues.jobTitle!,
			countryId: formValues.countryId,
			city: formValues.city!,
			preferredLanguage: formValues.preferredLanguage,
			needsVisa: formValues.needsVisa,
			needsCarPass: formValues.needsCarPass,
			needsCarFromOrganizer: formValues.needsCarFromOrganizer,
			wishList: effectiveMeetings.length > 0 ? effectiveMeetings.join(',') : null,
			attendClosedSession,
			attendExecutiveCouncilClosedSession,
			stepId: requestReceived.id,
			status: RequestStatus.PENDING,
			documents: {
				create: newDocuments.map(({ blob, ...attachment }) => attachment),
			},
		},
	})

	// Process through workflow
	await processParticipant(
		participantId,
		user.id,
		Action.APPROVE,
		'Request Updated and Resubmitted',
	)

	await processParticipant(
		participantId,
		user.id,
		Action.APPROVE,
		'Updated Request Reviewed',
	)

	void sendParticipantEmail({
		participantId,
		trigger: 'REQUEST_RECEIVED',
		triggeredById: user.id,
		portalUrl: getDomainUrl(request),
	})

	// Upload new documents to Azure
	const newAttachmentsPromises = newDocuments.map(attachment =>
		uploadFile({
			containerName: 'accreditation',
			directory: `participants/${participantId}`,
			fileName: attachment.fileName,
			extension: attachment.extension,
			blob: attachment.blob,
		}),
	)

	// Upload updated documents to Azure
	const updatedAttachmentsPromises = updatedDocuments
		.filter(doc => 'blob' in doc)
		.map(attachment =>
			uploadFile({
				containerName: 'accreditation',
				directory: `participants/${participantId}`,
				fileName: attachment.fileName!,
				extension: attachment.extension!,
				blob: attachment.blob!,
			}),
		)

	await Promise.all([...newAttachmentsPromises, ...updatedAttachmentsPromises])

	return redirectWithToast(`/requests/${participantId}`, {
		type: 'success',
		title: `Request Updated`,
		description: `Your request has been updated and resubmitted for review.`,
	})
}

// =============================================================================
// DOCUMENT UPLOAD FIELD COMPONENT
// =============================================================================
// This component MUST be defined outside the main component to prevent
// re-creation on every render, which would lose file input state.

function DocumentUploadField({
	documentFields,
	documentType,
	existingDocumentId,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	documentFields: any
	documentType: string
	existingDocumentId?: string
}) {
	const isPhoto = documentType === 'PHOTO'
	const [previewFile, setPreviewFile] = useState<File | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [showPreview, setShowPreview] = useState(false)
	const [showCurrentPreview, setShowCurrentPreview] = useState(false)
	const fileInputRef = useRef<HTMLDivElement>(null)
	const existingDocumentUrl = existingDocumentId
		? getParticipantDocumentFileSrc(existingDocumentId)
		: null

	// Get icon based on document type
	const getDocumentIcon = () => {
		switch (documentType) {
			case 'PHOTO':
				return Camera
			case 'PASSPORT':
				return ImageIcon
			case 'LETTER':
				return FileText
			default:
				return FileText
		}
	}

	const DocumentIcon = getDocumentIcon()

	// Format document type name
	const getDocumentTypeName = () => {
		switch (documentType) {
			case 'PHOTO':
				return 'Photo'
			case 'PASSPORT':
				return 'Passport'
			case 'LETTER':
				return 'Participation Letter'
			default:
				return documentType
		}
	}

	// Get tooltip hint based on document type
	const getDocumentHint = () => {
		if (isPhoto) {
			return 'JPG or PNG format • Max size: 2MB • Auto-cropped to 35×45mm'
		} else if (documentType === 'PASSPORT') {
			return 'JPG, PNG, or PDF format • Max size: 2MB • Ensure all details are visible'
		} else {
			return 'JPG, PNG, or PDF format • Max size: 2MB • Include stamps and signatures'
		}
	}

	// Function to crop and resize image to 35x45mm (413x531px at 300 DPI)
	const cropImageTo35x45mm = (file: File): Promise<File> => {
		return new Promise((resolve, reject) => {
			// Validate file type first
			if (!file.type.startsWith('image/')) {
				reject(new Error(`Invalid file type: ${file.type}. Expected an image file.`))
				return
			}

			// Check file size
			if (file.size === 0) {
				reject(new Error('File is empty'))
				return
			}

			// Use FileReader to load the image as data URL (more reliable than object URL)
			const reader = new FileReader()
			let isResolved = false

			reader.onload = (e) => {
				if (isResolved) return

				const dataUrl = e.target?.result as string
				if (!dataUrl) {
					isResolved = true
					reject(new Error('Failed to read file as data URL'))
					return
				}

				const img = new Image()

				img.onload = () => {
					if (isResolved) return

					try {
						// Validate image loaded successfully
						if (img.width === 0 || img.height === 0) {
							isResolved = true
							reject(new Error('Invalid image dimensions'))
							return
						}

						// Target dimensions: 35x45mm at 300 DPI = 413x531 pixels
						const targetWidth = 413
						const targetHeight = 531
						const targetAspect = targetWidth / targetHeight // 0.778

						const canvas = document.createElement('canvas')
						canvas.width = targetWidth
						canvas.height = targetHeight
						const ctx = canvas.getContext('2d')
						if (!ctx) {
							isResolved = true
							reject(new Error('Could not get canvas context'))
							return
						}

						// Calculate crop to maintain 35x45mm aspect ratio
						const sourceAspect = img.width / img.height
						let sx = 0
						let sy = 0
						let sw = img.width
						let sh = img.height

						if (sourceAspect > targetAspect) {
							// Image is wider, crop horizontally (center crop)
							sw = img.height * targetAspect
							sx = (img.width - sw) / 2
						} else {
							// Image is taller, crop vertically (center crop)
							sh = img.width / targetAspect
							sy = (img.height - sh) / 2
						}

						// Draw cropped and scaled image to exact 35x45mm dimensions
						ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)

						canvas.toBlob(
							blob => {
								if (isResolved) return
								isResolved = true

								if (blob) {
									const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
										type: 'image/jpeg',
										lastModified: Date.now(),
									})
									resolve(croppedFile)
								} else {
									reject(new Error('Failed to create blob from canvas'))
								}
							},
							'image/jpeg',
							0.9,
						)
					} catch (error) {
						if (isResolved) return
						isResolved = true
						reject(error instanceof Error ? error : new Error(String(error)))
					}
				}

				img.onerror = () => {
					if (isResolved) return
					isResolved = true
					reject(new Error(`Failed to load image from data URL. File type: ${file.type}, Size: ${file.size} bytes`))
				}

				// Load image from data URL
				img.src = dataUrl
			}

			reader.onerror = () => {
				if (isResolved) return
				isResolved = true
				reject(new Error(`Failed to read file: ${reader.error?.message || 'Unknown error'}`))
			}

			// Read file as data URL
			reader.readAsDataURL(file)
		})
	}

	// Set up file change listener for preview and auto-crop
	useEffect(() => {
		if (!isPhoto) return

		let input: HTMLInputElement | null = null
		let isProcessing = false
		let cleanup: (() => void) | null = null

		const findAndSetupInput = () => {
			input = fileInputRef.current?.querySelector('input[type="file"]') as HTMLInputElement
			if (!input) return

			const handleChange = async (e: Event) => {
				// Prevent infinite loop if we're already processing
				if (isProcessing) return

				const target = e.target as HTMLInputElement
				const file = target.files?.[0]

				if (!file || !file.type.startsWith('image/')) {
					setPreviewFile(null)
					setPreviewUrl(null)
					return
				}

				isProcessing = true
				try {
					// Automatically crop to 35x45mm
					const croppedFile = await cropImageTo35x45mm(file)

					// Replace the file in the input
					if (!input) {
						throw new Error('Input element not found')
					}
					const dataTransfer = new DataTransfer()
					dataTransfer.items.add(croppedFile)
					input.files = dataTransfer.files

					// Set preview from cropped file
					setPreviewFile(croppedFile)
					const reader = new FileReader()
					reader.onloadend = () => {
						const result = reader.result as string
						setPreviewUrl(result)
						isProcessing = false
					}
					reader.onerror = () => {
						isProcessing = false
					}
					reader.readAsDataURL(croppedFile)

					// Trigger change event for Conform AFTER setting preview
					const currentInputForEvent = input
					if (currentInputForEvent) {
						setTimeout(() => {
							const changeEvent = new Event('change', { bubbles: true })
							currentInputForEvent.dispatchEvent(changeEvent)
						}, 100)
					}
				} catch (error) {
					alert(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`)
					// Reset input on error
					const currentInput = fileInputRef.current?.querySelector('input[type="file"]') as HTMLInputElement
					if (currentInput) {
						currentInput.value = ''
					}
					setPreviewFile(null)
					setPreviewUrl(null)
					isProcessing = false
				}
			}

			input.addEventListener('change', handleChange)
			cleanup = () => {
				input?.removeEventListener('change', handleChange)
			}
		}

		// Try to find input immediately
		findAndSetupInput()

		// If not found, try again after a short delay
		if (!input) {
			const timeout = setTimeout(() => {
				findAndSetupInput()
			}, 100)
			return () => {
				clearTimeout(timeout)
				cleanup?.()
			}
		}

		return cleanup || undefined
	}, [isPhoto])

	return (
		<>
			<div className="mb-6">
				<InputField meta={documentFields.id} type="hidden" />
				<InputField meta={documentFields.documentType} type="hidden" />

				{/* Document Header */}
				<div className="mb-3">
					<div className="flex items-center gap-2">
						<DocumentIcon className="h-5 w-5 text-primary" />
						<h3 className="font-semibold text-base">
							{getDocumentTypeName()}
						</h3>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{getDocumentHint()}
					</p>
				</div>

				{/* Two Column Layout - Current doc 20%, Upload section 80% */}
				<div className="grid grid-cols-1 md:grid-cols-[1fr_4fr] gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
					{/* Left Column - Current Document */}
					{existingDocumentUrl ? (
						<div className="space-y-3">
							{isPhoto ? (
								<div
									className="relative overflow-hidden rounded-lg border-2 border-gray-200 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
									onClick={() => setShowCurrentPreview(true)}
								>
									<img
										src={existingDocumentUrl}
										alt="Current photo"
										className="w-full h-auto object-contain"
										style={{ maxHeight: '200px' }}
									/>
									<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-10 transition-all">
										<Eye className="h-6 w-6 text-white opacity-0 hover:opacity-100" />
									</div>
								</div>
							) : (
								<div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center" style={{ minHeight: '200px' }}>
									<DocumentIcon className="h-12 w-12 text-gray-400 mb-2" />
									<p className="text-sm text-gray-600 mb-3">
										Document uploaded
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										asChild
									>
										<a
											href={existingDocumentUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-2"
										>
											<Eye className="h-4 w-4" />
											View Document
										</a>
									</Button>
								</div>
							)}
						</div>
					) : (
						<div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-6" style={{ minHeight: '200px' }}>
							<div className="text-center text-sm text-gray-500">
								<DocumentIcon className="h-10 w-10 mx-auto mb-2 text-gray-400" />
								No document uploaded yet
							</div>
						</div>
					)}

					{/* Right Column - Upload New */}
					<div className="space-y-3">
						<div className="space-y-2">
							<div className="flex gap-2">
								<div className="flex-1" ref={fileInputRef}>
									{isPhoto ? (
										<CameraFileInputField
											meta={documentFields.file}
											autoComplete="off"
											accept=".png,.jpg,.jpeg"
										/>
									) : (
										<FileInputField
											meta={documentFields.file}
											autoComplete="off"
											accept=".png,.jpg,.jpeg,.pdf"
										/>
									)}
								</div>
								{isPhoto && previewFile && previewUrl && (
									<Button
										type="button"
										variant="outline"
										onClick={() => setShowPreview(true)}
										className="shrink-0"
										title="Preview new photo"
									>
										<Eye className="h-4 w-4" />
									</Button>
								)}
							</div>

							{existingDocumentUrl && (
								<p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
									Leave empty to keep the current document
								</p>
							)}
						</div>
						{documentFields.file.errors && (
							<FieldError>{documentFields.file.errors}</FieldError>
						)}
					</div>
				</div>
			</div>

			{/* New Photo Preview Dialog */}
			{isPhoto && previewFile && previewUrl && (
				<Dialog open={showPreview} onOpenChange={setShowPreview}>
					<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>New Photo Preview</DialogTitle>
						</DialogHeader>
						<div className="mt-4">
							<div className="flex flex-col items-center gap-4">
								<img
									src={previewUrl}
									alt="Preview"
									className="border rounded-lg shadow-lg"
									style={{ width: '413px', height: '531px', objectFit: 'contain' }}
								/>
								<p className="text-sm text-muted-foreground">
									Dimensions: 35×45mm (413×531px at 300 DPI)
								</p>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			)}

			{/* Current Photo Preview Dialog */}
			{isPhoto && existingDocumentUrl && (
				<Dialog open={showCurrentPreview} onOpenChange={setShowCurrentPreview}>
					<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>Current Photo</DialogTitle>
						</DialogHeader>
						<div className="mt-4">
							<div className="flex flex-col items-center gap-4">
								<img
									src={existingDocumentUrl}
									alt="Current photo"
									className="border rounded-lg shadow-lg max-w-full h-auto"
								/>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}

export default function EditParticipantRoute() {
	const {
		participant,
		countries,
		meetingTypes,
		titles,
		isFocal,
		allowedParticipantTypes,
		canSelectClosedSession,
	} = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	// Participant type can be changed when editing a rejected request
	// Changing type will reset meeting selections and validate quota
	void isFocal // isFocal is available if needed for conditional UI

	const [form, fields] = useForm({
		id: 'edit-participant',
		constraint: getZodConstraint(EditParticipantSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EditParticipantSchema })
		},
		shouldValidate: 'onInput',
		shouldRevalidate: 'onInput',
		defaultValue: {
			participantId: participant.id,
			tenantId: participant.tenantId,
			eventId: participant.eventId,
			participantTypeId: participant.participantTypeId,
			gender: participant.gender,
			titleId: participant.titleId,
			firstName: participant.firstName,
			familyName: participant.familyName,
			dateOfBirth: participant.dateOfBirth,
			nationalityId: participant.nationalityId,
			passportNumber: participant.passportNumber,
			passportExpiry: participant.passportExpiry,
			organization: participant.organization,
			jobTitle: participant.jobTitle,
			countryId: participant.countryId,
			city: participant.city,
			email: participant.email,
			preferredLanguage: participant.preferredLanguage,
			needsVisa: participant.needsVisa,
			needsCarPass: participant.needsCarPass,
			needsCarFromOrganizer: participant.needsCarFromOrganizer,
			meetings: participant.wishList,
			documents: participant.documents.map(doc => ({
				id: doc.id,
				file: undefined,
				altText: doc.altText ?? doc.documentType,
				documentType: doc.documentType,
			})),
		},
	})

	const documents = fields.documents.getFieldList()

	return (
		<div className="space-y-6">
			<Alert className="border-red-200 bg-red-50 text-red-900">
				<AlertCircle className="h-5 w-5 text-red-600" />
				<AlertDescription className="text-sm">
					<span className="font-semibold">Editing Rejected Request</span>
					<br />
					Please review and update the information below, then resubmit for review.
				</AlertDescription>
			</Alert>

			{form.errors && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>
						<ErrorList errors={form.errors} id={form.errorId} />
					</AlertDescription>
				</Alert>
			)}

			<FormCard
				formId={form.id}
				onSubmit={form.onSubmit}
				encType="multipart/form-data"
				bordered={false}
				buttons={[
					{
						label: 'Update and Resubmit',
						intent: 'save',
						variant: 'default',
						type: 'submit',
						disabled: isPending,
						status: isPending ? 'pending' : (actionData?.result.status ?? 'idle'),
					},
					{
						label: 'Cancel',
						to: `/requests/${participant.id}`,
						type: 'link',
					},
				]}
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<InputField meta={fields.participantId} type="hidden" />
				<InputField meta={fields.tenantId} type="hidden" />
				<InputField meta={fields.eventId} type="hidden" />

				{/* Section 1: General Information */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						General Information
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field>
									<Label htmlFor={fields.firstName.id}>First Name</Label>
									<InputField
										meta={fields.firstName}
										type="text"
										autoCapitalize="words"
										autoCorrect="off"
										spellCheck={false}
									/>
									{fields.firstName.errors && (
										<FieldError>{fields.firstName.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.familyName.id}>Family Name</Label>
									<InputField
										meta={fields.familyName}
										type="text"
										autoCapitalize="words"
										autoCorrect="off"
										spellCheck={false}
									/>
									{fields.familyName.errors && (
										<FieldError>{fields.familyName.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.gender.id}>Gender</Label>
								<SelectField
									meta={fields.gender}
									items={['MALE', 'FEMALE'].map(gender => ({
										name: gender,
										value: gender,
									}))}
									placeholder="Select"
								/>
								{fields.gender.errors && (
									<FieldError>{fields.gender.errors}</FieldError>
								)}
							</Field>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field>
									<Label htmlFor={fields.titleId.id}>Title</Label>
									<SelectField
										meta={fields.titleId}
										items={titles.map(title => ({
											name: title.name,
											value: title.id,
										}))}
										placeholder="Select"
									/>
									{fields.titleId.errors && (
										<FieldError>{fields.titleId.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.dateOfBirth.id}>Date of Birth</Label>
									<DatePickerField meta={fields.dateOfBirth} />
									{fields.dateOfBirth.errors && (
										<FieldError>{fields.dateOfBirth.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.nationalityId.id}>Nationality</Label>
								<SelectField
									meta={fields.nationalityId}
									items={countries.map(country => ({
										name: country.name,
										value: country.id,
									}))}
									placeholder="Select"
								/>
								{fields.nationalityId.errors && (
									<FieldError>{fields.nationalityId.errors}</FieldError>
								)}
							</Field>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field>
									<Label htmlFor={fields.passportNumber.id}>Passport Number</Label>
									<InputField
										meta={fields.passportNumber}
										type="text"
										autoCapitalize="characters"
										autoCorrect="off"
										spellCheck={false}
									/>
									{fields.passportNumber.errors && (
										<FieldError>{fields.passportNumber.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.passportExpiry.id}>Passport Expiry</Label>
									<DatePickerField meta={fields.passportExpiry} />
									{fields.passportExpiry.errors && (
										<FieldError>{fields.passportExpiry.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.participantTypeId.id}>Participant Type</Label>
								<SelectField
									meta={fields.participantTypeId}
									items={allowedParticipantTypes.map(pt => ({
										name: pt.name,
										value: pt.id,
									}))}
									placeholder="Select participant type"
								/>
								{fields.participantTypeId.errors && (
									<FieldError>{fields.participantTypeId.errors}</FieldError>
								)}
								<p className="text-xs text-muted-foreground">
									Note: Changing participant type will reset your meeting selections.
								</p>
							</Field>
						</CardContent>
					</Card>
				</div>

				{/* Section 2: Professional Information */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						Professional Information
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field>
									<Label htmlFor={fields.organization.id}>Organization</Label>
									<InputField meta={fields.organization} type="text" />
									{fields.organization.errors && (
										<FieldError>{fields.organization.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.jobTitle.id}>Job Title</Label>
									<InputField meta={fields.jobTitle} type="text" />
									{fields.jobTitle.errors && (
										<FieldError>{fields.jobTitle.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.countryId.id}>Country</Label>
								<SelectField
									meta={fields.countryId}
									items={countries.map(country => ({
										name: country.name,
										value: country.id,
									}))}
									placeholder="Select Your Country"
								/>
								{fields.countryId.errors && (
									<FieldError>{fields.countryId.errors}</FieldError>
								)}
							</Field>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field>
									<Label htmlFor={fields.city.id}>City</Label>
									<InputField meta={fields.city} type="text" />
									{fields.city.errors && <FieldError>{fields.city.errors}</FieldError>}
								</Field>

								<Field>
									<Label htmlFor={fields.email.id}>Email</Label>
									<InputField meta={fields.email} type="email" />
									{fields.email.errors && (
										<FieldError>{fields.email.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.preferredLanguage.id}>
									Preferred Language
								</Label>
								<SelectField
									meta={fields.preferredLanguage}
									items={[
										'ENGLISH',
										'FRENCH',
										'PORTUGUESE',
										'ARABIC',
										'SWAHLI',
										'OTHER',
									].map(language => ({
										name: language,
										value: language,
									}))}
									placeholder="Select Preferred Language"
								/>
								{fields.preferredLanguage.errors && (
									<FieldError>{fields.preferredLanguage.errors}</FieldError>
								)}
							</Field>
						</CardContent>
					</Card>
				</div>

				{/* Section 3: Wishlist (Optional) */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						Meeting Wishlist (Optional)
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							<Field>
								<fieldset>
									<CheckboxGroupField
										meta={fields.meetings}
										items={meetingTypes
											.filter(meetingType => {
												// Closed Session: only show if:
												// 1. Participant previously had it selected (can't add new during edit), AND
												// 2. Quota is still available (in case it became full while rejected)
												if (meetingType.name === 'Closed Session') {
													return (
														participant.wishList.includes(meetingType.id) &&
														canSelectClosedSession
													)
												}
												// Hide Executive Council Closed Session from user registration
												if (
													meetingType.name ===
													'Executive Council Closed Session'
												) {
													return false
												}
												return true
											})
											.map(meetingType => ({
												name: meetingType.name,
												value: meetingType.id,
											}))}
									/>
									{fields.meetings.errors && (
										<FieldError>{fields.meetings.errors}</FieldError>
									)}
								</fieldset>
							</Field>
						</CardContent>
					</Card>
				</div>

				{/* Section 4: Supporting Documents */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						Supporting Documents
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							{documents.map((document, index) => {
								const documentFields = document.getFieldset()
								return (
									<DocumentUploadField
										key={index}
										documentFields={documentFields}
										documentType={documentFields.documentType.value as string}
										existingDocumentId={documentFields.id.value as string | undefined}
									/>
								)
							})}
						</CardContent>
					</Card>
				</div>
			</FormCard>
		</div>
	)
}
