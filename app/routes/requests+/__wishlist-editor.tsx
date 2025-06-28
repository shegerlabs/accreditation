import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { MeetingType, Participant } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Field } from '~/components/forms'
import { useIsPending } from '~/utils/misc'
import { xssTransform } from '~/utils/validations'
import { type action } from './wishlist'

export const WishlistEditorSchema = z.object({
	id: z.string().optional(),
	needsVisa: z.boolean().default(false),
	needsCarPass: z.boolean().default(false),
	vehicleType: z.string().optional().transform(xssTransform),
	vehiclePlateNumber: z.string().optional().transform(xssTransform),
	needsCarFromOrganizer: z.boolean().default(false),
	flightNumber: z.string().optional().transform(xssTransform),
	arrivalDate: z.date().optional(),
	meetings: z.array(z.string()).optional(),
})

export function WishlistEditor({
	participant,
	intent,
	availableClosedSessionQuota,
	meetingTypes,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id' | 'tenantId' | 'eventId' | 'participantTypeId'> & {
			meetings: Array<string>
		}
	>
	intent?: 'add' | 'edit' | 'delete'
	availableClosedSessionQuota?: number
	meetingTypes: SerializeFrom<Pick<MeetingType, 'id' | 'name'>>[]
}) {
	const actionData = useActionData<typeof action>()
	const disabled = intent === 'delete'
	const schema = WishlistEditorSchema
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'wishlist-editor',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
			meetings: participant?.meetings?.map(meeting => meeting),
		},
	})

	return (
		<FormCard
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: 'Prev',
					type: 'link',
					to: '/requests/professional',
				},
				{
					label: 'Next',
					intent: 'wishlist',
					variant: 'default',
					disabled: isPending,
					status: isPending ? 'pending' : (actionData?.result.status ?? 'idle'),
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

			<Field>
				<fieldset>
					<legend className="mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
						Meetings Wishlist
					</legend>
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
		</FormCard>
	)
}
