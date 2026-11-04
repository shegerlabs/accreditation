import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	Briefcase,
	Calendar,
	CheckCircleIcon,
	CircleDashedIcon,
	FileCheck,
	FileImage,
	FileText,
	Globe,
	Pencil,
	SkipForwardIcon,
	User,
	XCircleIcon,
} from 'lucide-react'
import { DocumentPreview } from '~/components/document-preview'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { getParticipantDocumentFileSrc, invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { useOptionalUser, userHasPermission } from '~/utils/user'

type ParticipantActionArgs = {
	request: Request
	participantId: string
	formData: FormData
	userId: string
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: {
			documents: true,
			title: {
				select: {
					name: true,
				},
			},
			country: {
				select: {
					name: true,
				},
			},
			nationality: {
				select: {
					name: true,
				},
			},
			participantType: {
				include: {
					templates: {
						include: {
							attachments: true,
						},
					},
				},
			},
			approvals: {
				orderBy: {
					createdAt: 'asc',
				},
				select: {
					id: true,
					result: true,
					remarks: true,
					createdAt: true,
					step: {
						select: {
							name: true,
							action: true,
							role: {
								select: {
									name: true,
								},
							},
						},
					},
					user: {
						select: {
							username: true,
						},
					},
				},
			},
			step: {
				include: {
					role: {
						select: {
							name: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(participant, 'Not Found', { status: 404 })

	invariantResponse(participant.userId === user.id, 'Unauthorized', {
		status: 403,
	})

	// Check if user has focal role
	const userWithRoles = await prisma.user.findUnique({
		where: { id: user.id },
		select: { roles: { select: { name: true } } },
	})
	const isFocal = userWithRoles?.roles.some(r => r.name === 'focal') ?? false

	const generalInfo = {
		id: participant.id,
		tenantId: participant.tenantId,
		eventId: participant.eventId,
		participantTypeId: participant.participantTypeId,
		participantType: participant.participantType.name,
		gender: participant.gender,
		title: participant.title.name,
		firstName: participant.firstName,
		familyName: participant.familyName,
		dateOfBirth: participant.dateOfBirth
			? format(new Date(participant.dateOfBirth), 'PP')
			: 'N/A',
		nationality: participant.nationality.name,
		passportNumber: participant.passportNumber,
		passportExpiry: participant.passportExpiry,
	}

	const professionalInfo = {
		organization: participant.organization,
		jobTitle: participant.jobTitle,
		country: participant.country.name,
		city: participant.city,
		email: participant.email,
		website: participant.website,
		telephone: participant.telephone,
		address: participant.address,
		preferredLanguage: participant.preferredLanguage,
	}

	const meetings = await prisma.meetingType.findMany({
		where: {
			id: {
				in: participant.wishList?.split(',') ?? [],
			},
		},
	})

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')
	const passport = participant?.documents.find(
		doc => doc.documentType === 'PASSPORT',
	)
	const letter = participant?.documents.find(
		doc => doc.documentType === 'LETTER',
	)

	const SYSTEM_STEPS = ['Request Received', 'Review Request']
	const isSystemStep = (stepName: string) =>
		SYSTEM_STEPS.some(name =>
			stepName.toLowerCase().includes(name.toLowerCase()),
		)

	const approvals = participant?.approvals.map(approval => {
		const isBypass = approval.remarks?.includes('Bypassed')
		const isAdminReject = approval.remarks?.includes(
			'Rejected by administrator',
		)

		return {
			id: approval.id,
			result: approval.result,
			remarks: approval.remarks,
			createdAt: approval.createdAt,
			stepName: isBypass
				? 'Admin Bypass'
				: isAdminReject
					? 'Admin Reject'
					: approval.step.name,
			stepAction: isBypass
				? 'BYPASS'
				: isAdminReject
					? 'REJECT'
					: approval.step.action,
			roleName:
				isBypass || isAdminReject
					? 'Admin'
					: isSystemStep(approval.step.name)
						? 'System'
						: approval.step.role.name,
			username:
				isBypass || isAdminReject
					? approval.user?.username || 'Admin'
					: isSystemStep(approval.step.name)
						? 'System'
						: approval.user?.username || 'System',
		}
	})

	return json({
		general: generalInfo,
		professional: professionalInfo,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		status: participant.status,
		isFocal,
		nextStep: {
			name: participant.step.name,
			action: participant.step.action,
			roleName:
				participant.step.role.name === 'reviewer'
					? 'Focal Person'
					: participant.step.role.name,
		},
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params
	invariantResponse(participantId, 'Participant not found', { status: 404 })

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')
	switch (intent) {
		case 'delete': {
			return deleteParticipantAction({
				request,
				participantId,
				formData,
				userId: user.id,
			})
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

async function deleteParticipantAction({
	participantId,
	userId,
}: ParticipantActionArgs) {
	// SECURITY: Verify ownership before deletion to prevent IDOR attacks
	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: { userId: true },
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })
	invariantResponse(
		participant.userId === userId,
		'Unauthorized - you can only delete your own participants',
		{ status: 403 },
	)

	await prisma.participant.delete({
		where: { id: participantId },
	})

	return redirectWithToast(`/requests`, {
		type: 'success',
		title: `Participant Deleted`,
		description: `Participant deleted successfully.`,
	})
}

// Format action to past tense for completed actions
function formatActionPastTense(action: string): string {
	const actionMap: Record<string, string> = {
		APPROVE: 'Approved',
		REJECT: 'Rejected',
		BYPASS: 'Bypassed',
		NOTIFY: 'Notified',
		PRINT: 'Printed',
		ARCHIVE: 'Archived',
		CANCEL: 'Cancelled',
	}
	return actionMap[action] || action
}

// Format role name to user-friendly label (hides actual user identity)
function formatRoleName(roleName: string): string {
	const roleMap: Record<string, string> = {
		reviewer: 'Focal Person',
		validator: 'Validator',
		printer: 'Printer',
		admin: 'Administrator',
		Admin: 'Administrator',
		System: 'System',
	}
	return roleMap[roleName] || roleName
}

export default function ParticipantProfile() {
	const {
		general,
		professional,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		status,
		isFocal,
		nextStep,
	} = useLoaderData<typeof loader>()

	const photoLink = getParticipantDocumentFileSrc(photo?.id ?? '')
	const passportLink = getParticipantDocumentFileSrc(passport?.id ?? '')
	const letterLink = getParticipantDocumentFileSrc(letter?.id ?? '')
	const user = useOptionalUser()

	const documents = [
		{
			type: 'PHOTO',
			label: 'Photo',
			icon: FileImage,
			link: photoLink,
			doc: photo,
			color: 'bg-violet-500',
		},
		{
			type: 'PASSPORT',
			label: 'Passport',
			icon: FileText,
			link: passportLink,
			doc: passport,
			color: 'bg-blue-500',
		},
		{
			type: 'LETTER',
			label: 'Letter',
			icon: FileCheck,
			link: letterLink,
			doc: letter,
			color: 'bg-emerald-500',
		},
	]

	// Check if the most recent approval is a rejection
	const lastApproval = approvals?.[approvals.length - 1]
	const isRejected = status === 'REJECTED' && lastApproval?.result === 'FAILURE'

	return (
		<div>
			{/* Outlet for dialogs */}
			<Outlet />

			{/* Rejection Alert */}
			{isRejected && (
				<Alert variant="destructive" className="mb-4">
					<AlertTitle>Request Rejected</AlertTitle>
					<AlertDescription>
						{(lastApproval?.remarks ?? '').replace(/^Request Rejected:\s*/, '')}
					</AlertDescription>
				</Alert>
			)}

			{/* Header Card */}
			<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-400 via-green-400 to-teal-400 p-[1px] shadow-sm">
				<div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-green-400 to-teal-400 opacity-10 blur-xl" />
				<div className="relative rounded-[10px] bg-white/95 backdrop-blur-sm">
					<div className="absolute right-0 top-0 h-40 w-40 -translate-y-10 translate-x-10 rounded-full bg-gradient-to-br from-emerald-200/40 to-green-200/40 blur-2xl" />
					<div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-10 translate-y-10 rounded-full bg-gradient-to-tr from-green-200/40 to-teal-200/40 blur-2xl" />

					<div className="relative p-6">
						<div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-4">
								<div className="relative">
									<div className="absolute -inset-1 rounded-full bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 opacity-75 blur-sm" />
									<Avatar className="relative h-20 w-20 ring-4 ring-white">
										<AvatarImage src={photoLink} alt={general.firstName} />
										<AvatarFallback className="bg-gradient-to-br from-emerald-100 to-green-100 text-xl font-semibold text-green-700">
											{general.firstName[0]}
											{general.familyName[0]}
										</AvatarFallback>
									</Avatar>
								</div>
								<div>
									<h1 className="text-2xl font-bold text-slate-800">
										{general.title} {general.firstName} {general.familyName}
									</h1>
									<p className="font-medium text-slate-600">
										{professional.jobTitle}
									</p>
									<p className="text-sm text-slate-500">
										{professional.organization}
									</p>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="flex flex-wrap items-center gap-2">
								<Button
									size="sm"
									variant="outline"
									className="border-slate-300 hover:bg-slate-100"
									asChild
								>
									<Link to="/requests">
										<ArrowLeft className="mr-2 h-4 w-4" />
										Back
									</Link>
								</Button>
								{userHasPermission(user, 'update:participant:own') &&
									status === 'REJECTED' && (
										<Button size="sm" variant="default" asChild>
											<Link to={`/requests/${general.id}/edit`}>
												<Pencil className="mr-1.5 h-4 w-4" />
												Edit
											</Link>
										</Button>
									)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Info Grid */}
			<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<InfoCard
					icon={User}
					label="Personal"
					items={[
						{ label: 'Gender', value: general.gender },
						{ label: 'Date of Birth', value: general.dateOfBirth },
						{ label: 'Nationality', value: general.nationality },
					]}
				/>
				<InfoCard
					icon={Briefcase}
					label="Professional"
					items={[
						{ label: 'Organization', value: professional.organization },
						{ label: 'Job Title', value: professional.jobTitle },
						{ label: 'City', value: professional.city },
					]}
				/>
				<InfoCard
					icon={Globe}
					label="Contact"
					items={[
						{ label: 'Email', value: professional.email ?? 'N/A' },
						{ label: 'Phone', value: professional.telephone ?? 'N/A' },
						{ label: 'Country', value: professional.country },
					]}
				/>
				<InfoCard
					icon={FileText}
					label="Passport"
					items={[
						{ label: 'Number', value: general.passportNumber ?? 'N/A' },
						{
							label: 'Expiry',
							value: general.passportExpiry
								? format(new Date(general.passportExpiry), 'PP')
								: 'N/A',
						},
						{
							label: 'Language',
							value: professional.preferredLanguage ?? 'N/A',
						},
					]}
				/>
			</div>

			{/* Documents and Meetings Row */}
			<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
				{/* Documents Card */}
				<Card>
					<CardContent className="p-4">
						<div className="mb-3 flex items-center gap-2">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
								<FileImage className="h-4 w-4 text-slate-600" />
							</div>
							<span className="font-semibold text-slate-700">Documents</span>
						</div>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
							{documents.map(
								({ type, label, icon: Icon, link, doc, color }) => (
									<div key={type}>
										{doc ? (
											<DocumentPreview
												title={`${general.firstName} ${general.familyName} - ${label}`}
												documentUrl={link}
												contentType={doc.contentType}
												onDownload={() => {
													const downloadLink = document.createElement('a')
													downloadLink.href = link
													downloadLink.download = `${label.toLowerCase()}.${doc.contentType.split('/')[1] || 'file'}`
													downloadLink.click()
												}}
												type={label}
												icon={Icon}
												color={color}
											/>
										) : (
											<div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-3 py-2 text-slate-400">
												<div
													className={`flex h-8 w-8 items-center justify-center rounded-lg ${color} opacity-30`}
												>
													<Icon className="h-4 w-4 text-white" />
												</div>
												<div>
													<p className="text-sm font-medium">{label}</p>
													<p className="text-xs">Not uploaded</p>
												</div>
											</div>
										)}
									</div>
								),
							)}
						</div>
					</CardContent>
				</Card>

				{/* Accreditation Details Card */}
				<Card>
					<CardContent className="p-4">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
									<Calendar className="h-4 w-4 text-slate-600" />
								</div>
								<span className="font-semibold text-slate-700">
									Accreditation Details
								</span>
							</div>
							{isFocal && (
								<Button
									size="sm"
									variant="outline"
									className="h-7 px-2 text-xs"
									asChild
								>
									<Link to={`/requests/${general.id}/edit-details`}>
										<Pencil className="mr-1 h-3 w-3" />
										Edit
									</Link>
								</Button>
							)}
						</div>
						<div className="space-y-2">
							<div className="flex justify-between text-sm">
								<span className="text-slate-500">Participant Type</span>
								<Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
									{general.participantType}
								</Badge>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-slate-500">Meetings</span>
								{meetings && meetings.length > 0 ? (
									<span className="font-medium text-slate-700">
										{meetings.map(m => m.name).join(', ')}
									</span>
								) : (
									<span className="text-slate-400">None selected</span>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Approval History */}
			<div className="mt-6">
				<h2 className="mb-4 text-lg font-semibold text-slate-800">
					Request History
				</h2>
				<Card>
					<CardContent className="p-4">
						{approvals && approvals.length > 0 ? (
							<div className="space-y-2">
								{approvals.slice(0, 5).map(approval => (
									<div
										key={approval.id}
										className="flex items-center justify-between rounded-lg border bg-white p-3 text-sm shadow-sm"
									>
										<div className="flex items-center gap-3">
											{approval.result === 'SUCCESS' && (
												<CheckCircleIcon className="h-5 w-5 text-emerald-500" />
											)}
											{approval.result === 'FAILURE' && (
												<XCircleIcon className="h-5 w-5 text-red-500" />
											)}
											{approval.result === 'SKIPPED' && (
												<SkipForwardIcon className="h-5 w-5 text-amber-500" />
											)}
											<div>
												<span className="font-medium text-slate-800">
													{approval.stepName}
												</span>
												<span className="ml-2 text-slate-500">
													({formatActionPastTense(approval.stepAction)})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-slate-500">
											<div className="font-medium">
												{formatRoleName(approval.roleName)}
											</div>
											<div>
												{format(new Date(approval.createdAt), 'MMM d, HH:mm')}
											</div>
										</div>
									</div>
								))}

								{approvals.length > 5 && (
									<p className="pt-2 text-center text-sm text-slate-500">
										+{approvals.length - 5} more entries
									</p>
								)}

								{/* Next Step */}
								{status === 'INPROGRESS' && (
									<div className="mt-4 flex items-center justify-between rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-3 text-sm">
										<div className="flex items-center gap-3">
											<CircleDashedIcon className="h-5 w-5 text-blue-500" />
											<div>
												<span className="font-medium text-blue-700">
													{nextStep.name}
												</span>
												<span className="ml-2 text-blue-500">
													({nextStep.action})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-blue-600">
											<div className="font-medium">PENDING</div>
											<div>Waiting: {nextStep.roleName}</div>
										</div>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-2">
								<p className="text-sm text-slate-500">No history yet</p>
								{status === 'INPROGRESS' && (
									<div className="flex items-center justify-between rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-3 text-sm">
										<div className="flex items-center gap-3">
											<CircleDashedIcon className="h-5 w-5 text-blue-500" />
											<div>
												<span className="font-medium text-blue-700">
													{nextStep.name}
												</span>
												<span className="ml-2 text-blue-500">
													({nextStep.action})
												</span>
											</div>
										</div>
										<div className="text-right text-xs text-blue-600">
											<div className="font-medium">PENDING</div>
											<div>Waiting: {nextStep.roleName}</div>
										</div>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

function InfoCard({
	icon: Icon,
	label,
	items,
}: {
	icon: React.ElementType
	label: string
	items: { label: string; value: string }[]
}) {
	return (
		<Card className="transition-shadow hover:shadow-md">
			<CardContent className="p-4">
				<div className="mb-3 flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
						<Icon className="h-4 w-4 text-slate-600" />
					</div>
					<span className="font-semibold text-slate-700">{label}</span>
				</div>
				<div className="space-y-2">
					{items.map(item => (
						<div key={item.label} className="flex justify-between text-sm">
							<span className="text-slate-500">{item.label}</span>
							<span className="font-medium text-slate-700">{item.value}</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	)
}
