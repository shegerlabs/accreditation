import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	Country,
	Event,
	Invitation,
	Participant,
	ParticipantType,
	Tenant,
} from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AlertCircle } from 'lucide-react'
import { useMemo } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { useOptionalUser, userHasRole } from '~/utils/user'
import { xssTransform } from '~/utils/validations'
import { action } from './general'

export const GeneralInfoEditorSchema = z
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

export function GeneralInfoEditor({
	participant,
	intent,
	invitations,
	tenants,
	events,
	participantTypes,
	countries,
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
		> & {
			requestFor?: 'MYSELF' | 'OTHERS'
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
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const isPending = useIsPending()
	const user = useOptionalUser()

	const [form, fields] = useForm({
		id: 'register-participant',
		constraint: getZodConstraint(GeneralInfoEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: GeneralInfoEditorSchema })
		},
		shouldValidate: 'onInput',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
			requestFor: participant?.requestFor ?? 'MYSELF',
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

		// 3. Get initial participant types based on invitation's participantType
		const allowedTypes =
			selectedInvitation.participantType.name === 'All'
				? baseTypes // All participant types for 'All'
				: baseTypes.filter(pt => pt.id === selectedInvitation.participantTypeId) // Specific type only

		// 4. Check restrictions and constraints
		if (selectedInvitation.restriction) {
			return allowedTypes.filter(pt => {
				const constraint = selectedInvitation.restriction?.constraints.find(
					c => c.participantType.id === pt.id,
				)

				// If no constraint found for this type, it's allowed
				if (!constraint) return true

				// Count participants of this type for this organization
				const participantsCount =
					constraint.participantType.participants.filter(
						p => p.organization === selectedInvitation.organization,
					).length

				// Check if quota is reached
				return participantsCount < constraint.quota
			})
		}

		// No restrictions defined, return allowed types as is
		return allowedTypes
	}, [
		participantTypes,
		fields.invitationId.value,
		fields.requestFor.value,
		invitations,
		user,
	])

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
						label: 'Next',
						intent: 'general',
						variant: 'default',
						disabled: isPending,
						status: isPending
							? 'pending'
							: (actionData?.result.status ?? 'idle'),
						type: 'submit',
					},
					{
						label: 'Cancel',
						to: '/requests/cancel',
						type: 'link',
					},
				]}
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<InputField meta={fields.id} type="hidden" />
				<InputField meta={fields.tenantId} type="hidden" />
				<InputField meta={fields.eventId} type="hidden" />
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
								placeholder="Select"
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
								placeholder="Select"
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
							{events.find(event => event.id === fields.eventId.value)?.name}
						</div>
					</Field>
				</div>

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
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<Field>
						<Label htmlFor={fields.title.id}>Title</Label>
						<SelectField
							meta={fields.title}
							items={[
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
							].map(title => ({
								name: title,
								value: title,
							}))}
							placeholder="Select"
						/>
						{fields.title.errors && (
							<FieldError>{fields.title.errors}</FieldError>
						)}
					</Field>

					<Field>
						<Label htmlFor={fields.dateOfBirth.id}>Date of Birth</Label>
						<DatePickerField meta={fields.dateOfBirth} disabled={disabled} />
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
							placeholder="Select"
						/>
						{fields.nationalityId.errors && (
							<FieldError>{fields.nationalityId.errors}</FieldError>
						)}
					</Field>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<Field>
						<Label htmlFor={fields.passportNumber.id}>
							Passport Number/National ID/ Drivers License
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
						<DatePickerField meta={fields.passportExpiry} disabled={disabled} />
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
							items={availableParticipantTypes.map(pt => {
								if (
									fields.requestFor.value === 'OTHERS' &&
									fields.invitationId.value
								) {
									const selectedInvitation = invitations.find(
										inv => inv.id === fields.invitationId.value,
									)

									if (selectedInvitation?.restriction) {
										const constraint =
											selectedInvitation.restriction.constraints.find(
												c => c.participantType.id === pt.id,
											)

										if (constraint) {
											const registeredCount =
												constraint.participantType.participants.filter(
													p =>
														p.organization === selectedInvitation.organization,
												).length
											const available = constraint.quota - registeredCount

											return {
												name: `${pt.name} (${available} available)`,
												value: pt.id,
											}
										}
									}
								}

								return {
									name: pt.name,
									value: pt.id,
								}
							})}
							placeholder={
								fields.requestFor.value === 'OTHERS'
									? !fields.invitationId.value
										? 'Select invitation first'
										: 'Select'
									: 'Select'
							}
							disabled={
								fields.requestFor.value === 'OTHERS' &&
								!fields.invitationId.value
							}
						/>
						{fields.participantTypeId.errors && (
							<FieldError>{fields.participantTypeId.errors}</FieldError>
						)}
						{fields.requestFor.value === 'OTHERS' &&
							fields.invitationId.value &&
							availableParticipantTypes.length === 0 && (
								<FieldError>
									Maximum quota reached for this invitation
								</FieldError>
							)}
					</Field>
				</div>
			</FormCard>
		</>
	)
}
