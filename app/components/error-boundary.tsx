import {
	isRouteErrorResponse,
	Link,
	useParams,
	useRouteError,
} from '@remix-run/react'
import { type ErrorResponse } from '@remix-run/router'
import { ArrowLeft, Home } from 'lucide-react'
import { getErrorMessage } from '~/utils/misc'
import { Button } from './ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
} from './ui/card'

type StatusHandler = (info: {
	error: ErrorResponse
	params: Record<string, string | undefined>
}) => JSX.Element | null

export function GeneralErrorBoundary({
	defaultStatusHandler = ({ error }) => (
		<ErrorDisplay
			title={`${error.status} ${error.statusText}`}
			message={error.data}
		/>
	),
	statusHandlers,
	unexpectedErrorHandler = error => (
		<ErrorDisplay title="Unexpected Error" message={getErrorMessage(error)} />
	),
}: {
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => JSX.Element | null
}) {
	const error = useRouteError()
	const params = useParams()

	if (typeof document !== 'undefined') {
		console.error(error)
	}

	return (
		<div className="container mx-auto flex h-full w-full items-center justify-center p-8">
			{isRouteErrorResponse(error)
				? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
						error,
						params,
					})
				: unexpectedErrorHandler(error)}
		</div>
	)
}
export function ErrorDisplay({
	title,
	message,
	redirectUrl = '/',
	errorCode = 400,
}: {
	title: string
	message: string
	redirectUrl?: string
	errorCode?: number
}) {
	return (
		<div className="flex items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					{/* <div className="flex items-center justify-center space-x-2">
						<AlertCircle className="h-8 w-8 text-destructive" />
						<CardTitle className="text-3xl font-bold">{errorCode}</CardTitle>
					</div> */}
					<CardDescription className="text-center">
						<h2 className="text-2xl font-semibold text-foreground">{title}</h2>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-center text-muted-foreground">{message}</p>
				</CardContent>
				<CardFooter className="flex flex-col justify-center gap-4 sm:flex-row">
					<Button
						variant="outline"
						className="flex w-full items-center justify-center gap-2 sm:w-auto"
						asChild
					>
						<Link to={redirectUrl}>
							<ArrowLeft className="h-4 w-4" />
							Go Back
						</Link>
					</Button>
					<Button
						className="flex w-full items-center justify-center gap-2 sm:w-auto"
						asChild
					>
						<Link to="/">
							<Home className="h-4 w-4" />
							Home
						</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	)
}
