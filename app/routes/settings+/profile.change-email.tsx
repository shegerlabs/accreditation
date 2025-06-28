import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { InfoIcon } from 'lucide-react'
import ReactDOMServer from 'react-dom/server'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { EmailChangeEmail } from '~/components/email-change-email'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription } from '~/components/ui/alert'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { requireUserId, requireUserWithRoles } from '~/utils/auth.server'
import { newEmailAddressSessionKey } from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from '~/utils/email.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { useIsPending } from '~/utils/misc'
import { EmailSchema } from '~/utils/validations'
import {
	prepareVerification,
	verifySessionStorage,
} from '~/utils/verification.server'
const ChangeEmailSchema = z.object({
	email: EmailSchema,
})

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	if (!user) {
		const params = new URLSearchParams({ redirectTo: request.url })
		throw redirect(`/login?${params}`)
	}

	return json({ user })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parseWithZod(formData, {
		schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
				select: { id: true },
			})

			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this email',
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

	const { email } = submission.value

	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'change-email',
		target: userId,
	})

	const response = await sendEmailAzure({
		to: email,
		subject: 'Email Change Verification',
		plainText: `Here is your verification code: ${otp}. Click here to verify your email: ${verifyUrl.toString()}`,
		html: ReactDOMServer.renderToString(
			<EmailChangeEmail otp={otp} verifyUrl={verifyUrl.toString()} />,
		),
	})

	if (response.status === 'success') {
		const verifySession = await verifySessionStorage.getSession(
			request.headers.get('cookie'),
		)
		verifySession.set(newEmailAddressSessionKey, email)

		return redirect(redirectTo.toString(), {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		return json({ result: submission.reply() }, { status: 500 })
	}
}

export default function ChangeEmailRoute() {
	const { user } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'change-email-form',
		constraint: getZodConstraint(ChangeEmailSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangeEmailSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle className="text-2xl font-bold">Change Email</CardTitle>
				<CardDescription>
					Update your email address associated with your account.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Alert className="mb-6">
					<InfoIcon className="h-4 w-4" />
					<AlertDescription>
						Your current email is: <strong>{user.email}</strong>
					</AlertDescription>
				</Alert>
				<Form className="space-y-6" method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<Field>
						<Label htmlFor={fields.email.id}>New Email Address</Label>
						<InputField
							meta={fields.email}
							type="email"
							placeholder="Enter your new email"
						/>
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
						{isPending ? 'Submitting...' : 'Change Email'}
					</StatusButton>
				</Form>
			</CardContent>
			<CardFooter>
				<p className="text-sm text-muted-foreground">
					After submitting, you&apos;ll receive a verification email at your new
					address.
				</p>
			</CardFooter>
		</Card>
	)
}
