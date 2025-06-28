import React from 'react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '~/components/ui/accordion'
import { Badge } from '~/components/ui/badge'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'

// const invitations = await prisma.invitation.groupBy({
// 	by: ['eventId'], // Grouping by eventId
// 	where: {
// 		email: user.email,
// 	},
// 	_count: {
// 		id: true, // Example: Count of invitation IDs
// 	},
// })

// // Fetching detailed data with event name
// const detailedData = await Promise.all(
// 	invitations.map(async group => {
// 		const relatedInvitations = await prisma.invitation.findMany({
// 			where: {
// 				eventId: group.eventId,
// 				email: user.email,
// 			},
// 			include: {
// 				participantType: true,
// 				participants: {
// 					include: {
// 						participantType: true,
// 					},
// 				},
// 				restriction: {
// 					include: {
// 						constraints: {
// 							include: {
// 								participantType: {
// 									include: {
// 										participants: true,
// 									},
// 								},
// 							},
// 						},
// 					},
// 				},
// 			},
// 			orderBy: {
// 				participants: {
// 					_count: 'desc',
// 				},
// 			},
// 		})

// 		// Fetch the event name
// 		const event = await prisma.event.findUnique({
// 			where: { id: group.eventId },
// 			select: { name: true }, // Only fetching the event name
// 		})

// 		return {
// 			eventId: group.eventId,
// 			eventName: event?.name ?? 'Unknown Event', // Include event name
// 			invitations: relatedInvitations,
// 		}
// 	}),
// )

interface Constraint {
	name: string
	accessLevel: string
	quota: number
	participantType: {
		name: string
	}
}

interface Participant {
	firstName: string
	familyName: string
	email: string
	organization: string
	jobTitle: string
	participantType: {
		name: string
	}
}

interface Invitation {
	organization: string
	email: string
	participantType: {
		name: string
	}
	participants: Participant[]
	restriction: {
		name: string
		constraints: Constraint[]
	}
}

interface EventData {
	eventId: string
	eventName: string
	invitations: Invitation[]
}

const formatDate = (date: Date) => {
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZoneName: 'short',
	}).format(date)
}

const ParticipantCard: React.FC<{ participant: Participant }> = ({
	participant,
}) => (
	<Card className="mb-4">
		<CardHeader>
			<CardTitle>
				{participant.firstName} {participant.familyName}
			</CardTitle>
			<CardDescription>{participant.email}</CardDescription>
		</CardHeader>
		<CardContent>
			<p>
				<strong>Organization:</strong> {participant.organization}
			</p>
			<p>
				<strong>Job Title:</strong> {participant.jobTitle}
			</p>
			<p>
				<strong>Participant Type:</strong> {participant.participantType.name}
			</p>
		</CardContent>
	</Card>
)

const ConstraintItem: React.FC<{ constraint: Constraint }> = ({
	constraint,
}) => (
	<div className="mb-2">
		<p>
			<strong>{constraint.name}</strong>
		</p>
		<p>
			Access Level: <Badge>{constraint.accessLevel}</Badge>
		</p>
		<p>Quota: {constraint.quota}</p>
		<p>Participant Type: {constraint.participantType.name}</p>
	</div>
)

const InvitationCard: React.FC<{ invitation: Invitation }> = ({
	invitation,
}) => (
	<Card className="mb-6">
		<CardHeader>
			<CardTitle>{invitation.organization}</CardTitle>
		</CardHeader>
		<CardContent>
			<p>
				<strong>Participant Type:</strong> {invitation.participantType.name}
			</p>
			<Accordion type="single" collapsible className="w-full">
				<AccordionItem value="participants">
					<AccordionTrigger>
						Participants ({invitation.participants.length})
					</AccordionTrigger>
					<AccordionContent>
						{invitation.participants.map((participant, index) => (
							<ParticipantCard key={index} participant={participant} />
						))}
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="restrictions">
					<AccordionTrigger>Restrictions</AccordionTrigger>
					<AccordionContent>
						<p>
							<strong>{invitation.restriction.name}</strong>
						</p>
						<Accordion type="single" collapsible className="w-full">
							<AccordionItem value="constraints">
								<AccordionTrigger>
									Constraints ({invitation.restriction.constraints.length})
								</AccordionTrigger>
								<AccordionContent>
									{invitation.restriction.constraints.map(
										(constraint, index) => (
											<ConstraintItem key={index} constraint={constraint} />
										),
									)}
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</CardContent>
	</Card>
)

const Invitations: React.FC<{ data: EventData[] }> = ({ data }) => {
	return (
		<div className="container mx-auto p-4">
			{data.map(event => (
				<Card key={event.eventId} className="mb-8">
					<CardHeader>
						<CardTitle>{event.eventName}</CardTitle>
					</CardHeader>
					<CardContent>
						<h3 className="mb-4 text-lg font-semibold">
							Invitations ({event.invitations.length})
						</h3>
						{event.invitations.map((invitation, index) => (
							<InvitationCard key={index} invitation={invitation} />
						))}
					</CardContent>
				</Card>
			))}
		</div>
	)
}

export default Invitations
