import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	Country,
	Event,
	Invitation,
	MeetingType,
	Participant,
	ParticipantDocument,
	ParticipantType,
	RequestStatus,
	Tenant,
} from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AlertCircle } from 'lucide-react'
import { useMemo } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { useOptionalUser, userHasRole } from '~/utils/user'
import { xssTransform } from '~/utils/validations'

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
			// Either an ID (existing file) or a new file with size > 0 must be present
			return Boolean(data.id) || Boolean(data.file && data.file.size > 0)
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
	return Boolean(attachment.file && attachment.file.size > 0)
}

export function attachmentHasId(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	id: NonNullable<AttachmentFieldSet['id']>
} {
	return attachment.id != null
}

export const RegistrationEditorSchema = z
	.object({
		id: z.string().optional(),
		tenantId: z.string({ required_error: 'Tenant is required' }),
		eventId: z.string({ required_error: 'Event is required' }),
		participantTypeId: z.string({
			required_error: 'Participant Type is required',
		}),
		invitationId: z.string().optional(),
		gender: z.enum(['MALE', 'FEMALE']),
		title: z.enum(
			[
				'MR.',
				'MRS.',
				'MS.',
				'DR.',
				'PhD.',
				'Ambassador',
				'H.E.',
				'H.M',
				'Commissioner',
				'Deputy Commissioner',
				'Commissioner General',
				'Deputy Commissioner General',
			],
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
		dateOfBirth: z
			.date({ required_error: 'Date of Birth is required' })
			.max(new Date(), { message: 'Date of Birth cannot be in the future' }),
		nationalityId: z.string({ required_error: 'Nationality is required' }),
		passportNumber: z
			.string({ required_error: 'Passport Number is required' })
			.regex(/^[a-zA-Z0-9- ]+$/, { message: 'Invalid passport number' })
			.transform(xssTransform)
			.transform(value => value?.replace(/[- ]/g, '') ?? '')
			.transform(value => value.toUpperCase()),
		passportExpiry: z
			.date({ required_error: 'Passport Expiry is required' })
			.min(new Date(new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000), {
				message: 'Passport expiry date cannot be in the past',
			}),
		requestFor: z
			.enum(['MYSELF', 'OTHERS'], {
				required_error: 'Request For is required',
			})
			.default('MYSELF'),
		// Professional info
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
			.string({ required_error: 'Email is required' })
			.email({ message: 'Email is invalid' })
			.min(3, { message: 'Email is too short' })
			.max(100, { message: 'Email is too long' })
			.transform(value => value.toLowerCase())
			.transform(xssTransform),
		website: z.string().optional().transform(xssTransform),
		telephone: z.string().optional().transform(xssTransform),
		address: z.string().optional().transform(xssTransform),
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
		vehicleType: z.string().optional().transform(xssTransform),
		vehiclePlateNumber: z.string().optional().transform(xssTransform),
		flightNumber: z.string().optional().transform(xssTransform),
		arrivalDate: z.date().optional(),
		meetings: z.array(z.string()).optional(),
		// Documents
		documents: z.array(AttachmentFieldSetSchema),
	})
	.superRefine((data, ctx) => {
		if (data.requestFor === 'OTHERS' && !data.invitationId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Select an invitation',
				path: ['invitationId'],
			})
		}
	})
	.refine(
		data => {
			const requiredTypes = ['PASSPORT', 'PHOTO', 'LETTER']
			return requiredTypes.every(type =>
				data.documents.some(
					doc =>
						doc.documentType === type &&
						(Boolean(doc.id) || Boolean(doc.file && doc.file.size > 0)),
				),
			)
		},
		{
			message: 'All required documents must be attached',
		},
	)

export function RegistrationEditor({
	participant,
	intent,
	invitations,
	tenants,
	events,
	participantTypes,
	countries,
	meetingTypes,
	availableClosedSessionQuota,
	templates,
	status,
}: {
	participant?: SerializeFrom<
		Pick<
			Participant,
			| 'id'
			| 'tenantId'
			| 'eventId'
			| 'participantTypeId'
			| 'countryId'
			| 'invitationId'
			| 'firstName'
			| 'familyName'
			| 'title'
			| 'gender'
			| 'dateOfBirth'
			| 'nationalityId'
			| 'passportNumber'
			| 'passportExpiry'
			| 'email'
			| 'organization'
			| 'jobTitle'
			| 'city'
			| 'website'
			| 'telephone'
			| 'address'
			| 'preferredLanguage'
			| 'needsVisa'
			| 'needsCarPass'
			| 'vehicleType'
			| 'vehiclePlateNumber'
			| 'needsCarFromOrganizer'
			| 'flightNumber'
			| 'arrivalDate'
		> & {
			requestFor?: 'MYSELF' | 'OTHERS'
			meetings?: Array<string>
			documents?: Array<
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
		}
	>
	intent?: 'add' | 'edit' | 'delete'
	invitations: SerializeFrom<
		Invitation & {
			participantType: ParticipantType
			participants: {
				participantType: ParticipantType
				organization: string
			}[]
			restriction: {
				constraints: {
					id: string
					quota: number
					participantTypeId: string
					participantType: ParticipantType & {
						participants: { organization: string }[]
					}
				}[]
			} | null
		}
	>[]
	tenants: SerializeFrom<Pick<Tenant, 'id' | 'name'>>[]
	events: SerializeFrom<Pick<Event, 'id' | 'name'>>[]
	participantTypes: SerializeFrom<Pick<ParticipantType, 'id' | 'name'>>[]
	countries: SerializeFrom<Pick<Country, 'id' | 'name'>>[]
	meetingTypes: SerializeFrom<Pick<MeetingType, 'id' | 'name'>>[]
	availableClosedSessionQuota?: number
	templates?: any
	status?: RequestStatus
}) {
	const actionData = useActionData<any>()
	const disabled = intent === 'delete'
	const isPending = useIsPending()
	const user = useOptionalUser()

	const [form, fields] = useForm({
		id: 'register-participant',
		constraint: getZodConstraint(RegistrationEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: RegistrationEditorSchema })
		},
		shouldValidate: 'onInput',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
			requestFor: participant?.requestFor ?? 'MYSELF',
			email: participant?.email || '',
			meetings: participant?.meetings?.map(meeting => meeting),
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

	const availableParticipantTypes = useMemo(() => {
		const baseTypes = participantTypes.filter(pt => pt.name !== 'All')

		if (!userHasRole(user, 'focal')) {
			return baseTypes
		}

		if (fields.requestFor.value === 'MYSELF') {
			return baseTypes
		}

		if (!fields.invitationId.value) return []

		const selectedInvitation = invitations.find(
			inv => inv.id === fields.invitationId.value,
		)
		if (!selectedInvitation) return []

		// Check maximum quota using invitation's participants
		if (selectedInvitation.maximumQuota) {
			const totalParticipants = selectedInvitation.participants.filter(
				p => p.organization === selectedInvitation.organization,
			).length

			if (totalParticipants >= selectedInvitation.maximumQuota) {
				return [] // Block all registration if max quota reached
			}
		}

		// Get participant types based on invitation's participantType
		if (selectedInvitation.participantType) {
			return baseTypes.filter(
				pt => pt.id === selectedInvitation.participantType.id,
			)
		}

		return baseTypes
	}, [
		participantTypes,
		user,
		fields.requestFor.value,
		fields.invitationId.value,
		invitations,
	])

	const documents = fields.documents.getFieldList()

	return (
		<>
			{form.errors && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>
						<ErrorList errors={form.errors} id={form.errorId} />
					</AlertDescription>
				</Alert>
			)}

			<FormCard
				formId={form.id}
				onSubmit={form.onSubmit}
				buttons={[
					{
						label: 'Cancel',
						to: '/events',
						type: 'link',
					},
					{
						label: 'Submit Registration',
						intent: 'submit',
						variant: 'default',
						disabled: isPending,
						status: isPending
							? 'pending'
							: (actionData?.result.status ?? 'idle'),
						type: 'submit',
					},
				]}
				encType="multipart/form-data"
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<InputField meta={fields.id} type="hidden" />
				<InputField meta={fields.tenantId} type="hidden" />
				<InputField meta={fields.eventId} type="hidden" />
				<InputField meta={fields.email} type="hidden" />

				{/* Event Information */}
				<div className="space-y-6">
					<div className="border-b pb-4">
						<h3 className="mb-4 text-lg font-semibold">Event Information</h3>
						<div
							className={`grid grid-cols-1 gap-4 ${
								!userHasRole(user, 'focal')
									? 'md:grid-cols-2'
									: fields.requestFor.value === 'OTHERS'
										? 'md:grid-cols-4'
										: 'md:grid-cols-3'
							}`}
						>
							{userHasRole(user, 'focal') && (
								<Field>
									<Label htmlFor={fields.requestFor.id}>Request For</Label>
									<SelectField
										meta={fields.requestFor}
										items={[
											{ name: 'Myself', value: 'MYSELF' },
											{ name: 'Others', value: 'OTHERS' },
										]}
										placeholder="Select request type"
									/>
									{fields.requestFor.errors && (
										<FieldError>{fields.requestFor.errors}</FieldError>
									)}
								</Field>
							)}

							{fields.requestFor.value === 'OTHERS' && (
								<Field>
									<Label htmlFor={fields.invitationId.id}>Invitation</Label>
									<SelectField
										meta={fields.invitationId}
										items={invitations.map(invitation => ({
											name: invitation.organization,
											value: invitation.id,
										}))}
										placeholder="Select invitation"
									/>
									{fields.invitationId.errors && (
										<FieldError>{fields.invitationId.errors}</FieldError>
									)}
								</Field>
							)}

							<Field>
								<Label htmlFor={fields.tenantId.id}>Organizer</Label>
								<div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
									{
										tenants.find(tenant => tenant.id === fields.tenantId.value)
											?.name
									}
								</div>
							</Field>

							<Field>
								<Label htmlFor={fields.eventId.id}>Event</Label>
								<div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
									{
										events.find(event => event.id === fields.eventId.value)
											?.name
									}
								</div>
							</Field>
						</div>
					</div>

					{/* Personal Information */}
					<div className="border-b pb-4">
						<h3 className="mb-4 text-lg font-semibold">Personal Information</h3>
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<Field>
									<Label htmlFor={fields.firstName.id}>First Name</Label>
									<InputField
										meta={fields.firstName}
										type="text"
										autoComplete="off"
										disabled={disabled}
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
										autoComplete="off"
										disabled={disabled}
									/>
									{fields.familyName.errors && (
										<FieldError>{fields.familyName.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.gender.id}>Gender</Label>
									<SelectField
										meta={fields.gender}
										items={[
											{ name: 'Male', value: 'MALE' },
											{ name: 'Female', value: 'FEMALE' },
										]}
										placeholder="Select gender"
									/>
									{fields.gender.errors && (
										<FieldError>{fields.gender.errors}</FieldError>
									)}
								</Field>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<Field>
									<Label htmlFor={fields.title.id}>Title</Label>
									<SelectField
										meta={fields.title}
										items={[
											{ name: 'Mr.', value: 'MR.' },
											{ name: 'Mrs.', value: 'MRS.' },
											{ name: 'Ms.', value: 'MS.' },
											{ name: 'Dr.', value: 'DR.' },
											{ name: 'PhD.', value: 'PhD.' },
											{ name: 'Ambassador', value: 'Ambassador' },
											{ name: 'H.E.', value: 'H.E.' },
											{ name: 'H.M', value: 'H.M' },
											{ name: 'Commissioner', value: 'Commissioner' },
											{
												name: 'Deputy Commissioner',
												value: 'Deputy Commissioner',
											},
											{
												name: 'Commissioner General',
												value: 'Commissioner General',
											},
											{
												name: 'Deputy Commissioner General',
												value: 'Deputy Commissioner General',
											},
										]}
										placeholder="Select title"
									/>
									{fields.title.errors && (
										<FieldError>{fields.title.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.dateOfBirth.id}>Date of Birth</Label>
									<DatePickerField
										meta={fields.dateOfBirth}
										disabled={disabled}
									/>
									{fields.dateOfBirth.errors && (
										<FieldError>{fields.dateOfBirth.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.nationalityId.id}>Nationality</Label>
									<SelectField
										meta={fields.nationalityId}
										items={countries.map(country => ({
											name: country.name,
											value: country.id,
										}))}
										placeholder="Select nationality"
									/>
									{fields.nationalityId.errors && (
										<FieldError>{fields.nationalityId.errors}</FieldError>
									)}
								</Field>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<Field>
									<Label htmlFor={fields.passportNumber.id}>
										Passport Number/National ID/Drivers License
									</Label>
									<InputField
										meta={fields.passportNumber}
										type="text"
										disabled={disabled}
									/>
									{fields.passportNumber.errors && (
										<FieldError>{fields.passportNumber.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.passportExpiry.id}>Expiry Date</Label>
									<DatePickerField
										meta={fields.passportExpiry}
										disabled={disabled}
									/>
									{fields.passportExpiry.errors && (
										<FieldError>{fields.passportExpiry.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.participantTypeId.id}>
										Participant Type
									</Label>
									<SelectField
										meta={fields.participantTypeId}
										items={availableParticipantTypes.map(type => ({
											name: type.name,
											value: type.id,
										}))}
										placeholder="Select participant type"
									/>
									{fields.participantTypeId.errors && (
										<FieldError>{fields.participantTypeId.errors}</FieldError>
									)}
								</Field>
							</div>
						</div>
					</div>

					{/* Professional Information */}
					<div className="border-b pb-4">
						<h3 className="mb-4 text-lg font-semibold">
							Professional Information
						</h3>
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<Field>
									<Label htmlFor={fields.organization.id}>Organization</Label>
									<InputField
										meta={fields.organization}
										type="text"
										disabled={disabled}
									/>
									{fields.organization.errors && (
										<FieldError>{fields.organization.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.jobTitle.id}>Job Title</Label>
									<InputField
										meta={fields.jobTitle}
										type="text"
										disabled={disabled}
									/>
									{fields.jobTitle.errors && (
										<FieldError>{fields.jobTitle.errors}</FieldError>
									)}
								</Field>

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
							</div>

							<div
								className={`grid grid-cols-1 gap-4 md:grid-cols-${
									fields.requestFor.value === 'MYSELF' ? 2 : 3
								}`}
							>
								<Field>
									<Label htmlFor={fields.city.id}>City</Label>
									<InputField
										meta={fields.city}
										type="text"
										disabled={disabled}
									/>
									{fields.city.errors && (
										<FieldError>{fields.city.errors} </FieldError>
									)}
								</Field>

								{fields.requestFor.value === 'OTHERS' && (
									<Field>
										<Label htmlFor={fields.email.id}>Email</Label>
										<InputField meta={fields.email} type="email" />
										{fields.email.errors && (
											<FieldError>{fields.email.errors}</FieldError>
										)}
									</Field>
								)}

								<Field>
									<Label htmlFor={fields.website.id}>Website</Label>
									<InputField
										meta={fields.website}
										type="text"
										disabled={disabled}
									/>
									{fields.website.errors && (
										<FieldError>{fields.website.errors}</FieldError>
									)}
								</Field>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<Field>
									<Label htmlFor={fields.telephone.id}>Telephone</Label>
									<InputField
										meta={fields.telephone}
										type="text"
										disabled={disabled}
									/>
									{fields.telephone.errors && (
										<FieldError>{fields.telephone.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.preferredLanguage.id}>
										Preferred Language
									</Label>
									<SelectField
										meta={fields.preferredLanguage}
										items={[
											{ name: 'English', value: 'ENGLISH' },
											{ name: 'French', value: 'FRENCH' },
											{ name: 'Portuguese', value: 'PORTUGUESE' },
											{ name: 'Arabic', value: 'ARABIC' },
											{ name: 'Swahli', value: 'SWAHLI' },
											{ name: 'Other', value: 'OTHER' },
										]}
										placeholder="Select language"
									/>
									{fields.preferredLanguage.errors && (
										<FieldError>{fields.preferredLanguage.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.address.id}>Address</Label>
									<InputField
										meta={fields.address}
										type="text"
										disabled={disabled}
									/>
									{fields.address.errors && (
										<FieldError>{fields.address.errors}</FieldError>
									)}
								</Field>
							</div>
						</div>
					</div>

					{/* Travel Information */}
					{/* <div className="border-b pb-4">
						<h3 className="mb-4 text-lg font-semibold">Travel Information</h3>
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<Field>
									<Label htmlFor={fields.needsVisa.id}>Needs Visa</Label>
									<SwitchField meta={fields.needsVisa} />
									{fields.needsVisa.errors && (
										<FieldError>{fields.needsVisa.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.needsCarPass.id}>Needs Car Pass</Label>
									<SwitchField meta={fields.needsCarPass} />
									{fields.needsCarPass.errors && (
										<FieldError>{fields.needsCarPass.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.needsCarFromOrganizer.id}>
										Needs Car From Organizer
									</Label>
									<SwitchField meta={fields.needsCarFromOrganizer} />
									{fields.needsCarFromOrganizer.errors && (
										<FieldError>
											{fields.needsCarFromOrganizer.errors}
										</FieldError>
									)}
								</Field>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.flightNumber.id}>Flight Number</Label>
									<InputField
										meta={fields.flightNumber}
										type="text"
										disabled={disabled}
									/>
									{fields.flightNumber.errors && (
										<FieldError>{fields.flightNumber.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.arrivalDate.id}>Arrival Date</Label>
									<DatePickerField
										meta={fields.arrivalDate}
										disabled={disabled}
									/>
									{fields.arrivalDate.errors && (
										<FieldError>{fields.arrivalDate.errors}</FieldError>
									)}
								</Field>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.vehicleType.id}>Vehicle Type</Label>
									<InputField
										meta={fields.vehicleType}
										type="text"
										disabled={disabled}
									/>
									{fields.vehicleType.errors && (
										<FieldError>{fields.vehicleType.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.vehiclePlateNumber.id}>
										Vehicle Plate Number
									</Label>
									<InputField
										meta={fields.vehiclePlateNumber}
										type="text"
										disabled={disabled}
									/>
									{fields.vehiclePlateNumber.errors && (
										<FieldError>{fields.vehiclePlateNumber.errors}</FieldError>
									)}
								</Field>
							</div>
						</div>
					</div> */}

					{/* Meetings Wishlist */}
					<div className="border-b pb-4">
						<h3 className="mb-4 text-lg font-semibold">Meetings & Sessions</h3>
						<Field>
							<fieldset>
								{/* <legend className="mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
									Meetings Wishlist
								</legend> */}
								<CheckboxGroupField
									meta={fields.meetings}
									items={meetingTypes
										.filter(meetingType => {
											if (meetingType.name === 'Closed Session') {
												return (availableClosedSessionQuota ?? 0) > 0
											}
											return true
										})
										.map(meetingType => ({
											name: meetingType.name,
											value: meetingType.id,
										}))}
								/>
							</fieldset>
						</Field>
					</div>

					{/* Documents */}
					<div>
						<h3 className="mb-4 text-lg font-semibold">Required Documents</h3>
						<Field>
							<fieldset>
								{/* <legend className="mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
									Upload Documents
								</legend> */}
								<div className="space-y-4">
									{documents.map((document, index) => {
										const documentFields = document.getFieldset()
										const existingFile = Boolean(documentFields.id.initialValue)
										const fileName = documentFields.altText.initialValue

										return (
											<div key={index} className="space-y-2">
												<Label htmlFor={documentFields.file.id}>
													{documentFields.documentType.initialValue}
												</Label>
												<div className="space-y-2">
													<InputField meta={documentFields.id} type="hidden" />
													<InputField
														meta={documentFields.documentType}
														type="hidden"
													/>
													<InputField
														meta={documentFields.altText}
														type="hidden"
													/>

													{existingFile && (
														<div className="flex items-center gap-2">
															<div className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm">
																Current: {fileName}
															</div>
															<a
																href={`/resources/participants/${documentFields.id.initialValue}`}
																target="_blank"
																rel="noopener noreferrer"
																className="text-sm text-blue-600 underline hover:text-blue-800"
															>
																View
															</a>
														</div>
													)}

													<FileInputField
														meta={documentFields.file}
														disabled={disabled}
														autoComplete="off"
														accept={
															documentFields.documentType.value === 'PHOTO'
																? '.png,.jpg,.jpeg'
																: '.png,.jpg,.jpeg,.pdf'
														}
														placeholder={
															existingFile
																? 'Upload new file to replace current'
																: 'Upload file'
														}
													/>

													{documentFields.file.errors && (
														<FieldError>
															{documentFields.file.errors}
														</FieldError>
													)}
												</div>
											</div>
										)
									})}
								</div>
							</fieldset>
						</Field>
					</div>
				</div>
			</FormCard>
		</>
	)
}
