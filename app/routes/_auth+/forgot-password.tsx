import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	MetaFunction,
	json,
	redirect,
} from '@remix-run/node'
import { Form, Link, useActionData } from '@remix-run/react'
import ReactDOMServer from 'react-dom/server'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { ForgotPasswordEmail } from '~/components/forgot-password-email'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { requireAnonymous } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from '~/utils/email.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { EmailSchema, UsernameSchema } from '~/utils/validations'
import { prepareVerification } from '~/utils/verification.server'

const ForgotPasswordSchema = z.object({
	usernameOrEmail: z.union([EmailSchema, UsernameSchema]),
})

export async function action({ request }: ActionFunctionArgs) {
	await requireAnonymous(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: ForgotPasswordSchema.superRefine(async (data, ctx) => {
			const user = await prisma.user.findFirst({
				where: {
					OR: [
						{ email: data.usernameOrEmail },
						{ username: data.usernameOrEmail },
					],
				},
			})

			if (!user) {
				ctx.addIssue({
					path: ['usernameOrEmail'],
					code: z.ZodIssueCode.custom,
					message: 'No user found with that email or username',
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

	const { usernameOrEmail } = submission.value
	const user = await prisma.user.findFirstOrThrow({
		where: { OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }] },
		select: { email: true, username: true },
	})

	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'reset-password',
		target: usernameOrEmail,
	})

	void sendEmailAzure({
		to: user.email,
		subject: 'Accredition Password Reset',
		plainText: `Here's your code: ${otp}. Or open this: ${verifyUrl.toString()}`,
		html: ReactDOMServer.renderToString(
			<ForgotPasswordEmail otp={otp} verifyUrl={verifyUrl.toString()} />,
		),
	})

	return redirect(redirectTo.toString())
}

export const meta: MetaFunction = () => {
	return [{ title: 'Password Recovery for Staffwise' }]
}

export default function SignupRoute() {
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'forgot-password-form',
		constraint: getZodConstraint(ForgotPasswordSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ForgotPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="flex min-h-full items-center justify-center p-4">
			<Card className="mx-auto max-w-sm">
				<CardHeader>
					<CardTitle className="text-xl">Forgot Password</CardTitle>
					<CardDescription>
						No worries, we will send you reset instructions.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form className="grid gap-4" method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<div className="grid gap-4">
							<Field>
								<Label htmlFor={fields.usernameOrEmail.id}>
									Username or Email
								</Label>
								<InputField meta={fields.usernameOrEmail} type="text" />
								{fields.usernameOrEmail.errors && (
									<FieldError>{fields.usernameOrEmail.errors}</FieldError>
								)}
							</Field>

							<ErrorList errors={form.errors} id={form.errorId} />

							<Button type="submit" className="w-full">
								Recover Password
							</Button>
						</div>
					</Form>
					<div className="mt-4 text-center text-sm">
						<Link to="/login" className="underline">
							Back to login
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
