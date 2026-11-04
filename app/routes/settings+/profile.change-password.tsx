import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { Form, Link, useActionData } from '@remix-run/react'
import { KeyRound } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { CheckboxField } from '~/components/conform/CheckboxField'
import { InputField } from '~/components/conform/InputField'
import { ErrorList, Field, FieldError } from '~/components/forms'
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
import {
	getPasswordHash,
	logout,
	requireUserId,
	requireUserWithRoles,
	verifyUserPassword,
} from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { PasswordSchema } from '~/utils/validations'

const ChangePasswordSchema = z
	.object({
		currentPassword: z.string({
			required_error: 'Current password is required',
		}),
		newPassword: PasswordSchema,
		confirmPassword: z.string({
			required_error: 'Please confirm your password',
		}),
		logoutAfterChange: z
			.string()
			.optional()
			.transform(val => val === 'on'),
	})
	.refine(data => data.newPassword === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	})

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: ChangePasswordSchema.superRefine(async (data, ctx) => {
			// Verify current password
			try {
				const user = await verifyUserPassword(
					{ id: userId },
					data.currentPassword,
				)
				if (!user) {
					ctx.addIssue({
						path: ['currentPassword'],
						code: z.ZodIssueCode.custom,
						message: 'Invalid current password',
					})
				}
			} catch (error) {
				// Handle locked account or other errors
				ctx.addIssue({
					path: ['currentPassword'],
					code: z.ZodIssueCode.custom,
					message:
						error instanceof Error
							? error.message
							: 'Password verification failed',
				})
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

	const { newPassword, logoutAfterChange } = submission.value

	// Hash the new password and update
	const hash = await getPasswordHash(newPassword)
	await prisma.password.update({
		where: { userId },
		data: { hash },
	})

	// If user chose to logout, redirect to login page
	if (logoutAfterChange) {
		return logout({ request, redirectTo: '/login' })
	}

	return redirectWithToast('/settings/profile', {
		type: 'success',
		title: 'Password Changed',
		description: 'Your password has been updated successfully.',
	})
}

export default function ChangePasswordRoute() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'change-password-form',
		constraint: getZodConstraint(ChangePasswordSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ChangePasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-2xl font-bold">
					<KeyRound className="h-6 w-6" />
					Change Password
				</CardTitle>
				<CardDescription>
					Update your password to keep your account secure.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form className="space-y-6" method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<Field>
						<Label htmlFor={fields.currentPassword.id}>Current Password</Label>
						<InputField
							meta={fields.currentPassword}
							type="password"
							autoComplete="current-password"
							placeholder="Enter your current password"
						/>
						{fields.currentPassword.errors && (
							<FieldError>{fields.currentPassword.errors}</FieldError>
						)}
					</Field>

					<Field>
						<Label htmlFor={fields.newPassword.id}>New Password</Label>
						<InputField
							meta={fields.newPassword}
							type="password"
							autoComplete="new-password"
							placeholder="Enter your new password"
						/>
						{fields.newPassword.errors && (
							<FieldError>{fields.newPassword.errors}</FieldError>
						)}
						<p className="text-sm text-muted-foreground">
							Password must be at least 8 characters with uppercase, lowercase,
							number, and special character.
						</p>
					</Field>

					<Field>
						<Label htmlFor={fields.confirmPassword.id}>
							Confirm New Password
						</Label>
						<InputField
							meta={fields.confirmPassword}
							type="password"
							autoComplete="new-password"
							placeholder="Confirm your new password"
						/>
						{fields.confirmPassword.errors && (
							<FieldError>{fields.confirmPassword.errors}</FieldError>
						)}
					</Field>

					<div className="flex items-center space-x-2">
						<CheckboxField meta={fields.logoutAfterChange} />
						<Label
							htmlFor={fields.logoutAfterChange.id}
							className="cursor-pointer text-sm font-normal"
						>
							Log out after changing password
						</Label>
					</div>

					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex gap-3">
						<StatusButton
							className="flex-1"
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							type="submit"
							disabled={isPending}
						>
							{isPending ? 'Changing Password...' : 'Change Password'}
						</StatusButton>
						<Button variant="outline" className="flex-1" asChild>
							<Link to="/settings/profile">Cancel</Link>
						</Button>
					</div>
				</Form>
			</CardContent>
		</Card>
	)
}
