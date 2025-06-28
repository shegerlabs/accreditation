import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import { Form, Link, useActionData, useSearchParams } from '@remix-run/react'
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
import { EmailSchema } from '~/utils/validations'
import { prepareVerification } from '~/utils/verification.server'
const SignupSchema = z.object({
	email: EmailSchema,
	redirectTo: z.string().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)

	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireAnonymous(request)
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

	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: 10 * 60,
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
