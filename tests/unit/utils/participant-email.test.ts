import { describe, expect, it } from 'vitest'
import {
	buildEmailHtml,
	buildEmailVariables,
	EMAIL_PLACEHOLDERS,
	EMAIL_TEMPLATE_DEFAULTS,
	EMAIL_TRIGGERS,
	findUnknownPlaceholders,
	renderTemplate,
	SAMPLE_EMAIL_VARIABLES,
} from '~/utils/participant-email'

const participant = {
	id: 'p1',
	firstName: 'Amina',
	familyName: 'Mensah',
	registrationCode: 'PAP-1',
	organization: 'MFA',
	title: { name: 'Dr.' },
	event: { name: 'PAP Summit' },
	participantType: { name: 'Delegate' },
}

describe('buildEmailVariables', () => {
	it('builds portal links without doubling a trailing slash', () => {
		const vars = buildEmailVariables(participant, { portalUrl: 'https://portal.example/' })
		expect(vars.lookupLink).toBe('https://portal.example/requests/p1')
		expect(vars.editLink).toBe('https://portal.example/requests/p1/edit')
	})

	it('includes the title in the full name', () => {
		const vars = buildEmailVariables(participant, { portalUrl: 'https://x' })
		expect(vars.fullName).toBe('Dr. Amina Mensah')
	})

	it('falls back to a generic reason when none is given', () => {
		const vars = buildEmailVariables(participant, { portalUrl: 'https://x', remarks: '  ' })
		expect(vars.remarks).toMatch(/No specific reason/)
	})
})

describe('renderTemplate', () => {
	it('fills known placeholders and leaves unknown ones as typed', () => {
		expect(renderTemplate('Hi {firstName}, {nope}', SAMPLE_EMAIL_VARIABLES)).toBe(
			'Hi Amina, {nope}',
		)
	})
})

describe('findUnknownPlaceholders', () => {
	it('reports each misspelled placeholder once', () => {
		expect(findUnknownPlaceholders('{firstname} {firstname} {eventName}')).toEqual(['firstname'])
	})

	it('accepts every default template', () => {
		for (const trigger of EMAIL_TRIGGERS) {
			const { subject, body } = EMAIL_TEMPLATE_DEFAULTS[trigger]
			expect(findUnknownPlaceholders(subject + body)).toEqual([])
		}
	})

	it('has a sample value for every placeholder', () => {
		expect(Object.keys(SAMPLE_EMAIL_VARIABLES).sort()).toEqual(
			Object.keys(EMAIL_PLACEHOLDERS).sort(),
		)
	})
})

describe('buildEmailHtml', () => {
	it('escapes participant-supplied text', () => {
		const html = buildEmailHtml('s', 'Org: <script>alert(1)</script>')
		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
	})

	it('turns blank lines into paragraphs and URLs into links', () => {
		const html = buildEmailHtml('s', 'One\n\nSee https://portal.example/requests/p1')
		expect(html.match(/<p /g)).toHaveLength(2)
		expect(html).toContain('<a href="https://portal.example/requests/p1"')
	})
})
