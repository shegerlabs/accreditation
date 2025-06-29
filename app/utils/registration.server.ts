import { customAlphabet } from 'nanoid'
import { prisma } from './db.server'
import { createWizard } from './wizard.server'

export const registrationWizard = createWizard({
	name: 'registration',
	routes: ['/requests/registration'],
	onStepChange: (_current, _next) => {},
	validateStep: (_data, _currentStep) => {
		return true
	},
})

const generateSuffix = customAlphabet('0123456789', 6)

export async function createRegistrationCode(
	eventId: string,
	participantTypeId: string,
): Promise<string> {
	const [event, participantType] = await Promise.all([
		prisma.event.findUnique({
			where: { id: eventId },
			select: { name: true, startDate: true },
		}),
		prisma.participantType.findUnique({
			where: { id: participantTypeId },
			select: { name: true },
		}),
	])

	const eventPrefix = event?.name.slice(0, 3).toUpperCase() || 'EVT'
	const typePrefix = participantType?.name.slice(0, 2).toUpperCase() || 'PT'
	const year = event?.startDate.getFullYear().toString().slice(-2)
	const randomSuffix = generateSuffix()

	return `${eventPrefix}-${typePrefix}-${year}-${randomSuffix}`
}
