import { EmailClient, KnownEmailSendStatus } from '@azure/communication-email'
import { getErrorMessage } from './misc'

export async function sendEmail(options: {
	to: string
	subject: string
	text: string
	html?: string
}) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const email = {
		from: 'noreply@accreditation.com',
		...options,
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		body: JSON.stringify(email),
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'content-type': 'application/json',
		},
	})

	const data = await response.json()

	if (response.ok) {
		return { status: 'success' } as const
	} else {
		return { status: 'error', error: getErrorMessage(data) } as const
	}
}

export async function sendEmailAzure(options: {
	to: string
	subject: string
	plainText: string
	html?: string
}) {
	const { to, subject, plainText, html } = options
	const POLLER_WAIT_TIME = 10
	const message = {
		senderAddress: 'DoNotReply@accreditation.africanunion.org',
		recipients: {
			to: [{ address: to }],
		},
		content: {
			subject,
			plainText,
			html,
		},
	}

	try {
		const client = new EmailClient(process.env.EMAIL_CONNECTION_STRING || '')
		const poller = await client.beginSend(message)

		if (!poller.getOperationState().isStarted) {
			throw 'Poller was not started.'
		}

		let timeElapsed = 0
		while (!poller.isDone()) {
			poller.poll()

			await new Promise(resolve => setTimeout(resolve, POLLER_WAIT_TIME * 1000))
			timeElapsed += 10

			if (timeElapsed > 18 * POLLER_WAIT_TIME) {
				throw 'Polling timed out.'
			}
		}

		if (poller.getResult()?.status === KnownEmailSendStatus.Succeeded) {
			return { status: 'success' } as const
		} else {
			return { status: 'error', error: poller.getResult()?.error } as const
		}
	} catch (error) {
		return { status: 'error', error } as const
	}
}
