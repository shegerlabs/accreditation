import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useFetcher, useLoaderData } from '@remix-run/react'
import { CalendarDays, Mail } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Icon } from '~/components/ui/icon'
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

const profileUpdateActionIntent = 'update-profile'
const signOutOfSessionsActionIntent = 'sign-out-of-sessions'
const deleteDataActionIntent = 'delete-data'

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

export default function IndexRoute() {
	const { user, isTwoFAEnabled } = useLoaderData<typeof loader>()

	return (
		<Card className="mx-auto w-full">
			<CardHeader className="flex flex-row items-center gap-4">
				<Avatar className="h-24 w-24">
					<AvatarImage
						src="/placeholder.svg?height=96&width=96"
						alt="User's profile picture"
					/>
					<AvatarFallback>JD</AvatarFallback>
				</Avatar>
				<div className="flex flex-col">
					<CardTitle className="text-2xl">{user.name}</CardTitle>
					<CardDescription>@{user.username}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex items-center">
					<CalendarDays className="mr-2 h-4 w-4" />
					<span>Joined {user.createdAt.toString()}</span>
				</div>
				<div className="flex items-center">
					<Mail className="mr-2 h-4 w-4" />
					<span>{user.email}</span>
				</div>
				<SignOutOfSessions />
			</CardContent>
			<CardFooter className="flex justify-between">
				{/* <Button variant="outline">Edit Profile</Button> */}
				<div className="flex items-center gap-2">
					<Link to="/settings/profile/change-email">
						<Button>Change Email</Button>
					</Link>
					<Link to="/settings/profile/two-factor">
						<Button>
							{isTwoFAEnabled ? (
								<Icon name="lock-closed">2FA is enabled</Icon>
							) : (
								<Icon name="lock-open-1">Enable 2FA</Icon>
							)}
						</Button>
					</Link>
				</div>
			</CardFooter>
		</Card>
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

function SignOutOfSessions() {
	const { user } = useLoaderData<typeof loader>()
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const otherSessionsCount = user._count.sessions - 1

	return (
		<div>
			{otherSessionsCount ? (
				<fetcher.Form method="POST">
					<AuthenticityTokenInput />
					<StatusButton
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: signOutOfSessionsActionIntent,
						})}
						variant={dc.doubleCheck ? 'destructive' : 'default'}
						status={
							fetcher.state !== 'idle'
								? 'pending'
								: (fetcher.data?.status ?? 'idle')
						}
					>
						<Icon name="person">
							{dc.doubleCheck
								? `Are you sure?`
								: `Sign out of ${otherSessionsCount} other sessions`}
						</Icon>
					</StatusButton>
				</fetcher.Form>
			) : (
				<Icon name="person">This is your only session</Icon>
			)}
		</div>
	)
}
