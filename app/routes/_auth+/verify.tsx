import { getFormProps, useForm, type Submission } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	MetaFunction,
	json,
} from '@remix-run/node'
import { Form, useActionData, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import {
	codeQueryParam,
	redirectToQueryParam,
	targetQueryParam,
	typeQueryParam,
} from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { useIsPending } from '~/utils/misc'
import { validateRequest } from '~/utils/verification.server'

const types = ['onboarding', 'reset-password', 'change-email', '2fa'] as const
const VerificationTypeSchema = z.enum(types)
export type VerificationTypes = z.infer<typeof VerificationTypeSchema>

export const VerifySchema = z.object({
	[codeQueryParam]: z.string().min(6).max(6),
	[typeQueryParam]: VerificationTypeSchema,
	[targetQueryParam]: z.string(),
	[redirectToQueryParam]: z.string().optional(),
})

export type VerifyFunctionArgs = {
	request: Request
	submission: Submission<z.infer<typeof VerifySchema>>
	body: FormData | URLSearchParams
}

export async function loader({ request }: LoaderFunctionArgs) {
	const params = new URL(request.url).searchParams
	if (!params.has(codeQueryParam)) {
		// we don't want to show an error message on page load if the otp hasn't be prefilled in yet, so we'll send a response with an empty submission.
		return json({
			status: 'idle',
			submission: {
				payload: Object.fromEntries(params) as Record<string, unknown>,
				error: {} as Record<string, Array<string>>,
			},
		} as const)
	}

	return validateRequest(request, params)
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	return validateRequest(request, formData)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Setup Accreditation Account' }]
}

export default function VerifyRoute() {
	const [searchParams] = useSearchParams()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const type = VerificationTypeSchema.parse(searchParams.get(typeQueryParam))
	const checkEmail = (
		<>
			<h1 className="text-lg font-semibold">Check your Email</h1>
			<p className="mt-2 text-sm text-gray-600">
				We&apos;ve sent you a code to verify your email address. Please enter it
				below. Check your inbox or spam folder.
			</p>
		</>
	)

	const headings: Record<VerificationTypes, React.ReactNode> = {
		onboarding: checkEmail,
		'reset-password': checkEmail,
		'change-email': checkEmail,
		'2fa': (
			<>
				<h1 className="text-lg">Two-Factor Authentication</h1>
				<p className="mt-2 text-sm text-gray-600">
					Please enter your 2FA code to verify your identity.
				</p>
			</>
		),
	}

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(VerifySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VerifySchema })
		},
		shouldRevalidate: 'onBlur',
		defaultValue: {
			code: searchParams.get(codeQueryParam) ?? '',
			type: searchParams.get(typeQueryParam) ?? '',
			target: searchParams.get(targetQueryParam) ?? '',
			redirectTo: searchParams.get(redirectToQueryParam) ?? '',
		},
	})

	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader className="pb-6">
				<CardTitle className="text-center">{headings[type]}</CardTitle>
			</CardHeader>
			<CardContent>
				<Form className="space-y-6" method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<div className="space-y-4">
						<Field>
							<Label htmlFor={fields[codeQueryParam].id}>Code</Label>
							<InputField
								meta={fields[codeQueryParam]}
								type="text"
								placeholder="Enter your code"
							/>
							{fields[codeQueryParam].errors && (
								<FieldError>{fields[codeQueryParam].errors}</FieldError>
							)}
						</Field>

						{/* Hidden Fields */}
						<InputField meta={fields[typeQueryParam]} type="hidden" />
						<InputField meta={fields[targetQueryParam]} type="hidden" />
						<InputField meta={fields[redirectToQueryParam]} type="hidden" />

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
				</Form>
			</CardContent>
		</Card>
	)
}
