import { Action, AuditAction, AuditEntityType, Participant, Step } from '@prisma/client'
import { createAuditLog } from './audit.server'
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
		},
	})

	// Execute action first, then log approval only if successful
	switch (action) {
		case Action.REJECT:
			await handleRejection(participant, userId, remarks)
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
		case Action.BYPASS:
			await handleBypass(participant)
			break
		default:
			throw new Error(`Unsupported action: ${action}`)
	}

	// Log approval only after action succeeds
	await logApproval(participant, userId, action, remarks)

	// Create audit log for workflow action
	await createAuditLog({
		action: mapWorkflowActionToAuditAction(action),
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participantId,
		description: `Workflow action ${action} performed on participant`,
		userId,
		tenantId: participant.tenantId,
		metadata: {
			workflowAction: action,
			stepId: participant.stepId,
			stepName: participant.step.name,
			remarks,
		},
	})
}

function mapWorkflowActionToAuditAction(action: Action): AuditAction {
	switch (action) {
		case Action.APPROVE:
			return AuditAction.APPROVE
		case Action.REJECT:
			return AuditAction.REJECT
		case Action.PRINT:
			return AuditAction.PRINT
		case Action.BYPASS:
			return AuditAction.BYPASS
		default:
			return AuditAction.OTHER
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

async function handleBypass(participant: Participant & { step: Step }) {
	// Find step marked as bypass target (e.g., Badge Print step)
	const bypassTargetStep = await prisma.step.findFirst({
		where: {
			workflowId: participant.step.workflowId,
			isBypassTarget: true,
		},
	})

	if (!bypassTargetStep) {
		throw new Error(
			'No bypass target configured for this workflow. Please mark a step as the bypass target in workflow settings.',
		)
	}

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: bypassTargetStep.id,
			status: 'BYPASSED',
		},
	})
}

async function handleRejection(
	participant: Participant & { step: Step },
	userId: string,
	remarks?: string,
) {
	// Find step marked as rejection target (where rejected participants return)
	const rejectionTargetStep = await prisma.step.findFirst({
		where: {
			workflowId: participant.step.workflowId,
			isRejectionTarget: true,
		},
	})

	if (!rejectionTargetStep) {
		throw new Error(
			'No rejection target configured for this workflow. Please mark a step as the rejection target in workflow settings.',
		)
	}

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: rejectionTargetStep.id,
			status: 'REJECTED',
		},
	})

	// Only send email if participant has an email address
	if (participant.email) {
		await sendRejectionEmail(participant.email, remarks)
	}
}

async function handleApproval(participant: Participant & { step: Step }) {
	if (!participant.step.nextStepId) return

	const nextStep = await prisma.step.findUniqueOrThrow({
		where: { id: participant.step.nextStepId },
	})

	await prisma.participant.update({
		where: { id: participant.id },
		data: {
			stepId: nextStep.id,
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

	// Only send email if participant has an email address
	if (participant.email) {
		await sendFinalizationEmail(participant.email)
	}
}

function getRemarksByAction(action: Action): string {
	switch (action) {
		case Action.APPROVE:
			return 'Request approved and forwarded to next validation stage'
		case Action.REJECT:
			return 'Request rejected and returned to applicant for revision'
		case Action.PRINT:
			return 'Badge printed and ready for collection'
		case Action.NOTIFY:
			return 'Applicant notified of accreditation status'
		case Action.ARCHIVE:
			return 'Accreditation completed and archived'
		case Action.BYPASS:
			return 'Validation steps bypassed by administrator - sent directly to badge printing'
		default:
			return 'Action processed'
	}
}

async function sendRejectionEmail(email: string, remarks?: string) {
	void sendEmailAzure({
		to: email,
		subject: 'Request Rejected',
		plainText: 'Your request has been rejected.',
		html: `<p>Your request has been rejected. ${remarks ? `<br><br>${remarks}` : ''}</p>`,
	})
}

async function sendFinalizationEmail(email: string) {
	void sendEmailAzure({
		to: email,
		subject: 'Request Finalized',
		plainText: 'Your request has been finalized.',
		html: '<p>Your request has been finalized. You can collect your badge at the registration desk.</p>',
	})
}
