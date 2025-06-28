import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { getTOTPAuthUri } from '@epic-web/totp'
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import * as QRCode from 'qrcode'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { requireUserId, requireUserWithRoles } from '~/utils/auth.server'
import {
	twoFAVerificationType,
	twoFAVerifyVerificationType,
} from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { getDomainUrl, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { isCodeValid } from '~/utils/verification.server'

const VerifySchema = z.object({
	code: z.string().min(6).max(6),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)

	const verification = await prisma.verification.findUnique({
		where: {
			target_type: {
				target: userId,
				type: twoFAVerifyVerificationType,
			},
			expiresAt: { gt: new Date() },
		},
		select: {
			id: true,
			algorithm: true,
			secret: true,
			period: true,
			digits: true,
		},
	})

	if (!verification) {
		return redirect('/settings/profile/two-factor')
	}

	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { email: true },
	})

	const otpUri = getTOTPAuthUri({
		...verification,
		accountName: user.email,
		issuer: new URL(getDomainUrl(request)).host,
	})

	const qrCode = await QRCode.toDataURL(otpUri)

	return json({ qrCode, otpUri })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	if (formData.get('intent') === 'cancel') {
		await prisma.verification.deleteMany({
			where: { type: twoFAVerifyVerificationType, target: userId },
		})
		return redirect('/settings/profile/two-factor')
	}

	const submission = await parseWithZod(formData, {
		schema: () =>
			VerifySchema.superRefine(async (data, ctx) => {
				const codeIsValid = await isCodeValid({
					code: data.code,
					type: twoFAVerifyVerificationType,
					target: userId,
				})

				if (!codeIsValid) {
					ctx.addIssue({
						path: ['code'],
						code: z.ZodIssueCode.custom,
						message: `Invalid code`,
					})
					return z.NEVER
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

	await prisma.verification.update({
		where: {
			target_type: {
				target: userId,
				type: twoFAVerifyVerificationType,
			},
		},
		data: {
			type: twoFAVerificationType,
			expiresAt: null,
		},
	})

	throw await redirectWithToast('/settings/profile/two-factor', {
		type: 'success',
		title: 'Enabled',
		description: 'Two-factor authentication has been enabled.',
	})
}

export default function TwoFactorVerifyRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()

	const isPending = useIsPending()
	const pendingIntent = isPending ? navigation.formData?.get('intent') : null

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(VerifySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VerifySchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Card className="mx-auto w-full max-w-lg">
			<CardHeader>
				<CardTitle>Set Up Two-Factor Authentication</CardTitle>
				<CardDescription>Enhance the security of your account</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="qr">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="qr">QR Code</TabsTrigger>
						<TabsTrigger value="manual">Manual Entry</TabsTrigger>
					</TabsList>
					<TabsContent value="qr">
						<div className="mt-4 flex flex-col items-center gap-4">
							<img
								alt="QR code for 2FA"
								src={data.qrCode}
								className="h-56 w-56"
							/>
							<p className="text-center text-sm">
								Scan this QR code with your authenticator app.
							</p>
						</div>
					</TabsContent>
					<TabsContent value="manual">
						<div className="mt-4">
							<p className="mb-2 text-sm">
								If you can't scan the QR code, manually add this account to your
								authenticator app using this code:
							</p>
							<Alert>
								<AlertDescription>
									<code className="break-all text-xs">{data.otpUri}</code>
								</AlertDescription>
							</Alert>
						</div>
					</TabsContent>
				</Tabs>

				<Alert className="mt-6">
					<AlertDescription>
						Once you've added the account, enter the code from your
						authenticator app below. After enabling 2FA, you'll need to enter a
						code from your authenticator app every time you log in or perform
						important actions. Do not lose access to your authenticator app, or
						you may lose access to your account.
					</AlertDescription>
				</Alert>

				<Form className="mt-6 space-y-6" method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<Field>
						<Label htmlFor={fields.code.id}>Verification Code</Label>
						<InputField meta={fields.code} type="text" />
						{fields.code.errors && (
							<FieldError>{fields.code.errors}</FieldError>
						)}
					</Field>
					<div className="flex justify-between gap-4">
						<StatusButton
							className="w-full"
							status={
								pendingIntent === 'verify'
									? 'pending'
									: (actionData?.result.status ?? 'idle')
							}
							type="submit"
							name="intent"
							value="verify"
							disabled={isPending}
						>
							{isPending ? 'Verifying...' : 'Verify and Enable 2FA'}
						</StatusButton>
						<Button variant="outline" className="w-full" asChild>
							<Link to="/settings/profile/two-factor">Cancel</Link>
						</Button>
					</div>
				</Form>
			</CardContent>
		</Card>
	)
}
