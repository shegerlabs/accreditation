import { parseWithZod } from '@conform-to/zod'
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
	ProfessionalInfoEditor,
	ProfessionalInfoEditorSchema,
} from './__professional-info-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const draft = await prisma.draft.findUnique({
		where: { userId: user.id },
	})

	invariantResponse(draft, 'No draft found', { status: 404 })
	invariantResponse(draft.tenantId, 'Invalid draft state', { status: 400 })
	invariantResponse(draft.eventId, 'Invalid draft state', { status: 400 })

	const countries = await prisma.country.findMany({
		select: { id: true, name: true },
	})

	return json({ draft, email: user.email, countries })
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { nextStep } = await registrationWizard.register(request)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')

	if (intent === 'professional') {
		const draft = await prisma.draft.findUnique({
			where: { userId: user.id },
		})
		invariantResponse(draft, 'No draft found', { status: 404 })

		const submission = await parseWithZod(formData, {
			schema: ProfessionalInfoEditorSchema.superRefine(async (data, ctx) => {
				if (draft.requestFor === 'MYSELF' && user.email !== data.email) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'The email address does not match your account.',
					})
					return
				}

				if (draft.requestFor === 'OTHERS') {
					const participant = await prisma.participant.findFirst({
						where: {
							tenantId: draft.tenantId,
							eventId: draft.eventId,
							email: data.email,
						},
					})

					if (participant && (!data.id || participant.id !== data.id)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'There is already a participant with this email',
						})
						return
					}
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

		await prisma.draft.update({
			where: { id: draft.id },
			data: {
				email: submission.value.email,
				organization: submission.value.organization,
				jobTitle: submission.value.jobTitle,
				countryId: submission.value.countryId,
				city: submission.value.city,
				telephone: submission.value.telephone,
				website: submission.value.website,
				address: submission.value.address,
				preferredLanguage: submission.value.preferredLanguage,
			},
		})

		return nextStep()
	}
}

export default function ProfessionalInfoRoute() {
	const { draft, email, countries } = useLoaderData<typeof loader>()

	return (
		<ProfessionalInfoEditor
			intent="add"
			participant={
				{
					id: draft.id,
					tenantId: draft.tenantId,
					eventId: draft.eventId,
					participantTypeId: draft.participantTypeId,
					requestFor: draft.requestFor ?? 'MYSELF',
					email: draft.requestFor === 'MYSELF' ? email : draft.email,
					organization: draft.organization,
					jobTitle: draft.jobTitle,
					countryId: draft.countryId,
					city: draft.city,
					telephone: draft.telephone,
					website: draft.website,
					address: draft.address,
					preferredLanguage: draft.preferredLanguage,
				} as any
			}
			countries={countries}
		/>
	)
}
