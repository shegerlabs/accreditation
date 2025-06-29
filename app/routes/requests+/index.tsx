import { LoaderFunctionArgs, json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { EditIcon, EyeIcon, UserIcon } from 'lucide-react'
import { useMediaQuery } from 'react-responsive'
import { DataList } from '~/components/data-list'
import { SearchBar } from '~/components/search-bar'
import { Badge } from '~/components/ui/badge'
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
		filterFields: ['status', 'participantTypeId'],
		orderBy: [{ createdAt: 'desc' }],
		select: {
			id: true,
			email: true,
			firstName: true,
			familyName: true,
			organization: true,
			registrationCode: true,
			status: true,
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
						autoSubmit={false}
						showAddButton={false}
						filters={[
							{
								name: 'participantTypeId',
								label: 'Participant Type',
								type: 'select',
								options: [
									{ value: 'all', label: 'All' },
									...participantTypes
										.filter(participantType => participantType.name !== 'All')
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
							key: 'registrationCode',
							header: 'Code',
							render: (participant: any) => participant.registrationCode,
						},
						{
							key: 'name',
							header: 'Full Name',
							render: (participant: any) => (
								<div className="flex items-center space-x-2">
									<UserIcon className="h-4 w-4 text-primary" />
									<span>
										{participant.firstName} {participant.familyName}
									</span>
								</div>
							),
						},
						{
							key: 'participantType',
							header: 'Type',
							render: (participant: any) => participant.participantType.name,
						},
						{
							key: 'email',
							header: 'Email',
							render: (participant: any) => participant.email,
						},
						{
							key: 'organization',
							header: 'Organization',
							render: (participant: any) => participant.organization,
						},
						{
							key: 'status',
							header: 'Status',
							render: (participant: any) => {
								let status = participant.status
								if (
									participant.status === 'REJECTED' &&
									participant.step?.role?.name === 'first-validator'
								) {
									status = 'INPROGRESS'
								}

								const statusStyles = {
									INPROGRESS:
										'bg-orange-100 text-orange-800 hover:bg-orange-100/80',
									REJECTED: 'bg-red-100 text-red-800 hover:bg-red-100/80',
									PRINTED: 'bg-green-100 text-green-800 hover:bg-green-100/80',
									APPROVED: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80',
								}
								return (
									<Badge
										className={
											statusStyles[
												participant.status as keyof typeof statusStyles
											] ?? ''
										}
									>
										{participant.status}
									</Badge>
								)
							},
						},
						// {
						// 	key: 'step',
						// 	header: 'Current Step',
						// 	render: (participant: any) => (
						// 		<div className="flex items-center">
						// 			<span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
						// 				{participant.step?.role?.name === 'reviewer'
						// 					? 'focal person'
						// 					: participant.step?.role?.name}
						// 			</span>
						// 		</div>
						// 	),
						// },
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
