import { generateTOTP } from '@epic-web/totp'
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useLoaderData } from '@remix-run/react'
import { AlertTriangle, LockOpen, ShieldAlert, ShieldCheck } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { StatusButton } from '~/components/ui/status-button'
import { requireUserId, requireUserWithRoles } from '~/utils/auth.server'
import {
	twoFAVerificationType,
	twoFAVerifyVerificationType,
} from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { useIsPending } from '~/utils/misc'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		select: { id: true },
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	return json({ isTwoFAEnabled: Boolean(verification) })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const { otp: _otp, ...config } = generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
	}

	await prisma.verification.upsert({
		where: {
			target_type: {
				type: twoFAVerifyVerificationType,
				target: userId,
			},
		},
		update: verificationData,
		create: verificationData,
	})

	return redirect('/settings/profile/two-factor/verify')
}

export default function TwoFactorRoute() {
	const data = useLoaderData<typeof loader>()
	const isPending = useIsPending()

	return (
		<Card className="mx-auto w-full max-w-lg">
			<CardHeader>
				<CardTitle>Two-Factor Authentication</CardTitle>
				<CardDescription>Enhance the security of your account</CardDescription>
			</CardHeader>
			<CardContent>
				{data.isTwoFAEnabled ? (
					<>
						<Alert variant="default" className="mb-6">
							<ShieldCheck className="h-4 w-4" />
							<AlertTitle>2FA is Enabled</AlertTitle>
							<AlertDescription>
								Your account is currently protected with two-factor
								authentication.
							</AlertDescription>
						</Alert>
						<div className="space-y-4">
							<p className="text-sm text-muted-foreground">
								Two-factor authentication is currently active on your account.
								This means:
							</p>
							<ul className="list-disc space-y-2 pl-5 text-sm">
								<li>
									You'll need to enter a code from your authenticator app when
									logging in.
								</li>
								<li>
									Your account has an extra layer of security against
									unauthorized access.
								</li>
								<li>
									You should keep your authenticator app safe and accessible.
								</li>
							</ul>
							<Alert variant="destructive">
								<AlertTriangle className="h-4 w-4" />
								<AlertTitle>Important</AlertTitle>
								<AlertDescription>
									If you lose access to your authenticator app, you may be
									locked out of your account. Make sure you have backup codes or
									a recovery method set up.
								</AlertDescription>
							</Alert>
							<div className="flex items-center justify-between gap-4">
								<Button asChild variant="destructive" className="w-full">
									<Link to="disable">
										<LockOpen className="mr-2 h-4 w-4" />
										Disable 2FA
									</Link>
								</Button>
								<Button asChild variant="secondary" className="w-full">
									<Link to="/settings/profile">Cancel</Link>
								</Button>
							</div>
						</div>
					</>
				) : (
					<>
						<Alert variant="default">
							<ShieldAlert className="h-4 w-4" />
							<AlertTitle>2FA is Not Enabled</AlertTitle>
							<AlertDescription>
								You have not enabled two-factor authentication yet. Enable it
								for enhanced security.
							</AlertDescription>
						</Alert>
						<p className="mt-4 text-sm text-muted-foreground">
							Two-factor authentication adds an extra layer of security to your
							account. You will need to enter a code from an authenticator app
							like Microsoft Authenticator to log in.
						</p>
						<Form method="POST" className="mt-6">
							<AuthenticityTokenInput />

							<div className="flex justify-between gap-4">
								<StatusButton
									type="submit"
									name="intent"
									value="enable"
									status={isPending ? 'pending' : 'idle'}
									disabled={isPending}
									className="w-full"
								>
									{isPending ? 'Enabling...' : 'Enable 2FA'}
								</StatusButton>
								<Button asChild variant="secondary" className="w-full">
									<Link to="/settings/profile">Cancel</Link>
								</Button>
							</div>
						</Form>
					</>
				)}
			</CardContent>
		</Card>
	)
}
