import { Action, Participant, ParticipantType, Step } from '@prisma/client'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from './email.server'

export async function processParticipant(
	participantId: string,
	userId: string,
	action: Action,
	remarks?: string,
) {
	const participant = await prisma.participant.findUniqueOrThrow({
		where: { id: participantId },
		include: {
			step: true,
			participantType: true,
		},
	})

	await logApproval(participant, userId, action, remarks)

	switch (action) {
		case Action.REJECT:
			await handleRejection(participant, userId)
			break
		case Action.APPROVE:
			await handleApproval(participant)
			break
		case Action.PRINT:
			await handlePrint(participant)
			break
		case Action.NOTIFY:
			await handleNotify(participant)
			break
		case Action.ARCHIVE:
			await handleArchive(participant)
			break
		default:
			throw new Error(`Unsupported action: ${action}`)
	}
}

async function logApproval(
	participant: Participant & { step: Step },
	userId: string,
	action: Action,
	remarks?: string,
) {
	await prisma.approval.create({
		data: {
			participantId: participant.id,
			stepId: participant.step.id,
			userId: userId,
			result: action === Action.REJECT ? 'FAILURE' : 'SUCCESS',
			remarks: remarks ?? getRemarksByAction(action),
		},
	})
}

async function handleRejection(
	participant: Participant & { step: Step },
	userId: string,
) {
	const mofaApprovalStep = await prisma.step.findFirst({
		where: {
			workflowId: participant.step.workflowId,
			name: 'MOFA Approval',
			action: Action.APPROVE,
		},
	})

	if (!mofaApprovalStep) return

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: mofaApprovalStep.id,
			status: 'REJECTED',
		},
	})

	await sendRejectionEmail(participant.email)
}

async function handleApproval(
	participant: Participant & { step: Step; participantType: ParticipantType },
) {
	const nextStepId = await determineNextStep(participant)
	if (!nextStepId) return

	await updateParticipantStatus(participant.id, nextStepId)
}

async function determineNextStep(
	participant: Participant & { step: Step; participantType: ParticipantType },
): Promise<string | null> {
	if (
		participant.participantType.name === 'Press / Media' &&
		participant.step.name === 'Review Request'
	) {
		const etBroadcastStep = await prisma.step.findFirst({
			where: { name: 'ET Broadcast Approval' },
		})
		return etBroadcastStep?.id ?? null
	}

	return participant.step.nextStepId ?? null
}

async function updateParticipantStatus(participantId: string, stepId: string) {
	await prisma.participant.update({
		where: { id: participantId },
		data: {
			stepId,
			status: 'INPROGRESS',
		},
	})
}

async function handlePrint(participant: Participant & { step: Step }) {
	if (!participant.step.nextStepId) return

	const nextStep = await prisma.step.findUniqueOrThrow({
		where: { id: participant.step.nextStepId },
	})

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: nextStep.id,
			status: 'PRINTED',
		},
	})
}

async function handleNotify(participant: Participant & { step: Step }) {
	if (!participant.step.nextStepId) return

	const nextStep = await prisma.step.findUniqueOrThrow({
		where: { id: participant.step.nextStepId },
	})

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: nextStep.id,
			status: 'NOTIFIED',
		},
	})
}

async function handleArchive(participant: Participant & { step: Step }) {
	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			status: 'ARCHIVED',
		},
	})

	await sendApprovalEmail(participant.email)
}

function getRemarksByAction(action: Action): string {
	switch (action) {
		case Action.APPROVE:
			return 'Approved successfully.'
		case Action.REJECT:
			return 'Rejected due to compliance issues.'
		case Action.PRINT:
			return 'Printed successfully.'
		case Action.NOTIFY:
			return 'Notification sent successfully.'
		case Action.ARCHIVE:
			return 'Archived successfully.'
		default:
			return 'Action processed.'
	}
}

async function sendRejectionEmail(email: string) {
	void sendEmailAzure({
		to: email,
		subject: 'Request Rejected',
		plainText: 'Your request has been rejected.',
		html: '<p>Your request has been rejected.</p>',
	})
}

async function sendApprovalEmail(email: string) {
	void sendEmailAzure({
		to: email,
		subject: 'Request Finalized',
		plainText: 'Your request has been finalized.',
		html: '<p>Your request has been finalized. You can collect your badge at the registration desk.</p>',
	})
}
