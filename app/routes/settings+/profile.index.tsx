import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useFetcher, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import { CalendarDays, KeyRound, Mail, Monitor, Shield, User } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Icon } from '~/components/ui/icon'
import { Separator } from '~/components/ui/separator'
import { StatusButton } from '~/components/ui/status-button'
import {
	requireUserId,
	requireUserWithRoles,
	sessionKey,
} from '~/utils/auth.server'
import { twoFAVerificationType } from '~/utils/constants'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse, useDoubleCheck } from '~/utils/misc'
import { sessionStorage } from '~/utils/session.server'

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}

const signOutOfSessionsActionIntent = 'sign-out-of-sessions'

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])

	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')
	switch (intent) {
		// case profileUpdateActionIntent: {
		// 	return profileUpdateAction({ request, userId, formData })
		// }
		case signOutOfSessionsActionIntent: {
			return signOutOfSessionsAction({ request, userId, formData })
		}
		// case deleteDataActionIntent: {
		// 	return deleteDataAction({ request, userId, formData })
		// }
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			createdAt: true,
			image: {
				select: { id: true },
			},
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: {
								gt: new Date(),
							},
						},
					},
				},
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	const verification = await prisma.verification.findUnique({
		select: { id: true },
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	return json({ user, isTwoFAEnabled: Boolean(verification) })
}

function getInitials(name: string | null, username: string): string {
	if (name) {
		const parts = name.trim().split(/\s+/)
		if (parts.length >= 2) {
			return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
		}
		return name.slice(0, 2).toUpperCase()
	}
	return username.slice(0, 2).toUpperCase()
}

export default function ProfileIndexRoute() {
	const { user, isTwoFAEnabled } = useLoaderData<typeof loader>()
	const initials = getInitials(user.name, user.username)

	return (
		<div className="space-y-6">
			{/* Profile Information Section */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<User className="h-5 w-5" />
								Profile Information
							</CardTitle>
							<CardDescription>
								Your personal details and account information
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex items-center gap-6">
						<Avatar className="h-24 w-24">
							{user.image?.id ? (
								<AvatarImage
									src={`/resources/user-images/${user.image.id}`}
									alt={user.name ?? user.username}
								/>
							) : null}
							<AvatarFallback className="text-2xl font-semibold">
								{initials}
							</AvatarFallback>
						</Avatar>
						<div className="space-y-1">
							<h3 className="text-2xl font-semibold">
								{user.name ?? 'No name set'}
							</h3>
							<p className="text-muted-foreground">@{user.username}</p>
						</div>
					</div>

					<Separator />

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Mail className="h-5 w-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Email</p>
								<p className="font-medium">{user.email}</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<CalendarDays className="h-5 w-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Member since</p>
								<p className="font-medium">
									{format(new Date(user.createdAt), 'MMMM d, yyyy')}
								</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Security Section */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						Security
					</CardTitle>
					<CardDescription>
						Manage your account security settings
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between rounded-lg border p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Mail className="h-5 w-5 text-muted-foreground" />
							</div>
							<div>
								<p className="font-medium">Email Address</p>
								<p className="text-sm text-muted-foreground">
									Change your account email address
								</p>
							</div>
						</div>
						<Link to="/settings/profile/change-email">
							<Button variant="outline" size="sm">
								Change
							</Button>
						</Link>
					</div>

					<div className="flex items-center justify-between rounded-lg border p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<KeyRound className="h-5 w-5 text-muted-foreground" />
							</div>
							<div>
								<p className="font-medium">Password</p>
								<p className="text-sm text-muted-foreground">
									Update your password regularly to keep your account secure
								</p>
							</div>
						</div>
						<Link to="/settings/profile/change-password">
							<Button variant="outline" size="sm">
								Change
							</Button>
						</Link>
					</div>

					<div className="flex items-center justify-between rounded-lg border p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Shield className="h-5 w-5 text-muted-foreground" />
							</div>
							<div>
								<p className="font-medium">Two-Factor Authentication</p>
								<p className="text-sm text-muted-foreground">
									{isTwoFAEnabled
										? 'Your account is protected with 2FA'
										: 'Add an extra layer of security to your account'}
								</p>
							</div>
						</div>
						<Link to="/settings/profile/two-factor">
							<Button
								variant={isTwoFAEnabled ? 'outline' : 'default'}
								size="sm"
							>
								{isTwoFAEnabled ? (
									<>
										<Icon name="lock-closed" className="mr-2 h-4 w-4" />
										Manage
									</>
								) : (
									<>
										<Icon name="lock-open-1" className="mr-2 h-4 w-4" />
										Enable
									</>
								)}
							</Button>
						</Link>
					</div>
				</CardContent>
			</Card>

			{/* Sessions Section */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Monitor className="h-5 w-5" />
						Active Sessions
					</CardTitle>
					<CardDescription>
						Manage your active sessions across devices
					</CardDescription>
				</CardHeader>
				<CardContent>
					<SessionsManager />
				</CardContent>
			</Card>
		</div>
	)
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = cookieSession.get(sessionKey)
	invariantResponse(sessionId, 'Session ID not found', { status: 400 })

	await prisma.session.deleteMany({
		where: {
			userId,
			id: {
				not: sessionId,
			},
		},
	})
	return json({ status: 'success' } as const)
}

function SessionsManager() {
	const { user } = useLoaderData<typeof loader>()
	const dc = useDoubleCheck()
	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const totalSessions = user._count.sessions
	const otherSessionsCount = totalSessions - 1

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between rounded-lg border p-4">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
						<Monitor className="h-5 w-5 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<p className="font-medium">Current Session</p>
						<p className="text-sm text-muted-foreground">
							This device - Active now
						</p>
					</div>
				</div>
				<span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
					Active
				</span>
			</div>

			{otherSessionsCount > 0 ? (
				<div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900">
							<Monitor className="h-5 w-5 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<p className="font-medium">
								{otherSessionsCount} other{' '}
								{otherSessionsCount === 1 ? 'session' : 'sessions'}
							</p>
							<p className="text-sm text-muted-foreground">
								Sign out of all other devices for security
							</p>
						</div>
					</div>
					<fetcher.Form method="POST">
						<AuthenticityTokenInput />
						<StatusButton
							{...dc.getButtonProps({
								type: 'submit',
								name: 'intent',
								value: signOutOfSessionsActionIntent,
							})}
							variant={dc.doubleCheck ? 'destructive' : 'outline'}
							size="sm"
							status={
								fetcher.state !== 'idle'
									? 'pending'
									: (fetcher.data?.status ?? 'idle')
							}
						>
							{dc.doubleCheck ? 'Confirm' : 'Sign Out All'}
						</StatusButton>
					</fetcher.Form>
				</div>
			) : (
				<p className="py-2 text-center text-sm text-muted-foreground">
					This is your only active session
				</p>
			)}
		</div>
	)
}
