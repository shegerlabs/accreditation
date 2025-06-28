import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	MetaFunction,
	json,
	redirect,
} from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
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
import { resetUserPassword } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { PasswordSchema } from '~/utils/validations'
import {
	requireResetPasswordUsername,
	verifySessionStorage,
} from '~/utils/verification.server'

export const resetPasswordUsernameSessionKey = 'resetPasswordUsername'

const ResetPasswordSchema = z
	.object({
		password: PasswordSchema,
		confirmPassword: PasswordSchema,
	})
	.refine(({ confirmPassword, password }) => password === confirmPassword, {
		message: 'The passwords did not match',
		path: ['confirmPassword'],
	})

export async function loader({ request }: LoaderFunctionArgs) {
	const resetPasswordUsername = await requireResetPasswordUsername(request)
	return json({ resetPasswordUsername })
}

export async function action({ request }: ActionFunctionArgs) {
	const resetPasswordUsername = await requireResetPasswordUsername(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = parseWithZod(formData, {
		schema: ResetPasswordSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { password } = submission.value

	await resetUserPassword({ username: resetPasswordUsername, password })

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)

	return redirect('/login', {
		headers: {
			'set-cookie': await verifySessionStorage.destroySession(verifySession),
		},
	})
}

export const meta: MetaFunction = () => {
	return [{ title: 'Accreditation Password Reset' }]
}

export default function PasswordResetRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'password-reset-form',
		constraint: getZodConstraint(ResetPasswordSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ResetPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="flex min-h-full items-center justify-center p-4">
			<Card className="mx-auto max-w-sm">
				<CardHeader>
					<CardTitle className="text-xl">Password Reset</CardTitle>
					<CardDescription>
						Hi, {data.resetPasswordUsername}. No worries. It happens all the
						time.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form className="grid gap-4" method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<div className="grid gap-4">
							<Field>
								<Label htmlFor={fields.password.id}>Password</Label>
								<InputField meta={fields.password} type="password" />
								{fields.password.errors && (
									<FieldError>{fields.password.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.confirmPassword.id}>
									Confirm Password
								</Label>
								<InputField meta={fields.confirmPassword} type="password" />
								{fields.confirmPassword.errors && (
									<FieldError>{fields.confirmPassword.errors}</FieldError>
								)}
							</Field>

							<ErrorList errors={form.errors} id={form.errorId} />

							<Button type="submit" className="w-full">
								Reset Password
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
