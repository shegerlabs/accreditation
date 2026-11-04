import { LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { EditIcon, EyeIcon, ImageIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { requireUserWithRoles } from '~/utils/auth.server'
import { filterAndPaginate, prisma } from '~/utils/db.server'
import { registrationWizard } from '~/utils/registration.server'
import { useOptionalUser, userHasPermission } from '~/utils/user'

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const { destroy } = await registrationWizard.register(request)
	const { data, totalPages, currentPage } = await filterAndPaginate({
		request,
		model: prisma.participant,
		where: {
			userId: user.id,
		},
		searchFields: [
			'email',
			'organization',
			'registrationCode',
			'firstName',
			'familyName',
		],
		filterFields: [
			'status',
			'participantTypeId',
			{ field: 'attendClosedSession', isBoolean: true },
		],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			email: true,
			firstName: true,
			familyName: true,
			organization: true,
			registrationCode: true,
			status: true,
			attendClosedSession: true,
			step: {
				select: {
					name: true,
					role: {
						select: {
							name: true,
						},
					},
				},
			},
			tenant: {
				select: {
					name: true,
				},
			},
			event: {
				select: {
					name: true,
				},
			},
			participantType: {
				select: {
					name: true,
				},
			},
			documents: {
				where: {
					documentType: 'PHOTO',
				},
				select: {
					id: true,
				},
				take: 1,
			},
		},
	})

	const participantTypes = await prisma.participantType.findMany({
		select: {
			id: true,
			name: true,
		},
	})

	const headers = await destroy()

	return json(
		{
			status: 'idle',
			participants: data,
			totalPages,
			currentPage,
			participantTypes,
		} as const,
		{ headers },
	)
}

export default function IndexRoute() {
	const data = useLoaderData<typeof loader>()
	const { totalPages, currentPage, participantTypes } = data

	const isMobile = useMediaQuery({ maxWidth: 767 })

	const user = useOptionalUser()

	return (
		<div className="flex flex-col gap-8">
			<div className="w-full">
				<div className="mb-6">
					<SearchBar
						status={data.status}
						action="/requests"
						autoSubmit={true}
						showAddButton={false}
						filters={[
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...participantTypes
										.filter(participantType => participantType.name !== 'Any')
										.map(participantType => ({
											value: participantType.id,
											label: participantType.name,
										})),
								],
							},
							{
								name: 'status',
								label: 'Status',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'INPROGRESS', label: 'In Progress' },
									{ value: 'REJECTED', label: 'Rejected' },
									{ value: 'PRINTED', label: 'Printed' },
								],
							},
							{
								name: 'attendClosedSession',
								label: 'Session',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									{ value: 'true', label: 'Closed' },
									{ value: 'false', label: 'Open' },
								],
							},
						]}
						extras={[
							{
								label: 'Export',
								to: '/resources/participants',
								icon: 'arrow-down',
								type: 'anchor',
							},
						]}
					/>
				</div>

				<DataList
					data={data.participants}
					columns={[
						{
							key: 'name',
							header: 'Participant',
							render: (participant: any) => {
								const photo = participant.documents?.[0]
								return (
									<Link
										to={`/requests/${participant.id}`}
										className="flex items-center gap-3"
									>
										{photo ? (
											<img
												src={`/resources/participants/${photo.id}`}
												alt={`${participant.firstName} ${participant.familyName}`}
												className="h-10 w-10 rounded-full object-cover"
												loading="lazy"
												onError={e => {
													const target = e.target as HTMLImageElement
													target.style.display = 'none'
													if (target.parentElement) {
														target.parentElement.innerHTML = `<div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><svg class="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>`
													}
												}}
											/>
										) : (
											<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
												<ImageIcon className="h-5 w-5 text-muted-foreground" />
											</div>
										)}
										<div>
											<div className="font-medium">
												{participant.registrationCode}
											</div>
											<div className="text-sm text-muted-foreground">
												{participant.firstName} {participant.familyName}
											</div>
										</div>
									</Link>
								)
							},
						},
						{
							key: 'participantType',
							header: 'Type',
							render: (participant: any) => participant.participantType.name,
						},
						{
							key: 'status',
							header: 'Status',
							render: (participant: any) => participant.status,
						},
						{
							key: 'session',
							header: 'Session',
							render: (participant: any) => (
								<span
									className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
										participant.attendClosedSession
											? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20'
											: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10'
									}`}
								>
									{participant.attendClosedSession ? 'Closed' : 'Open'}
								</span>
							),
						},
						{
							key: 'step',
							header: 'Stage',
							render: (participant: any) => {
								const roleName = participant.step?.role?.name
								let displayName = roleName

								if (roleName === 'reviewer') {
									displayName = 'focal person'
								} else if (
									roleName === 'first-validator' ||
									roleName === 'second-validator'
								) {
									displayName = 'Validating'
								} else if (roleName === 'badge-printer') {
									displayName = 'Printing'
								}

								return (
									<div className="flex items-center">
										<span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
											{displayName}
										</span>
									</div>
								)
							},
						},
					]}
					actions={[
						...(userHasPermission(user, 'read:participant:own')
							? ([
									{
										label: 'View',
										icon: <EyeIcon className="h-4 w-4" />,
										href: (participant: any) => `/requests/${participant.id}`,
										variant: 'outline' as const,
									},
								] as any)
							: ([] as any)),
						...(userHasPermission(user, 'update:participant:own')
							? ([
									{
										label: 'Edit',
										icon: <EditIcon className="h-4 w-4" />,
										href: (participant: any) =>
											`/requests/${participant.id}/edit`,
										variant: 'outline' as const,
										show: (participant: any) =>
											participant.status === 'REJECTED',
									},
								] as any)
							: ([] as any)),
					]}
					status={data.status}
					isMobile={isMobile}
					keyExtractor={participant => participant.id}
					totalPages={totalPages}
					currentPage={currentPage}
				/>
			</div>
		</div>
	)
}
