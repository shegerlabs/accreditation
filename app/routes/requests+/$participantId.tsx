import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'
import {
	ArrowLeft,
	Briefcase,
	Calendar,
	CalendarCheck2,
	FileImageIcon,
	Flag,
	Globe,
	Mail,
	MapPin,
	PaperclipIcon,
	Pencil,
	Phone,
	Users,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
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
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: {
			documents: true,
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
					createdAt: 'desc',
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

	const generalInfo = {
		id: participant.id,
		tenantId: participant.tenantId,
		eventId: participant.eventId,
		participantTypeId: participant.participantTypeId,
		participantType: participant.participantType.name,
		gender: participant.gender,
		title: participant.title,
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

	const wishlistInfo = {
		needsVisa: participant.needsVisa,
		needsCarPass: participant.needsCarPass,
		vehicleType: participant.vehicleType,
		vehiclePlateNumber: participant.vehiclePlateNumber,
		needsCarFromOrganizer: participant.needsCarFromOrganizer,
		flightNumber: participant.flightNumber,
		arrivalDate: participant.arrivalDate,
		meetings: participant.wishList?.split(','),
	}

	const photo = participant?.documents.find(doc => doc.documentType === 'PHOTO')
	const passport = participant?.documents.find(
		doc => doc.documentType === 'PASSPORT',
	)
	const letter = participant?.documents.find(
		doc => doc.documentType === 'LETTER',
	)

	const approvals = participant?.approvals.map(approval => ({
		id: approval.id,
		result: approval.result,
		remarks: approval.remarks,
	}))

	const step =
		participant?.step.role.name === 'reviewer'
			? 'focal person'
			: participant?.step.role.name

	return json({
		general: generalInfo,
		professional: professionalInfo,
		wishlist: wishlistInfo,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		status: participant.status,
		step,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['user', 'focal'])
	const { participantId } = params
	invariantResponse(participantId, 'Participant not found', { status: 404 })

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')
	switch (intent) {
		case 'delete': {
			return deleteParticipantAction({ request, participantId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

async function deleteParticipantAction({
	participantId,
}: ParticipantActionArgs) {
	await prisma.participant.delete({
		where: { id: participantId },
	})

	return redirectWithToast(`/requests`, {
		type: 'success',
		title: `Participant Deleted`,
		description: `Participant deleted successfully.`,
	})
}

export default function ParticipantProfile() {
	const {
		general,
		professional,
		wishlist,
		photo,
		passport,
		letter,
		meetings,
		approvals,
		status,
		step,
	} = useLoaderData<typeof loader>()

	const photoLink = getParticipantDocumentFileSrc(photo?.id ?? '')
	const passportLink = getParticipantDocumentFileSrc(passport?.id ?? '')
	const letterLink = getParticipantDocumentFileSrc(letter?.id ?? '')
	const user = useOptionalUser()

	return (
		<div className="container mx-auto px-4">
			{approvals?.[0]?.result === 'FAILURE' && (
				<Alert variant="destructive">
					<AlertTitle>Request Rejected</AlertTitle>
					<AlertDescription>
						{(approvals[0].remarks ?? '').replace(/^Request Rejected:\s*/, '')}
					</AlertDescription>
				</Alert>
			)}
			<div className="px-4 py-8 sm:px-4 lg:px-4">
				<div className="mb-6 flex flex-col sm:flex-row sm:items-center">
					<Avatar className="h-24 w-24 ring-4 ring-gray-200 sm:h-32 sm:w-32">
						<AvatarImage src={photoLink} alt={general.firstName} />
						<AvatarFallback>RC</AvatarFallback>
					</Avatar>
					<div className="mt-4 flex-grow sm:ml-6 sm:mt-0">
						<h1 className="text-3xl font-bold text-gray-900">
							{general.firstName} {general.familyName} ({general.title})
						</h1>
						<p className="text-xl text-gray-600">{professional.jobTitle}</p>
					</div>
					<div className="mt-4 flex space-x-2 sm:mt-0">
						{userHasPermission(user, 'update:participant:own') &&
							status === 'REJECTED' && (
								<Button size="sm" variant="outline" asChild>
									<Link to={`/requests/${general.id}/edit`}>
										<Pencil className="h-4 w-4" />
									</Link>
								</Button>
							)}
						<Button size="sm" variant="outline" asChild>
							<Link to={`/requests`}>
								<ArrowLeft className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
					<Card className="col-span-2">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-lg font-semibold">
								Participant Details
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-4">
									<InfoItem
										icon={<Briefcase aria-hidden="true" />}
										label="Gender"
										value={general.gender}
									/>
									<InfoItem
										icon={<Users aria-hidden="true" />}
										label="Organization"
										value={professional.organization}
									/>
									<InfoItem
										icon={<MapPin aria-hidden="true" />}
										label="City"
										value={professional.city}
									/>
									<InfoItem
										icon={<Flag aria-hidden="true" />}
										label="Country"
										value={professional.country}
									/>
									<InfoItem
										icon={<Globe aria-hidden="true" />}
										label="Nationality"
										value={general.nationality}
									/>
									<InfoItem
										icon={<Calendar aria-hidden="true" />}
										label="Date of Birth"
										value={general.dateOfBirth}
									/>
								</div>
								<div className="space-y-4">
									<InfoItem
										icon={<Mail aria-hidden="true" />}
										label="Email"
										value={professional.email}
									/>
									<InfoItem
										icon={<Phone aria-hidden="true" />}
										label="Telephone"
										value={professional.telephone ?? 'N/A'}
									/>
									<InfoItem
										icon={<Globe aria-hidden="true" />}
										label="Preferred Language"
										value={professional.preferredLanguage ?? 'N/A'}
									/>
									<InfoItem
										icon={<FileImageIcon aria-hidden="true" />}
										label="Passport Number"
										value={general.passportNumber ?? 'N/A'}
									/>
									<InfoItem
										icon={<CalendarCheck2 aria-hidden="true" />}
										label="Passport Expiry"
										value={
											general.passportExpiry
												? format(new Date(general.passportExpiry), 'PP')
												: 'N/A'
										}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="space-y-6">
						{/* <Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-lg font-semibold">
									Current Status
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex w-full">
									<span className="inline-flex w-full items-center justify-center rounded-full bg-emerald-50 px-4 py-2 text-lg font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
										{step}
									</span>
								</div>
							</CardContent>
						</Card> */}
						<Card>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-lg font-semibold">
									Documents
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								{[
									{ type: 'PHOTO', link: photoLink, doc: photo },
									{ type: 'PASSPORT', link: passportLink, doc: passport },
									{ type: 'LETTER', link: letterLink, doc: letter },
								].map(({ type, link, doc }) => (
									<div key={type} className="flex-1">
										{doc ? (
											<a
												href={link}
												className="flex items-center gap-2 space-x-2 font-medium text-green-600 hover:text-green-500"
											>
												<PaperclipIcon className="h-4 w-4" />
												{type}
											</a>
										) : (
											<div className="flex items-center gap-2 space-x-2 font-medium text-gray-400">
												<PaperclipIcon className="h-4 w-4" />
												<span>{type} (Missing)</span>
											</div>
										)}
									</div>
								))}
								<div>
									<h3 className="text-lg font-medium text-gray-900">
										Wishes to Participate
									</h3>
									<ul className="list-disc pl-5">
										{meetings?.map(meeting => (
											<li key={meeting.id}>{meeting.name}</li>
										))}
									</ul>
								</div>
								<div>
									<h3 className="text-lg font-medium text-gray-900">
										Participant Type
									</h3>

									<ul className="list-disc pl-5">
										<li>{general.participantType}</li>
									</ul>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	)
}

function InfoItem({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode
	label: string
	value: string
}) {
	return (
		<div className="flex items-center space-x-2">
			<div className="flex-shrink-0 text-gray-400">{icon}</div>
			<div>
				<dt className="text-sm font-medium text-gray-500">{label}</dt>
				<dd className="mt-1 text-sm text-gray-900">{value}</dd>
			</div>
		</div>
	)
}
