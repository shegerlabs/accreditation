import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import {
	Link,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'

import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Requirements } from '~/components/requirements'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Progress } from '~/components/ui/progress'
import { Separator } from '~/components/ui/separator'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { registrationWizard } from '~/utils/registration.server'
import { useOptionalUser, userHasRole } from '~/utils/user'

export const NewParticipantSchema = z.object({
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
})

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const url = new URL(request.url)
	const eventId = url.searchParams.get('eventId')
	const tenantId = url.searchParams.get('tenantId')
	if (!eventId || !tenantId) {
		return redirect('/events')
	}

	const result = await prisma.$queryRaw`
		WITH invitation_data AS (
			SELECT 
				json_build_object(
					'id', i.id,
					'organization', i.organization,
					'maximumQuota', i."maximumQuota",
					'participants', (
						SELECT COALESCE(json_agg(
							json_build_object(
								'organization', p.organization
							)
						), '[]'::json)
						FROM "Participant" p
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
										'name', c.name,
										'quota', c.quota,
										'participantType', json_build_object(
											'id', pt.id,
											'name', pt.name,
											'participants', COALESCE((
												SELECT json_agg(
													json_build_object('organization', cp.organization)
												)
												FROM "Participant" cp
												WHERE cp."participantTypeId" = pt.id
												AND cp."tenantId" = ${tenantId}
												AND cp."eventId" = ${eventId}
											), '[]'::json)
										)
									)
								)
								FROM "Constraint" c
								LEFT JOIN "ParticipantType" pt ON c."participantTypeId" = pt.id
								WHERE c."restrictionId" = r.id
							), '[]'::json)
						)
						FROM "Restriction" r
						WHERE r.id = i."restrictionId"
					)
				) as invitation_json
			FROM "Invitation" i
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
		closed_session_data AS (
			SELECT CAST(COUNT(*) AS INTEGER) as count
			FROM "Participant" p
			INNER JOIN "Invitation" i ON p."invitationId" = i.id
			INNER JOIN "MeetingType" mt ON mt."tenantId" = ${tenantId} AND mt.name = 'Closed Session'
			WHERE p."tenantId" = ${tenantId}
			AND p."eventId" = ${eventId}
			AND i.id IN (SELECT id FROM "Invitation" WHERE email = ${user.email})
			AND p."wishList" LIKE '%' || mt.id || '%'
		),
		validation_data AS (
			SELECT 
				(SELECT e.id IS NOT NULL FROM "Event" e WHERE e.id = ${eventId}) as event_exists,
				(SELECT t.id IS NOT NULL FROM "Tenant" t WHERE t.id = ${tenantId}) as tenant_exists,
				(SELECT e."tenantId" = ${tenantId} FROM "Event" e WHERE e.id = ${eventId}) as event_tenant_match
		)
		SELECT 
			COALESCE((SELECT json_agg(invitation_json) FROM invitation_data), '[]'::json) as invitations,
			(SELECT count FROM closed_session_data) as "closedSessionCount",
			(SELECT row_to_json(validation_data) FROM validation_data) as validation
	`

	// Define the type for the query result
	type QueryResult = {
		invitations: Array<{
			id: string
			organization: string
			maximumQuota: number | null
			participants: Array<{ organization: string }>
			restriction: {
				constraints: Array<{
					id: string
					name: string
					quota: number
					participantType: {
						id: string
						name: string
						participants: Array<{ organization: string }>
					}
				}>
			} | null
		}>
		closedSessionCount: number
		validation: {
			event_exists: boolean
			tenant_exists: boolean
			event_tenant_match: boolean
		}
	}

	// Cast the result to the expected type
	const data = (result as any)[0] as QueryResult

	// Validate the data
	invariantResponse(data.validation.event_exists, 'Event not found', {
		status: 404,
	})
	invariantResponse(data.validation.tenant_exists, 'Tenant not found', {
		status: 404,
	})
	invariantResponse(data.validation.event_tenant_match, 'Invalid request', {
		status: 400,
	})

	return json({
		participant: null, // Since this is a new registration
		invitations: data.invitations,
		closedSessionCount: data.closedSessionCount,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: NewParticipantSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { getHeaders } = await registrationWizard.register(request)

	// Delete any existing draft for this user
	await prisma.draft.deleteMany({
		where: { userId: user.id },
	})

	// Create new draft
	await prisma.draft.create({
		data: {
			userId: user.id,
			tenantId: submission.value.tenantId,
			eventId: submission.value.eventId,
			participantTypeId: '',
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
		},
	})

	const headers = await getHeaders()
	return redirect('/requests/general', { headers })
}

export default function NewParticipantRoute() {
	const [searchParams] = useSearchParams()
	const { participant, invitations, closedSessionCount } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const [form, fields] = useForm({
		id: 'register-participant',
		constraint: getZodConstraint(NewParticipantSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: NewParticipantSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			tenantId: searchParams.get('tenantId') ?? '',
			eventId: searchParams.get('eventId') ?? '',
		},
	})

	const user = useOptionalUser()
	const isPending = useIsPending()
	const canRegister = !participant || userHasRole(user, 'focal')

	if (canRegister) {
		return (
			<div className="space-y-6">
				<Requirements />

				<FormCard
					formId={form.id}
					onSubmit={form.onSubmit}
					buttons={[
						{
							label: 'Start',
							intent: 'general',
							variant: 'default',
							type: 'submit',
							disabled: isPending,
							status: isPending
								? 'pending'
								: (actionData?.result.status ?? 'idle'),
						},
						{
							label: 'Cancel',
							to: '/events',
							type: 'link',
						},
					]}
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.tenantId} type="hidden" />
					<InputField meta={fields.eventId} type="hidden" />

					<p className="text-sm text-muted-foreground">
						Click start to begin registering for this event.
					</p>
				</FormCard>

				{userHasRole(user, 'focal') && (
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								Registration Quota
								{invitations.length === 0 && (
									<Badge variant="destructive">No Invitations</Badge>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{invitations.length === 0 ? (
								<Alert>
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>
										No invitations found. Please contact the event organizer.
									</AlertDescription>
								</Alert>
							) : (
								<div className="space-y-6">
									{invitations.map(invitation => (
										<div key={invitation.id}>
											<div className="mb-4 rounded-lg border bg-muted/50 px-4 py-2">
												<div className="flex items-center justify-between">
													<div>
														<h3 className="font-semibold">
															{invitation.organization}
														</h3>
													</div>
													{invitation.maximumQuota ? (
														<Badge
															variant={
																invitation.participants.filter(
																	p =>
																		p.organization === invitation.organization,
																).length >= invitation.maximumQuota
																	? 'destructive'
																	: 'secondary'
															}
															className="flex items-center gap-2 text-xs"
														>
															Count:{' '}
															<span className="font-semibold">
																{
																	invitation.participants.filter(
																		p =>
																			p.organization ===
																			invitation.organization,
																	).length
																}
															</span>
															<Separator
																orientation="vertical"
																className="h-4"
															/>
															Quota:{' '}
															<span className="font-semibold">
																{invitation.maximumQuota}
															</span>
														</Badge>
													) : (
														<Badge variant="default" className="text-xs">
															Maximum: Unlimited
														</Badge>
													)}
												</div>
											</div>

											<div className="grid gap-2 pl-4">
												{invitation.restriction?.constraints.map(constraint => {
													const registeredCount =
														constraint.name === 'Closed Session'
															? closedSessionCount
															: constraint.participantType.participants.filter(
																	p =>
																		p.organization === invitation.organization,
																).length
													const quota = constraint.quota
													const available = quota - registeredCount
													const usagePercentage =
														(registeredCount / quota) * 100

													return (
														<div
															key={constraint.id}
															className="grid grid-cols-[1fr,auto,auto] items-center gap-4"
														>
															<div className="flex items-center gap-3">
																<span className="text-sm font-medium">
																	{constraint.name}
																</span>
																<div className="flex-1">
																	<Progress
																		value={usagePercentage}
																		className="h-1.5"
																	/>
																</div>
															</div>
															<span className="whitespace-nowrap text-xs text-muted-foreground">
																{registeredCount}/{quota}
															</span>
															{available > 0 ? (
																<Badge variant="default" className="text-xs">
																	{available} Left
																</Badge>
															) : (
																<Badge
																	variant="destructive"
																	className="text-xs"
																>
																	{registeredCount > quota
																		? 'Exceeded'
																		: 'Full'}
																</Badge>
															)}
														</div>
													)
												})}
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		)
	}

	return (
		<Card className="mx-auto w-full max-w-lg">
			<CardHeader>
				<div className="flex justify-center">
					<CheckCircle className="h-12 w-12 text-primary" />
				</div>
				<CardTitle className="text-center text-xl font-semibold">
					You are all set!
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-center text-muted-foreground">
					You have already been registered for this event. You can view your
					registration details in your dashboard.
				</p>
			</CardContent>
			<CardFooter className="flex justify-center">
				<Button asChild variant="link">
					<Link to="/requests">
						Go to Dashboard <span aria-hidden="true">→</span>
					</Link>
				</Button>
			</CardFooter>
		</Card>
	)
}
