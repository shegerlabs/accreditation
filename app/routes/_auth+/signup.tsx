import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import ReactDOMServer from 'react-dom/server'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { SignupEmail } from '~/components/signup-email'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { requireAnonymous } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from '~/utils/email.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { useIsPending } from '~/utils/misc'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { EmailSchema } from '~/utils/validations'
import { prepareVerification } from '~/utils/verification.server'
const SignupSchema = z.object({
	email: EmailSchema,
	redirectTo: z.string().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)

	// Check if there are any published events available for registration
	const publishedEventCount = await prisma.event.count({
		where: { status: 'PUBLISHED' },
	})

	return json({
		registrationOpen: publishedEventCount > 0,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireAnonymous(request)

	// Check if there are any published events available for registration
	const publishedEventCount = await prisma.event.count({
		where: { status: 'PUBLISHED' },
	})

	if (publishedEventCount === 0) {
		return json(
			{
				result: {
					status: 'error' as const,
					error: { '': ['Registration is currently closed. No events are open for registration.'] },
				},
			},
			{ status: 403 },
		)
	}

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parseWithZod(formData, {
		schema: SignupSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
				select: { id: true },
			})

			if (existingUser) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this username',
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

	const { email, redirectTo: postVerificationRedirectTo } = submission.value

	const otpValidityMinutes = await getSetting<number>(
		SettingKeys.OTP_VALIDITY_MINUTES,
	)
	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: otpValidityMinutes * 60,
		request,
		type: 'onboarding',
		target: email,
		redirectTo: postVerificationRedirectTo,
	})

	void sendEmailAzure({
		to: email,
		subject: 'Welcome to Accredition',
		plainText: `Here is your verification code: ${otp}. Click here to verify your email: ${verifyUrl.toString()}`,
		html: ReactDOMServer.renderToString(
			<SignupEmail otp={otp} verifyUrl={verifyUrl.toString()} />,
		),
	})

	return redirect(redirectTo.toString())
}

export default function SignupRoute() {
	const { registrationOpen } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'signup-form',
		constraint: getZodConstraint(SignupSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SignupSchema })
		},
		shouldRevalidate: 'onBlur',
		defaultValue: {
			redirectTo,
		},
	})

	// Show registration closed message if no events are published
	if (!registrationOpen) {
		return (
			<div className="flex min-h-full items-center justify-center p-4">
				<Card className="mx-auto max-w-md text-center">
					<CardHeader className="pb-4">
						<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
							<svg
								className="h-8 w-8 text-slate-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
						</div>
						<CardTitle className="text-xl font-semibold text-slate-800">
							Registration Unavailable
						</CardTitle>
						<CardDescription className="mt-2 text-slate-500">
							There are currently no events open for registration
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-0">
						<p className="mb-6 text-sm text-slate-500">
							New events will be announced soon. Please check back later or
							contact your organization&apos;s focal person for more
							information.
						</p>
						<div className="border-t pt-4 text-sm text-slate-600">
							Already have an account?{' '}
							<Link
								to="/login"
								className="font-medium text-emerald-600 hover:text-emerald-500"
							>
								Sign in
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="flex min-h-full items-center justify-center p-4">
			<Card className="mx-auto max-w-lg">
				<CardHeader>
					<CardTitle className="text-xl">Sign Up</CardTitle>
					<CardDescription>
						Let&apos;s get you started on your journey to becoming accredited
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form className="grid gap-4" method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<InputField meta={fields.redirectTo} type="hidden" />

						<div className="grid gap-4">
							<Field>
								<Label htmlFor={fields.email.id}>Email</Label>
								<InputField meta={fields.email} type="text" />
								{fields.email.errors && (
									<FieldError>{fields.email.errors}</FieldError>
								)}
							</Field>

							<ErrorList errors={form.errors} id={form.errorId} />

							<StatusButton
								className="w-full"
								status={isPending ? 'pending' : (form.status ?? 'idle')}
								type="submit"
								disabled={isPending}
							>
								Submit
							</StatusButton>
						</div>
						<div className="mt-4 text-center text-sm">
							Already have an account?{' '}
							<Link to="/login" className="underline">
								Sign in
							</Link>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
