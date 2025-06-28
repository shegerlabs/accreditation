import { EventStatus } from '@prisma/client'
import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowRight,
	Calendar,
	CalendarX,
	Link as LinkIcon,
	Mail,
	Phone,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { registrationWizard } from '~/utils/registration.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	// Destroy session
	const { destroy } = await registrationWizard.register(request)

	// Delete any existing draft for this user
	await prisma.draft.deleteMany({
		where: { userId: user.id },
	})

	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.event,
		searchFields: ['name'],
		where: {
			status: EventStatus.PUBLISHED,
		},
		include: {
			tenant: {
				select: {
					website: true,
					email: true,
					phone: true,
				},
			},
		},
		orderBy: [{ startDate: 'asc' }],
	})

	const events = data.map(event => ({
		...event,
		formattedStartDate: format(new Date(event.startDate), 'MMMM d, yyyy'),
		formattedEndDate: format(new Date(event.endDate), 'MMMM d, yyyy'),
	}))

	const headers = await destroy()

	return json(
		{
			status: 'idle',
			events,
			totalPages,
			currentPage,
		} as const,
		{ headers },
	)
}

export default function IndexRoute() {
	const { events } = useLoaderData<typeof loader>()

	return (
		<div className="container mx-auto">
			{events.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 p-12 text-center">
					<CalendarX className="mb-4 h-12 w-12 text-gray-400" />
					<h2 className="mb-2 text-xl font-semibold">No Events Available</h2>
					<p className="mb-6 text-sm text-muted-foreground">
						There are currently no upcoming events scheduled.
					</p>
				</div>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
					{events.map((event: any) => (
						<Card key={event.id} className="flex flex-col">
							<CardHeader>
								<CardTitle className="line-clamp-1">{event.name}</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-grow flex-col space-y-2 text-sm text-muted-foreground">
								<div className="flex items-center">
									<LinkIcon className="mr-2 h-4 w-4" />
									<span>{event.tenant.website}</span>
								</div>

								<div className="flex items-center">
									<Mail className="mr-2 h-4 w-4" />
									<span>{event.tenant.email}</span>
								</div>

								<div className="flex items-center">
									<Phone className="mr-2 h-4 w-4" />
									<span>{event.tenant.phone}</span>
								</div>

								<div className="flex items-center">
									<Calendar className="mr-2 h-4 w-4" />
									<span>
										{event.formattedStartDate}
										{' - '}
										{event.formattedEndDate}
									</span>
								</div>
							</CardContent>
							<CardFooter>
								<Button asChild className="w-full">
									<Link
										to={`/requests/new?eventId=${event.id}&tenantId=${event.tenantId}`}
										className="flex items-center justify-center"
										aria-label={`Register for ${event.name}`}
										prefetch="intent"
									>
										Register <ArrowRight className="ml-2 h-4 w-4" />
									</Link>
								</Button>
							</CardFooter>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
