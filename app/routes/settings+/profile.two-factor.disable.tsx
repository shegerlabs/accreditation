import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useNavigation } from '@remix-run/react'
import { AlertTriangle } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { StatusButton } from '~/components/ui/status-button'
import { requireUserId, requireUserWithRoles } from '~/utils/auth.server'
import { twoFAVerificationType } from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { useDoubleCheck, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { requireRecentVerification } from '~/utils/verification.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)
	await requireRecentVerification({ request, userId })
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	await requireRecentVerification({ request, userId })
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	await prisma.verification.delete({
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	throw await redirectWithToast('/settings/profile/two-factor', {
		type: 'success',
		title: '2FA Disabled',
		description: 'Two factor authentication has been disabled',
	})
}

export default function TwoFactorDisableRoute() {
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const navigation = useNavigation()

	return (
		<Card className="mx-auto max-w-md">
			<CardHeader>
				<CardTitle>Disable Two-Factor Authentication</CardTitle>
				<CardDescription>
					Remove the additional security layer from your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Alert variant="destructive" className="mb-6">
					<AlertTriangle className="h-4 w-4" />
					<AlertTitle>Warning</AlertTitle>
					<AlertDescription>
						Disabling two-factor authentication will significantly reduce the
						security of your account. Only proceed if you have a specific reason
						to do so.
					</AlertDescription>
				</Alert>
				<p className="mb-4 text-sm text-muted-foreground">
					If you disable 2FA, you will no longer need to enter a code from your
					authenticator app when logging in. However, this means your account
					will be more vulnerable to unauthorized access.
				</p>
				<Form method="POST">
					<AuthenticityTokenInput />
					<div className="flex items-center justify-between gap-4">
						<StatusButton
							variant="destructive"
							status={isPending ? 'pending' : 'idle'}
							disabled={isPending}
							{...dc.getButtonProps({
								className: 'w-full',
								name: 'intent',
								value: 'disable',
								type: 'submit',
							})}
						>
							{dc.doubleCheck
								? 'Are you sure?'
								: navigation.state === 'submitting'
									? 'Disabling...'
									: 'Disable 2FA'}
						</StatusButton>
						<Button asChild variant="secondary" className="w-full">
							<Link to="/settings/profile">Cancel</Link>
						</Button>
					</div>
				</Form>
			</CardContent>
			<CardFooter>
				<p className="text-xs text-muted-foreground">
					Note: You can re-enable two-factor authentication at any time from
					your account settings.
				</p>
			</CardFooter>
		</Card>
	)
}
