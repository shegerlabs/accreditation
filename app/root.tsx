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
import { getUser, getUserId } from './utils/auth.server'
import { sessionStorage } from './utils/session.server'
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
	useToast(data.toast)

	return (
		<Document env={data.ENV} theme={theme} isLoggedIn={Boolean(user)}>
			<AuthenticityTokenProvider token={data.csrfToken}>
				<HoneypotProvider {...data.honeypotProps}>
					<div
						className={`grid min-h-screen w-full ${user ? 'md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]' : ''}`}
					>
						{user && (
							<div className="hidden bg-muted/40 md:block">
								<div className="flex h-full max-h-screen flex-col gap-2">
									<div className="flex h-12 items-center border-b bg-primary">
										<Link
											to="/"
											className="flex items-center font-semibold text-primary-foreground"
										>
											<Icon name="emblem" className="h-16 w-16" />
											<span className="text-sm">Accreditation</span>
										</Link>
									</div>
									<div className="flex-1 overflow-auto py-2">
										<nav className="grid gap-4 px-2 text-sm font-medium">
											{data.menus.map((group, index) => (
												<Card key={index}>
													<CardHeader className="p-2">
														<CardTitle className="text-xs">
															{group.title}
														</CardTitle>
													</CardHeader>
													<CardContent className="p-2 pt-0">
														{group.items.map((item, itemIndex) => (
															<NavLink
																key={itemIndex}
																to={`${item.link}`}
																className={({ isActive }) =>
																	isActive
																		? 'flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-primary transition-all hover:text-primary'
																		: 'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary'
																}
															>
																<Icon name={item.icon} className="h-4 w-4" />
																{item.title}
															</NavLink>
														))}
													</CardContent>
												</Card>
											))}
										</nav>
									</div>
									<div className="mt-auto p-4">
										<Card className="w-full">
											<CardHeader className="p-2">
												<CardTitle className="text-xs">Actions</CardTitle>
											</CardHeader>
											<CardContent className="grid grid-cols-2 gap-2 p-2 text-xs">
												<NavLink
													to="/settings/profile"
													className="flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-primary"
												>
													<Icon name="person" className="h-3 w-3" />
													Profile
												</NavLink>
												<NavLink
													to="#"
													className="flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-primary"
												>
													<Icon name="shield" className="h-3 w-3" />
													Support
												</NavLink>
												<NavLink
													to="/faq"
													className="flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-primary"
												>
													<Icon name="help-circle" className="h-3 w-3" />
													FAQ
												</NavLink>
												<Form action="/logout" method="POST">
													<AuthenticityTokenInput />
													<button
														type="submit"
														className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-primary"
													>
														<Icon name="logout" className="h-3 w-3" />
														Log Out
													</button>
												</Form>
											</CardContent>
										</Card>
									</div>
								</div>
							</div>
						)}
						<div className="flex h-screen flex-col">
							<header className="flex h-12 items-center gap-4 border-b bg-primary px-4">
								{user ? (
									<Sheet>
										<SheetTrigger asChild>
											<Button
												variant="outline"
												size="icon"
												className="shrink-0 bg-primary-foreground text-primary md:hidden"
											>
												<Icon name="menu" className="h-4 w-4" />
												<span className="sr-only">Toggle navigation menu</span>
											</Button>
										</SheetTrigger>
										<SheetContent side="left" className="flex flex-col">
											<nav className="grid gap-2 text-sm font-medium">
												<Link
													to="#"
													className="flex items-center gap-2 text-sm font-semibold"
												>
													<Icon name="package2" className="h-5 w-5" />
													<span className="">Accreditation</span>
												</Link>

												{data.menus.map((group, index) => (
													<Card key={index}>
														<CardHeader className="p-2">
															<CardTitle className="text-xs">
																{group.title}
															</CardTitle>
														</CardHeader>
														<CardContent className="p-2 pt-0">
															{group.items.map((item, itemIndex) => (
																<NavLink
																	key={itemIndex}
																	to={`${item.link}`}
																	className={({ isActive }) =>
																		isActive
																			? 'flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-primary transition-all hover:text-primary'
																			: 'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary'
																	}
																>
																	<Icon name={item.icon} className="h-4 w-4" />
																	{item.title}
																</NavLink>
															))}
														</CardContent>
													</Card>
												))}
											</nav>

											<div className="mt-auto">
												<Card className="w-full">
													<CardHeader className="p-2">
														<CardTitle className="text-xs">Actions</CardTitle>
													</CardHeader>
													<CardContent className="grid grid-cols-2 gap-2 p-2 text-xs">
														<NavLink
															to="/settings/profile"
															className="flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-foreground"
														>
															<Icon name="settings" className="h-3 w-3" />
															Profile
														</NavLink>
														<NavLink
															to="#"
															className="flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-foreground"
														>
															<Icon name="shield" className="h-3 w-3" />
															Support
														</NavLink>
														<NavLink
															to="/faq"
															className="flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-foreground"
														>
															<Icon name="help-circle" className="h-3 w-3" />
															FAQ
														</NavLink>
														<Form action="/logout" method="POST">
															<AuthenticityTokenInput />
															<button
																type="submit"
																className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground transition-all hover:text-foreground"
															>
																<Icon name="logout" className="h-3 w-3" />
																Log Out
															</button>
														</Form>
													</CardContent>
												</Card>
											</div>
										</SheetContent>
									</Sheet>
								) : (
									<Link
										to="/"
										className="flex items-center gap-2 font-semibold text-primary-foreground"
									>
										<Icon name="emblem" className="h-16 w-16" />
										<span className="text-sm">Accreditation</span>
									</Link>
								)}
								<div className="flex-1"></div>

								<ThemeSwitch userPreference={theme} />

								{user ? (
									<div className="flex items-center space-x-2">
										<Button
											variant="ghost"
											size="sm"
											className="h-8 px-2 text-primary-foreground hover:bg-transparent hover:text-primary-foreground"
										>
											<Icon name="bell" className="h-4 w-4" />
											<span className="sr-only">Toggle notifications</span>
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="sm"
													className="h-8 text-primary-foreground hover:bg-transparent hover:text-primary-foreground"
												>
													<Icon name="circle-user" className="mr-2 h-4 w-4" />
													<span className="hidden text-sm font-medium md:inline-block">
														{user.name}
													</span>
													<Icon name="chevron-down" className="ml-2 h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												{/* <DropdownMenuItem>
													<Icon name="settings" className="mr-2 h-4 w-4" />
													<span>Settings</span>
												</DropdownMenuItem> */}
												{/* <DropdownMenuItem>
													<Icon name="help-circle" className="mr-2 h-4 w-4" />
													<span>Support</span>
												</DropdownMenuItem> */}
												<DropdownMenuSeparator />
												<DropdownMenuItem>
													<Icon name="logout" className="mr-2 h-4 w-4" />
													<Form action="/logout" method="POST">
														<AuthenticityTokenInput />
														<Button size="xs" type="submit" variant="ghost">
															Logout
														</Button>
													</Form>
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								) : (
									<NavLink
										className="ml-4 text-sm font-medium text-primary-foreground hover:text-primary-foreground"
										to="/login"
									>
										<span>Login</span>
									</NavLink>
								)}
							</header>
							<main className="flex-1 overflow-auto border-l p-4">
								<Outlet />
								<Toaster position="top-right" theme={theme} />
							</main>
						</div>
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
}: {
	children: React.ReactNode
	theme?: Theme
	env?: Record<string, string>
	isLoggedIn?: boolean
}) {
	return (
		<html lang="en" className={theme}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
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
				{isLoggedIn && <LogoutTimer />}
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

function LogoutTimer() {
	const [status, setStatus] = useState<'idle' | 'show-modal'>('idle')
	const location = useLocation()
	const submit = useSubmit()
	// 🦉 normally you'd want these numbers to be much higher, but for the purpose
	// of this exercise, we'll make it short:
	// const logoutTime = 5000
	// const modalTime = 2000

	// 🦉 here's what would be more likely:
	const logoutTime = 1000 * 60 * 60 // 1 hour
	const modalTime = logoutTime - 1000 * 60 * 2 // 58 minutes
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
