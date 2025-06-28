import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Country, Participant } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AlertCircle } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { xssTransform } from '~/utils/validations'
import { type action } from './professional'

export const ProfessionalInfoEditorSchema = z.object({
	id: z.string().optional(),
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
})

export function ProfessionalInfoEditor({
	participant,
	intent,
	countries,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id' | 'tenantId' | 'eventId' | 'participantTypeId'>
	> & { requestFor: string }
	intent?: 'add' | 'edit' | 'delete'
	countries: SerializeFrom<Pick<Country, 'id' | 'name'>>[]
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = ProfessionalInfoEditorSchema
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'register-professional-info',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
		},
	})

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
						label: 'Prev',
						type: 'link',
						to: '/requests/general',
					},
					{
						label: 'Next',
						intent: 'professional',
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
				encType="multipart/form-data"
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<InputField meta={fields.id} type="hidden" />
				{participant?.requestFor === 'MYSELF' && (
					<InputField meta={fields.email} type="hidden" />
				)}

				<div className="grid grid-cols-3 gap-4">
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
					className={`grid grid-cols-${participant?.requestFor === 'MYSELF' ? 2 : 3} gap-4`}
				>
					<Field>
						<Label htmlFor={fields.city.id}>City</Label>
						<InputField meta={fields.city} type="text" disabled={disabled} />
						{fields.city.errors && (
							<FieldError>{fields.city.errors} </FieldError>
						)}
					</Field>

					{participant?.requestFor === 'OTHERS' && (
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
						<InputField meta={fields.website} type="text" disabled={disabled} />
						{fields.website.errors && (
							<FieldError>{fields.website.errors}</FieldError>
						)}
					</Field>
				</div>

				<div className="grid grid-cols-3 gap-4">
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
						<Label htmlFor={fields.address.id}>Address</Label>
						<InputField meta={fields.address} type="text" disabled={disabled} />
						{fields.address.errors && (
							<FieldError>{fields.address.errors}</FieldError>
						)}
					</Field>

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
				</div>
			</FormCard>
		</>
	)
}
