import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import {
	ActionFunctionArgs,
	json,
	LinksFunction,
	LoaderFunctionArgs,
	MetaFunction,
	redirect,
} from '@remix-run/node'
import {
	Form,
	Link,
	Links,
	Meta,
	NavLink,
	Outlet,
	Scripts,
	ScrollRestoration,
	useFetcher,
	useFetchers,
	useLoaderData,
	useLocation,
	useSubmit,
} from '@remix-run/react'
import {
	AuthenticityTokenInput,
	AuthenticityTokenProvider,
} from 'remix-utils/csrf/react'
import { HoneypotProvider } from 'remix-utils/honeypot/react'
import faviconAssetUrl from './assets/favicon.svg'
import logoAssetUrl from './assets/logo.svg'
import { GeneralErrorBoundary } from './components/error-boundary'
import { useToast } from './components/toaster'
import { Icon, href as iconsHref } from './components/ui/icon'
import tailwindStyleSheetUrl from './styles/tailwind.css?url'
import { csrf } from './utils/csrf.server'
import { getEnv } from './utils/env.server'
import { honeypot } from './utils/honeypot.server'
import { combineHeaders, invariantResponse } from './utils/misc'
import { getTheme, setTheme, Theme } from './utils/theme.server'
import { getToast } from './utils/toast.server'

import { IconName } from '@/icon-name'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'
import { ErrorList } from './components/forms'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from './components/ui/alert-dialog'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Toaster } from './components/ui/sonner'
import { getImpersonationInfo, getUser, getUserId } from './utils/auth.server'
import { sessionStorage } from './utils/session.server'
import { getSetting, SettingKeys } from './utils/settings.server'
import { useOptionalUser } from './utils/user'

const ThemeFormSchema = z.object({
	theme: z.enum(['light', 'dark']),
})

export type MenuItem = {
	id: string
	name: string
	title: string
	icon: IconName
	link: string
}

export type Menu = {
	name: string
	title: string
	items: MenuItem[]
}

export async function loader({ request }: LoaderFunctionArgs) {
	const [csrfToken, csrfCookieHeader] = await csrf.commitToken(request)
	const honeypotProps = honeypot.getInputProps()
	const { toast, headers: toastHeaders } = await getToast(request)
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const userId = await getUserId(request)
	const user = userId ? await getUser(userId) : null
	const inactivityTimeoutMinutes = await getSetting<number>(
		SettingKeys.AUTH_INACTIVITY_TIMEOUT_MINUTES,
	)
	const isMaintenanceMode = await getSetting<boolean>(SettingKeys.MAINTENANCE_MODE_ENABLED)
	const maintenanceMessage = isMaintenanceMode
		? await getSetting<string>(SettingKeys.MAINTENANCE_MESSAGE)
		: null
	const impersonationInfo = await getImpersonationInfo(request)

	if (userId && !user) {
		// Something weird happened
		// The user is authenticated but we can't find them in the database.
		// Maybe they were deleted or the database was reset.
		// Log them out
		throw redirect('/', {
			headers: {
				'set-cookie': await sessionStorage.destroySession(cookieSession),
			},
		})
	}

	const menuMap: Map<string, Menu> = new Map()

	user?.roles
		.filter(role => role.name === 'user' || role.name === 'focal')
		.forEach(role => {
			role.menus.forEach(menu => {
				if (!menuMap.has(menu.id)) {
					menuMap.set(menu.id, {
						name: menu.name,
						title: menu.title,
						items: [],
					})
				}
			})

			role.menuItems.forEach(menuItem => {
				const menu = menuMap.get(menuItem.menuId)
				if (menu) {
					if (!menu.items.find(item => item.id === menuItem.id)) {
						menu.items.push({
							id: menuItem.id,
							name: menuItem.name,
							title: menuItem.title,
							icon: menuItem.icon as IconName,
							link: menuItem.link,
						})
					}
				}
			})
		})

	menuMap.forEach(menu => {
		menu.items.sort((a, b) => a.title.localeCompare(b.title))
	})

	return json(
		{
			theme: getTheme(request),
			user,
			toast,
			ENV: getEnv(),
			honeypotProps,
			csrfToken,
			inactivityTimeoutMinutes,
			isMaintenanceMode,
			maintenanceMessage,
			impersonationInfo,
			menus: Array.from(menuMap.values()).sort((a, b) =>
				a.title.localeCompare(b.title),
			),
		},
		{
			headers: combineHeaders(
				csrfCookieHeader ? { 'set-cookie': csrfCookieHeader } : null,
				toastHeaders,
			),
		},
	)
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	invariantResponse(
		formData.get('intent') === 'update-theme',
		'Invalid intent',
		{ status: 400 },
	)

	const submission = parseWithZod(formData, {
		schema: ThemeFormSchema,
	})

	if (submission.status !== 'success') {
		return json(submission.reply(), {
			status: submission.status === 'error' ? 400 : 200,
		})
	}

	const { theme } = submission.value

	return json(submission.reply(), {
		headers: { 'set-cookie': setTheme(theme) },
	})
}

export default function App() {
	const data = useLoaderData<typeof loader>()
	const theme = useTheme()
	const user = useOptionalUser()
	const location = useLocation()
	useToast(data.toast)

	const authRoutes = ['/login', '/logout', '/signup', '/verify', '/reset-password', '/forgot-password']
	const isAuthRoute = authRoutes.some(route => location.pathname.startsWith(route))
	const showMaintenanceBanner = data.isMaintenanceMode && user && !isAuthRoute
	const blockContent = data.isMaintenanceMode && user && !isAuthRoute

	return (
		<Document
			env={data.ENV}
			theme={theme}
			isLoggedIn={Boolean(user)}
			inactivityTimeoutMinutes={data.inactivityTimeoutMinutes}
		>
			<AuthenticityTokenProvider token={data.csrfToken}>
				<HoneypotProvider {...data.honeypotProps}>
					<div className="flex min-h-dvh w-full flex-col">
						{showMaintenanceBanner && (
							<div className="bg-yellow-400 px-4 py-2 text-center text-sm font-medium text-yellow-900">
								{data.maintenanceMessage}
							</div>
						)}
						{data.impersonationInfo?.isImpersonating && (
							<ImpersonationBanner
								userName={data.user?.name}
								adminName={data.impersonationInfo.impersonatedByName}
							/>
						)}
						<header className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-4 border-b bg-primary px-2">
							{user ? (
								<>
									<Link
										to="/"
										className="flex items-center gap-2 font-semibold text-primary-foreground"
									>
										<img src={logoAssetUrl} alt="Logo" className="h-16 w-16" />
										<span className="hidden text-sm sm:inline-block">
											Accreditation
										</span>
									</Link>
									{!blockContent && (
										<>
											<nav className="hidden flex-1 items-center gap-1 md:flex">
												{data.menus.map(group =>
													group.items.map(item => (
														<NavLink
															key={item.id}
															to={item.link}
															className={({ isActive }) =>
																`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
																	isActive
																		? 'bg-primary-foreground/10 text-primary-foreground'
																		: 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
																}`
															}
														>
															<Icon name={item.icon} className="h-4 w-4" />
															<span>{item.title}</span>
														</NavLink>
													)),
												)}
											</nav>
											<Sheet>
												<SheetTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="text-primary-foreground hover:bg-primary-foreground/10 md:hidden"
													>
														<Icon name="menu" className="h-5 w-5" />
														<span className="sr-only">Toggle navigation menu</span>
													</Button>
												</SheetTrigger>
												<SheetContent side="left" className="flex flex-col">
													<nav className="grid gap-2 text-sm font-medium">
														<Link
															to="/"
															className="mb-4 flex items-center gap-2 text-sm font-semibold"
														>
															<img src={logoAssetUrl} alt="Logo" className="h-16 w-16" />
															<span>Accreditation</span>
														</Link>
														{data.menus.map(group =>
															group.items.map(item => (
																<NavLink
																	key={item.id}
																	to={item.link}
																	className={({ isActive }) =>
																		`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
																			isActive
																				? 'bg-primary text-primary-foreground'
																				: 'text-muted-foreground hover:bg-muted hover:text-foreground'
																		}`
																	}
																>
																	<Icon name={item.icon} className="h-4 w-4" />
																	{item.title}
																</NavLink>
															)),
														)}
													</nav>
												</SheetContent>
											</Sheet>
										</>
									)}
								</>
							) : (
								<Link
									to="/"
									className="flex items-center gap-2 font-semibold text-primary-foreground"
								>
									<img src={logoAssetUrl} alt="Logo" className="h-16 w-16" />
									<span className="text-sm">Accreditation</span>
								</Link>
							)}
							<div className="ml-auto flex items-center gap-2">
								<ThemeSwitch userPreference={theme} />
								{user ? (
									<>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 px-2 text-primary-foreground hover:bg-primary-foreground/10"
										>
											<Icon name="bell" className="h-4 w-4" />
											<span className="sr-only">Toggle notifications</span>
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="sm"
													className="h-8 text-primary-foreground hover:bg-primary-foreground/10"
												>
													<Icon name="circle-user" className="mr-2 h-4 w-4" />
													<span className="hidden text-sm font-medium sm:inline-block">
														{user.name}
													</span>
													<Icon name="chevron-down" className="ml-2 h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem asChild>
													<NavLink
														to="/settings/profile"
														className="flex items-center"
													>
														<Icon name="person" className="mr-2 h-4 w-4" />
														Profile
													</NavLink>
												</DropdownMenuItem>
												<DropdownMenuItem asChild>
													<NavLink to="#" className="flex items-center">
														<Icon name="shield" className="mr-2 h-4 w-4" />
														Support
													</NavLink>
												</DropdownMenuItem>
												<DropdownMenuItem asChild>
													<NavLink to="/faq" className="flex items-center">
														<Icon name="help-circle" className="mr-2 h-4 w-4" />
														FAQ
													</NavLink>
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem>
													<Form
														action="/logout"
														method="POST"
														className="w-full"
													>
														<AuthenticityTokenInput />
														<button
															type="submit"
															className="flex w-full items-center"
														>
															<Icon name="logout" className="mr-2 h-4 w-4" />
															Logout
														</button>
													</Form>
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</>
								) : (
									<NavLink
										className="text-sm font-medium text-primary-foreground hover:text-primary-foreground/80"
										to="/login"
									>
										Login
									</NavLink>
								)}
							</div>
						</header>
						<main className="flex-1 overflow-y-auto p-4">
							{blockContent ? null : <Outlet />}
							<Toaster position="top-right" theme={theme} />
						</main>
					</div>
				</HoneypotProvider>
			</AuthenticityTokenProvider>
		</Document>
	)
}

function Document({
	children,
	theme,
	env = {},
	isLoggedIn,
	inactivityTimeoutMinutes = 60,
}: {
	children: React.ReactNode
	theme?: Theme
	env?: Record<string, string>
	isLoggedIn?: boolean
	inactivityTimeoutMinutes?: number
}) {
	return (
		<html lang="en" className={theme}>
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, interactive-widget=resizes-content"
				/>
				<meta name="theme-color" content="#c6bc9f" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<script
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
				{isLoggedIn && (
					<LogoutTimer inactivityTimeoutMinutes={inactivityTimeoutMinutes} />
				)}
				<ScrollRestoration
					getKey={location => {
						return location.pathname
					}}
				/>
				<Scripts />
			</body>
		</html>
	)
}

function useTheme() {
	const data = useLoaderData<typeof loader>()
	const fetchers = useFetchers()
	const fetcher = fetchers.find(
		fetcher => fetcher.formData?.get('intent') === 'update-theme',
	)
	const optimisticTheme = fetcher?.formData?.get('theme') as Theme | undefined
	if (optimisticTheme === 'light' || optimisticTheme === 'dark') {
		return optimisticTheme
	}

	return data.theme
}

function ThemeSwitch({ userPreference }: { userPreference?: Theme }) {
	const fetcher = useFetcher<typeof action>()

	const [form] = useForm({
		id: 'theme-switch',
		lastResult: fetcher.data,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ThemeFormSchema })
		},
	})

	const mode = userPreference ?? 'light'
	const nextMode = mode === 'light' ? 'dark' : 'light'
	const modeLabel = {
		light: (
			<Icon name="sun" className="text-primary-foreground">
				<span className="sr-only">Light</span>
			</Icon>
		),
		dark: (
			<Icon name="moon">
				<span className="sr-only">Dark</span>
			</Icon>
		),
	}

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="theme" value={nextMode} />
			<div className="flex gap-2">
				<button
					name="intent"
					value="update-theme"
					type="submit"
					className="flex h-8 w-8 cursor-pointer items-center justify-center"
				>
					{modeLabel[mode]}
				</button>
			</div>
			<ErrorList errors={form.errors} id={form.errorId} />
		</fetcher.Form>
	)
}

function LogoutTimer({
	inactivityTimeoutMinutes,
}: {
	inactivityTimeoutMinutes: number
}) {
	const [status, setStatus] = useState<'idle' | 'show-modal'>('idle')
	const location = useLocation()
	const submit = useSubmit()

	// Use configurable timeout from settings
	const logoutTime = 1000 * 60 * inactivityTimeoutMinutes
	const modalTime = logoutTime - 1000 * 60 * 2 // Show modal 2 minutes before logout
	const modalTimer = useRef<ReturnType<typeof setTimeout>>()
	const logoutTimer = useRef<ReturnType<typeof setTimeout>>()
	const [timeLeft, setTimeLeft] = useState<number>(0) // New state for time left
	const countdownTimer = useRef<ReturnType<typeof setInterval>>() // New ref for countdown timer

	const startCountdown = useCallback(() => {
		const initialTimeLeft = logoutTime / 1000 // Convert logoutTime to seconds
		setTimeLeft(initialTimeLeft)
		countdownTimer.current = setInterval(() => {
			setTimeLeft(prevTime => {
				if (prevTime <= 1) {
					clearInterval(countdownTimer.current)
					return 0
				}
				return prevTime - 1
			})
		}, 1000)
	}, [logoutTime])

	useEffect(() => {
		if (status === 'show-modal') {
			startCountdown()
		} else {
			clearInterval(countdownTimer.current)
		}
	}, [status, startCountdown])

	const logout = useCallback(() => {
		submit(null, { method: 'POST', action: '/logout' })
	}, [submit])

	const cleanupTimers = useCallback(() => {
		clearTimeout(modalTimer.current)
		clearTimeout(logoutTimer.current)
	}, [])

	const resetTimers = useCallback(() => {
		cleanupTimers()
		modalTimer.current = setTimeout(() => {
			setStatus('show-modal')
		}, modalTime)
		logoutTimer.current = setTimeout(logout, logoutTime)
	}, [cleanupTimers, logout, logoutTime, modalTime])

	useEffect(() => resetTimers(), [resetTimers, location.key])
	useEffect(() => cleanupTimers, [cleanupTimers])

	function closeModal() {
		setStatus('idle')
		resetTimers()
	}

	return (
		<AlertDialog
			aria-label="Pending Logout Notification"
			open={status === 'show-modal'}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you still there?</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogDescription>
					You are going to be logged out in {timeLeft} due to inactivity. Close
					this modal to stay logged in.
				</AlertDialogDescription>
				<AlertDialogFooter className="flex items-end gap-8">
					<AlertDialogCancel onClick={closeModal}>
						Remain Logged In
					</AlertDialogCancel>
					<Form method="POST" action="/logout">
						<AlertDialogAction type="submit">Logout</AlertDialogAction>
					</Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function ImpersonationBanner({
	userName,
	adminName,
}: {
	userName?: string | null
	adminName?: string | null
}) {
	return (
		<div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
			<div className="flex items-center justify-center gap-4">
				<span>
					<Icon name="person" className="mr-2 inline h-4 w-4" />
					Viewing as <strong>{userName || 'User'}</strong>
					{adminName && (
						<span className="ml-1 text-amber-800">
							(initiated by {adminName})
						</span>
					)}
				</span>
				<Form method="POST" action="/stop-impersonating" className="inline">
					<Button
						type="submit"
						variant="outline"
						size="sm"
						className="h-7 border-amber-700 bg-amber-600 text-amber-950 hover:bg-amber-400"
					>
						<Icon name="logout" className="mr-1 h-3 w-3" />
						Stop Impersonating
					</Button>
				</Form>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<Document>
			<div className="flex-1">
				<GeneralErrorBoundary />
			</div>
		</Document>
	)
}

export const links: LinksFunction = () => {
	return [
		{ rel: 'prefetch', href: iconsHref, as: 'image' },
		{ rel: 'icon', type: 'image/svg+xml', href: faviconAssetUrl },
		{ rel: 'stylesheet', href: tailwindStyleSheetUrl },
	].filter(Boolean)
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	return [
		{ title: data ? 'Accreditation' : 'Error | Accreditation' },
		{ name: 'description', content: `Your own events platform` },
	]
}
