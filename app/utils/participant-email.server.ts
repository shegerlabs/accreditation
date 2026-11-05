// Shared by the admin and the portal: keep this file identical in both repos.
import { prisma } from './db.server'
import { sendEmailAzure } from './email.server'
import {
	buildEmailHtml,
	buildEmailVariables,
	EMAIL_TEMPLATE_DEFAULTS,
	renderTemplate,
	type EmailTrigger,
} from './participant-email'

export async function getEffectiveTemplate(eventId: string, trigger: EmailTrigger) {
	const custom = await prisma.emailTemplate.findUnique({
		where: { eventId_trigger: { eventId, trigger } },
		select: { subject: true, body: true, enabled: true },
	})
	if (custom) return { ...custom, isCustom: true }
	const { subject, body, enabled } = EMAIL_TEMPLATE_DEFAULTS[trigger]
	return { subject, body, enabled, isCustom: false }
}

// Participant first, then the account that registered them (the focal point,
// or the participant themselves). Duplicates are dropped case-insensitively.
function getRecipients(...emails: Array<string | null | undefined>) {
	const seen = new Set<string>()
	const recipients: string[] = []
	for (const email of emails) {
		const trimmed = email?.trim()
		if (!trimmed || seen.has(trimmed.toLowerCase())) continue
		seen.add(trimmed.toLowerCase())
		recipients.push(trimmed)
	}
	return recipients
}

function describeError(error: unknown) {
	const text =
		error instanceof Error
			? error.message
			: typeof error === 'string'
				? error
				: JSON.stringify(error)
	return (text || 'Unknown error').slice(0, 1000)
}

// Sending waits on Azure for 10s or more, so it runs after the response.
// The log row records the outcome either way.
async function deliver(logId: string, to: string, subject: string, body: string) {
	let update: { status: 'SENT'; sentAt: Date; error: null } | { status: 'FAILED'; error: string }
	try {
		const result = await sendEmailAzure({
			to,
			subject,
			plainText: body,
			html: buildEmailHtml(subject, body),
		})
		update =
			result.status === 'success'
				? { status: 'SENT', sentAt: new Date(), error: null }
				: { status: 'FAILED', error: describeError(result.error) }
	} catch (error) {
		update = { status: 'FAILED', error: describeError(error) }
	}
	await prisma.emailLog
		.update({ where: { id: logId }, data: update })
		.catch(error => console.error(`[email] could not update email log ${logId}`, error))
}

/**
 * Emails the participant and their focal point using the event's template for
 * `trigger`. Never throws: a failed email must not undo a workflow action.
 */
export async function sendParticipantEmail(options: {
	participantId: string
	trigger: EmailTrigger
	remarks?: string
	triggeredById?: string
	portalUrl?: string
}) {
	const { participantId, trigger, remarks, triggeredById } = options
	try {
		const participant = await prisma.participant.findUnique({
			where: { id: participantId },
			select: {
				id: true,
				eventId: true,
				firstName: true,
				familyName: true,
				registrationCode: true,
				organization: true,
				email: true,
				user: { select: { email: true } },
				title: { select: { name: true } },
				event: { select: { name: true } },
				participantType: { select: { name: true } },
			},
		})
		if (!participant) return

		const template = await getEffectiveTemplate(participant.eventId, trigger)
		if (!template.enabled) return

		const recipients = getRecipients(participant.email, participant.user.email)
		if (recipients.length === 0) return

		const variables = buildEmailVariables(participant, {
			portalUrl: options.portalUrl ?? process.env.USER_PORTAL_URL ?? '',
			remarks,
		})
		const subject = renderTemplate(template.subject, variables)
		const body = renderTemplate(template.body, variables)

		for (const recipient of recipients) {
			const log = await prisma.emailLog.create({
				data: { participantId, trigger, recipient, subject, body, triggeredById },
				select: { id: true },
			})
			void deliver(log.id, recipient, subject, body)
		}
	} catch (error) {
		console.error(`[email] ${trigger} email for participant ${participantId} failed`, error)
	}
}

// Sends the exact subject and body of an earlier email again, as a new log row.
export async function resendEmail(emailLogId: string, triggeredById: string) {
	const original = await prisma.emailLog.findUniqueOrThrow({
		where: { id: emailLogId },
		select: { participantId: true, trigger: true, recipient: true, subject: true, body: true },
	})
	const log = await prisma.emailLog.create({
		data: { ...original, triggeredById },
		select: { id: true },
	})
	void deliver(log.id, original.recipient, original.subject, original.body)
	return original
}

// For the admin's "send test" button. Awaited, and not logged against a participant.
export async function sendTestEmail(to: string, subject: string, body: string) {
	return sendEmailAzure({ to, subject, plainText: body, html: buildEmailHtml(subject, body) })
}
