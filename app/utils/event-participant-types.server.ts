// The participant types someone can register as for an event: the ones the
// admin's event setup picked that also have a workflow. A type that is listed
// but not set up yet is left out rather than failing when the form is submitted.

import { type Prisma } from '@prisma/client'
import { prisma } from '~/utils/db.server'

export function registrableTypeWhere(
	eventId: string,
): Prisma.ParticipantTypeWhereInput {
	return {
		events: { some: { eventId } },
		workflows: { some: { eventId } },
	}
}

export async function isRegistrableType(
	eventId: string,
	participantTypeId: string,
) {
	const type = await prisma.participantType.findFirst({
		where: { id: participantTypeId, ...registrableTypeWhere(eventId) },
		select: { id: true },
	})
	return type !== null
}

export const NOT_REGISTRABLE_MESSAGE =
	'This participant type is not open for registration at this event.'
