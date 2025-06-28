import { FieldMetadata, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Participant, ParticipantDocument, RequestStatus } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { PaperclipIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { getParticipantDocumentFileSrc, useIsPending } from '~/utils/misc'
import { type action } from './documents'

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB

const AttachmentFieldSetSchema = z
	.object({
		id: z.string().optional(),
		file: z
			.instanceof(File)
			.optional()
			.refine(file => !file || file.size <= MAX_UPLOAD_SIZE, {
				message: 'File size must be less than 3MB',
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
			// Either an ID (existing file) or a new file must be present
			return Boolean(data.id) || Boolean(data.file?.size)
		},
		{
			message: 'A file must be attached',
			path: ['file'], // This will show the error on the file field
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

export const DocumentsEditorSchema = z
	.object({
		id: z.string().optional(),
		documents: z.array(AttachmentFieldSetSchema),
	})
	.refine(
		data => {
			const requiredTypes = ['PASSPORT', 'PHOTO', 'LETTER']
			return requiredTypes.every(type =>
				data.documents.some(
					doc =>
						doc.documentType === type &&
						(Boolean(doc.id) || Boolean(doc.file?.size)),
				),
			)
		},
		{
			message: 'All required documents must be attached',
		},
	)

export function DocumentsEditor({
	participant,
	intent,
	status,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id'> & {
			documents: Array<
				Pick<
					ParticipantDocument,
					| 'id'
					| 'altText'
					| 'documentType'
					| 'contentType'
					| 'fileName'
					| 'extension'
				>
			>
			participantType: any
		}
	>
	status?: RequestStatus
	intent?: 'add' | 'edit' | 'delete'
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = DocumentsEditorSchema
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'register-participant',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
			documents: (() => {
				const requiredTypes = ['PASSPORT', 'PHOTO', 'LETTER']
				const existingDocs = participant?.documents || []

				// If no documents exist, return default array
				if (!existingDocs.length) {
					return [
						{
							id: '',
							file: null,
							altText: 'Passport',
							documentType: 'PASSPORT',
						},
						{
							id: '',
							file: null,
							altText: 'Photo',
							documentType: 'PHOTO',
						},
						{
							id: '',
							file: null,
							altText: 'Invitation Letter',
							documentType: 'LETTER',
						},
					]
				}

				// Add missing document types
				const missingTypes = requiredTypes.filter(
					type => !existingDocs.some(doc => doc.documentType === type),
				)

				return [
					...existingDocs,
					...missingTypes.map(type => ({
						id: '',
						file: null,
						altText:
							type === 'PASSPORT'
								? 'Passport'
								: type === 'PHOTO'
									? 'Photo'
									: 'Invitation Letter',
						documentType: type,
					})),
				]
			})(),
		},
	})

	const documents = fields.documents.getFieldList()

	return (
		<FormCard
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				// {
				// 	label: 'Prev',
				// 	intent: 'prev',
				// 	variant: 'default',
				// 	disabled: isPending,
				// 	status: actionData?.result.status,
				// 	type: 'submit',
				// },

				{
					label: 'Prev',
					type: 'link',
					to: '/requests/wishlist',
				},
				{
					label: status === 'REJECTED' ? 'Resubmit' : 'Submit',
					intent: 'documents',
					variant: 'default',
					disabled: isPending,
					status: isPending ? 'pending' : (actionData?.result.status ?? 'idle'),
					type: 'submit',
				},
				{
					label: 'Cancel',
					to: '/requests',
					type: 'link',
				},
			]}
			encType="multipart/form-data"
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			<fieldset className="rounded-md border p-4" key="documents">
				<div className="mb-4 flex space-x-4 border-b pb-2">
					<div className="flex-1">Supporting Documents</div>
				</div>

				{documents.map((document, index) => {
					return (
						<AttachmentField
							key={index}
							document={document}
							intent={intent ?? 'add'}
							disabled={disabled}
							actions={{
								onRemove: event => {
									event.preventDefault()
									form.remove({
										name: fields.documents.name,
										index,
									})
								},
							}}
						/>
					)
				})}
			</fieldset>

			<ErrorList errors={form.errors} />
		</FormCard>
	)
}

export function AttachmentField({
	document,
	intent,
	disabled,
	actions,
}: {
	document: FieldMetadata<AttachmentFieldSet>
	intent: 'add' | 'edit' | 'delete'
	disabled: boolean
	actions: {
		onRemove: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
	}
}) {
	const documentFields = document.getFieldset()
	const existingFile = Boolean(documentFields.id.initialValue)
	const link = getParticipantDocumentFileSrc(
		documentFields.id.initialValue ?? '',
	)

	return (
		<div className="mb-4">
			<div className="w-full">
				<InputField meta={documentFields.id} type="hidden" />
				<InputField meta={documentFields.documentType} type="hidden" />

				<Field>
					<Label htmlFor={documentFields.file.id}>
						{documentFields.documentType.initialValue}
					</Label>
					<div className="flex items-center gap-4">
						<div className="flex-1">
							<FileInputField
								meta={documentFields.file}
								disabled={disabled}
								autoComplete="off"
								accept={
									documentFields.documentType.value === 'PHOTO'
										? '.png,.jpg,.jpeg'
										: '.png,.jpg,.jpeg,.pdf'
								}
							/>
							{documentFields.file.errors && (
								<FieldError>{documentFields.file.errors}</FieldError>
							)}
						</div>
						{existingFile && (
							<div className="flex items-center gap-2 whitespace-nowrap">
								<a
									href={link}
									className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-500"
								>
									<PaperclipIcon className="h-4 w-4" />
									<span>{documentFields.documentType.initialValue}</span>
								</a>
							</div>
						)}
					</div>
				</Field>
			</div>
		</div>
	)
}
