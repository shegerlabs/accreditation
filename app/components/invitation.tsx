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

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface InvitationConstraint {
	id: string
	participantTypeId: string
	accessLevel: string
	quota: number | null
	participantType: {
		id: string
		name: string
	}
	participantCount: number
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
	participants: Participant[]
	invitationConstraints: InvitationConstraint[]
}

interface EventData {
	eventId: string
	eventName: string
	invitations: Invitation[]
}

// =============================================================================
// COMPONENTS
// =============================================================================

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

const InvitationConstraintItem: React.FC<{ constraint: InvitationConstraint }> = ({
	constraint,
}) => (
	<div className="mb-2">
		<p>
			<strong>{constraint.participantType.name}</strong>
		</p>
		<p>
			Access Level: <Badge>{constraint.accessLevel}</Badge>
		</p>
		<p>Quota: {constraint.quota === null ? 'Unlimited' : constraint.quota}</p>
		<p>Registered: {constraint.participantCount}</p>
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
				{invitation.invitationConstraints.length > 0 && (
					<AccordionItem value="constraints">
						<AccordionTrigger>
							Quotas ({invitation.invitationConstraints.length})
						</AccordionTrigger>
						<AccordionContent>
							{invitation.invitationConstraints.map((constraint, index) => (
								<InvitationConstraintItem key={index} constraint={constraint} />
							))}
						</AccordionContent>
					</AccordionItem>
				)}
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
