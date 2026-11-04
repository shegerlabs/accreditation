import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { SelectField } from '~/components/conform/SelectField'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { ErrorList, Field } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import {
	type QuotaUsageInfo,
	getQuotaUsage,
	validateQuotaForTypeChange,
	getAllowedParticipantTypes,
} from '~/utils/quota.server'
import { redirectWithToast } from '~/utils/toast.server'

const EditDetailsSchema = z.object({
	participantTypeId: z.string().min(1, 'Participant type is required'),
	meetingTypes: z.array(z.string()).optional(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			userId: true,
			firstName: true,
			familyName: true,
			tenantId: true,
			participantTypeId: true,
			wishList: true,
			invitationId: true,
			participantType: {
				select: { name: true },
			},
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })
	invariantResponse(
		participant.userId === user.id,
		'Unauthorized',
		{ status: 403 },
	)

	// Check if user has focal role
	const userWithRoles = await prisma.user.findUnique({
		where: { id: user.id },
		select: { roles: { select: { name: true } } },
	})
	const isFocal = userWithRoles?.roles.some(r => r.name === 'focal') ?? false

	invariantResponse(isFocal, 'Only focal persons can edit details', { status: 403 })

	const quotaUsage = await getQuotaUsage(participant.id, participant.invitationId)

	// Get allowed participant types based on invitation constraints
	const participantTypes = await getAllowedParticipantTypes({
		invitationId: participant.invitationId,
		tenantId: participant.tenantId,
	})

	// Get meeting types for this tenant (exclude Executive Council Closed Session for users)
	const meetingTypes = await prisma.meetingType.findMany({
		where: {
			tenantId: participant.tenantId,
			name: { not: 'Executive Council Closed Session' },
		},
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	return json({
		participant: {
			id: participant.id,
			firstName: participant.firstName,
			familyName: participant.familyName,
			participantTypeId: participant.participantTypeId,
			wishList: participant.wishList?.split(',').filter(Boolean) ?? [],
		},
		participantTypes,
		meetingTypes,
		quotaUsage,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params
	invariantResponse(participantId, 'Participant ID required')

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: {
			id: true,
			userId: true,
			tenantId: true,
			eventId: true,
			participantTypeId: true,
			invitationId: true,
		},
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })
	invariantResponse(
		participant.userId === user.id,
		'Unauthorized',
		{ status: 403 },
	)

	// Check if user has focal role
	const userWithRoles = await prisma.user.findUnique({
		where: { id: user.id },
		select: { roles: { select: { name: true } } },
	})
	const isFocal = userWithRoles?.roles.some(r => r.name === 'focal') ?? false
	invariantResponse(isFocal, 'Only focal persons can edit details', { status: 403 })

	// Get all meetingTypes values from form
	const meetingTypesValues = formData.getAll('meetingTypes') as string[]

	const submission = parseWithZod(formData, {
		schema: EditDetailsSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { participantTypeId } = submission.value

	// Verify participant type belongs to same tenant
	const participantType = await prisma.participantType.findFirst({
		where: {
			id: participantTypeId,
			tenantId: participant.tenantId,
		},
	})

	invariantResponse(participantType, 'Invalid participant type', { status: 400 })

	// Determine if "Closed Session" is among the selected meeting types
	const attendClosedSession = meetingTypesValues.length
		? Boolean(
				await prisma.meetingType.findFirst({
					where: {
						tenantId: participant.tenantId,
						name: 'Closed Session',
						id: { in: meetingTypesValues },
					},
					select: { id: true },
				}),
			)
		: false

	// Check quota before proceeding
	const quotaCheck = await validateQuotaForTypeChange({
		participantId: participant.id,
		invitationId: participant.invitationId,
		newParticipantTypeId: participantTypeId,
		newAttendClosedSession: attendClosedSession,
	})

	if (!quotaCheck.allowed) {
		return json(
			{
				result: submission.reply({
					formErrors: [quotaCheck.reason ?? 'Quota exceeded for the selected participant type.'],
				}),
			},
			{ status: 400 },
		)
	}

	// Update the participant
	await prisma.participant.update({
		where: { id: participantId },
		data: {
			participantTypeId,
			wishList: meetingTypesValues.length ? meetingTypesValues.join(',') : null,
			attendClosedSession,
		},
	})

	return redirectWithToast(`/requests/${participantId}`, {
		type: 'success',
		title: 'Details Updated',
		description: 'Participant type and meetings have been updated successfully.',
	})
}

function QuotaUsageAlert({ quotaUsage }: { quotaUsage: QuotaUsageInfo | null }) {
	if (!quotaUsage) return null
	const hasConstraints = quotaUsage.constraints.length > 0
	const hasMaxQuota = quotaUsage.maximumQuota && quotaUsage.maximumQuota > 0
	if (!hasConstraints && !hasMaxQuota) return null

	const isAtLimit = quotaUsage.constraints.some(
		c => c.quota > 0 && c.used >= c.quota,
	) || (hasMaxQuota && quotaUsage.totalUsed >= quotaUsage.maximumQuota!)

	return (
		<Alert variant={isAtLimit ? 'destructive' : 'default'} className="mb-4">
			<AlertTitle>Quota Usage</AlertTitle>
			<AlertDescription>
				<ul className="mt-1 space-y-0.5 text-xs">
					{quotaUsage.constraints.map((c, i) => (
						<li key={i}>
							{c.participantType} ({c.accessLevel}): {c.used} / {c.quota === 0 ? 'unlimited' : c.quota}
						</li>
					))}
					{hasMaxQuota && (
						<li>Overall: {quotaUsage.totalUsed} / {quotaUsage.maximumQuota}</li>
					)}
				</ul>
			</AlertDescription>
		</Alert>
	)
}

export default function EditDetailsDialog() {
	const { participant, participantTypes, meetingTypes, quotaUsage } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'edit-details-form',
		constraint: getZodConstraint(EditDetailsSchema),
		lastResult: actionData?.result,
		defaultValue: {
			participantTypeId: participant.participantTypeId,
			meetingTypes: participant.wishList,
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EditDetailsSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const handleClose = () => {
		navigate(`/requests/${participant.id}`)
	}

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						Edit Details - {participant.firstName} {participant.familyName}
					</DialogTitle>
					<DialogDescription>
						Update the participant type and meeting preferences.
					</DialogDescription>
				</DialogHeader>

				<QuotaUsageAlert quotaUsage={quotaUsage} />

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<div className="space-y-4 py-4">
						{/* Participant Type */}
						<Field>
							<Label htmlFor={fields.participantTypeId.id}>Participant Type</Label>
							<SelectField
								meta={fields.participantTypeId}
								items={participantTypes.map(pt => ({
									name: pt.name,
									value: pt.id,
								}))}
								placeholder="Select participant type"
							/>
						</Field>

						{/* Meeting Types */}
						{meetingTypes.length > 0 && (
							<Field>
								<fieldset>
									<legend className="mb-2 text-sm font-medium leading-none">
										Meeting Types
									</legend>
									<CheckboxGroupField
										meta={fields.meetingTypes}
										items={meetingTypes.map(mt => ({
											name: mt.name,
											value: mt.id,
										}))}
									/>
								</fieldset>
							</Field>
						)}

						<ErrorList id={form.errorId} errors={form.errors} />
					</div>

					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={isPending}
						>
							Cancel
						</Button>
						<StatusButton
							type="submit"
							status={isPending ? 'pending' : 'idle'}
							disabled={isPending}
						>
							Save Changes
						</StatusButton>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
