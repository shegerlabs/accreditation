import { parseWithZod } from '@conform-to/zod'
import type {
	Country,
	Event,
	Invitation,
	ParticipantType,
	Tenant,
} from '@prisma/client'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { registrationWizard } from '~/utils/registration.server'
import {
	GeneralInfoEditor,
	GeneralInfoEditorSchema,
} from './__general-info-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const draft = await prisma.draft.findUnique({
		where: { userId: user.id },
	})

	invariantResponse(draft, 'No draft found', { status: 404 })
	invariantResponse(draft.tenantId, 'Invalid draft state', { status: 400 })
	invariantResponse(draft.eventId, 'Invalid draft state', { status: 400 })

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
						AND p."tenantId" = ${draft.tenantId}
						AND p."eventId" = ${draft.eventId}
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
												AND cp."tenantId" = ${draft.tenantId}
												AND cp."eventId" = ${draft.eventId}
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
			WHERE i."tenantId" = ${draft.tenantId}
			AND i."eventId" = ${draft.eventId}
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
		invitations: Array<
			Invitation & {
				participantType: ParticipantType
				participants: Array<{
					organization: string
					participantType: ParticipantType
				}>
				restriction: {
					constraints: Array<{
						id: string
						quota: number
						participantTypeId: string
						participantType: ParticipantType & {
							participants: Array<{ organization: string }>
						}
					}>
				} | null
			}
		>
		tenants: Pick<Tenant, 'id' | 'name'>[]
		events: Pick<Event, 'id' | 'name'>[]
		participantTypes: Pick<ParticipantType, 'id' | 'name'>[]
		countries: Pick<Country, 'id' | 'name'>[]
	}

	return json({
		draft,
		...data,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { nextStep } = await registrationWizard.register(request)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')

	if (intent === 'general') {
		const submission = await parseWithZod(formData, {
			schema: GeneralInfoEditorSchema.superRefine(async (data, ctx) => {
				if (data.requestFor === 'MYSELF') {
					const participant = await prisma.participant.findUnique({
						where: {
							tenantId_eventId_email: {
								eventId: data.eventId,
								tenantId: data.tenantId,
								email: user.email,
							},
						},
						select: { id: true, userId: true },
					})

					if (participant && (!data.id || participant.id !== data.id)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'You have already been registered for this event.',
						})
						return
					}
				}

				const participantWithPassport = await prisma.participant.findFirst({
					where: {
						tenantId: data.tenantId,
						eventId: data.eventId,
						passportNumber: data.passportNumber,
					},
					select: {
						id: true,
						userId: true,
					},
				})

				if (
					participantWithPassport &&
					(!data.id || participantWithPassport.id !== data.id)
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'A participant with this passport number already exists.',
					})
					return
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

		const draft = await prisma.draft.findUnique({
			where: { userId: user.id },
		})
		invariantResponse(draft, 'No draft found', { status: 404 })

		await prisma.draft.update({
			where: { id: draft.id },
			data: {
				gender: submission.value.gender,
				title: submission.value.title,
				firstName: submission.value.firstName,
				familyName: submission.value.familyName,
				dateOfBirth: submission.value.dateOfBirth,
				nationalityId: submission.value.nationalityId,
				passportNumber: submission.value.passportNumber,
				passportExpiry: submission.value.passportExpiry,
				requestFor: submission.value.requestFor as 'MYSELF' | 'OTHERS',
				participantTypeId: submission.value.participantTypeId,
				invitationId: submission.value.invitationId,
			},
		})

		return nextStep()
	}
}

export default function AddGeneralInfoRoute() {
	const { draft, invitations, tenants, events, participantTypes, countries } =
		useLoaderData<typeof loader>()

	return (
		<GeneralInfoEditor
			intent="add"
			participant={{
				id: draft.id,
				tenantId: draft.tenantId,
				eventId: draft.eventId,
				participantTypeId: draft.participantTypeId,
				countryId: draft.countryId,
				requestFor: draft.requestFor as 'MYSELF' | 'OTHERS' | undefined,
				invitationId: draft.invitationId,
				firstName: draft.firstName,
				familyName: draft.familyName,
				title: draft.title,
				gender: draft.gender,
				dateOfBirth: draft.dateOfBirth,
				nationalityId: draft.nationalityId,
				passportNumber: draft.passportNumber,
				passportExpiry: draft.passportExpiry,
			}}
			invitations={invitations}
			tenants={tenants}
			events={events}
			participantTypes={participantTypes}
			countries={countries}
		/>
	)
}
