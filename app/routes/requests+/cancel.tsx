import { LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRoles } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { registrationWizard } from '~/utils/registration.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { destroy } = await registrationWizard.register(request)

	// Delete any existing draft for this user
	await prisma.draft
		.delete({
			where: { userId: user.id },
		})
		.catch(() => {
			// Ignore error if no draft exists
		})

	const headers = await destroy()
	return redirectWithToast(
		'/events',
		{
			type: 'success',
			title: `Cancelled`,
			description: `Registration cancelled.`,
		},
		{ headers },
	)
}

export default function CancelRoute() {
	return null
}
