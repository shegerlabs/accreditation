import { PrismaClient } from '@prisma/client'
import { beforeAll, afterAll, beforeEach } from 'vitest'

// Use a separate test database URL
const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ||
	'postgresql://localhost:5432/accreditation_test'

// Create a test-specific Prisma client
export const testPrisma = new PrismaClient({
	datasources: {
		db: {
			url: TEST_DATABASE_URL,
		},
	},
})

// Tables to truncate in order (considering foreign key constraints)
const tablesToTruncate = [
	'Approval',
	'ParticipantDocument',
	'Participant',
	'InvitationConstraint',
	'Invitation',
	'Step',
	'Workflow',
	'Meeting',
	'Template',
	'Event',
	'MeetingType',
	'Venue',
	'ParticipantType',
	'User',
	'Tenant',
]

/**
 * Truncate all tables in the test database
 */
export async function cleanupTestDatabase() {
	// Disable foreign key checks temporarily
	await testPrisma.$executeRawUnsafe('SET session_replication_role = replica;')

	for (const table of tablesToTruncate) {
		try {
			await testPrisma.$executeRawUnsafe(
				`TRUNCATE TABLE "${table}" CASCADE;`
			)
		} catch {
			// Table might not exist, skip
		}
	}

	// Re-enable foreign key checks
	await testPrisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;')
}

/**
 * Disconnect from the test database
 */
export async function disconnectTestDatabase() {
	await testPrisma.$disconnect()
}

/**
 * Create a test tenant
 */
export async function createTestTenant(overrides: Partial<{
	name: string
	email: string
	phone: string
}> = {}) {
	return testPrisma.tenant.create({
		data: {
			name: overrides.name ?? 'Test Tenant',
			email: overrides.email ?? 'tenant@test.com',
			phone: overrides.phone ?? '1234567890',
			subscriptionPlan: 'BASIC',
		},
	})
}

/**
 * Create a test user
 */
export async function createTestUser(
	tenantId: string,
	overrides: Partial<{
		email: string
		username: string
		name: string
	}> = {}
) {
	return testPrisma.user.create({
		data: {
			tenantId,
			email: overrides.email ?? 'user@test.com',
			username: overrides.username ?? 'testuser',
			name: overrides.name ?? 'Test User',
		},
	})
}

/**
 * Create a test event
 */
export async function createTestEvent(
	tenantId: string,
	overrides: Partial<{
		name: string
		description: string
		startDate: Date
		endDate: Date
	}> = {}
) {
	const startDate = overrides.startDate ?? new Date()
	const endDate = overrides.endDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

	return testPrisma.event.create({
		data: {
			tenantId,
			name: overrides.name ?? 'Test Event',
			description: overrides.description ?? 'Test event for testing',
			startDate,
			endDate,
			status: 'PUBLISHED',
		},
	})
}

/**
 * Create a test participant type
 */
export async function createTestParticipantType(
	tenantId: string,
	overrides: Partial<{
		name: string
		description: string
	}> = {}
) {
	return testPrisma.participantType.create({
		data: {
			tenantId,
			name: overrides.name ?? 'Delegate',
			description: overrides.description ?? 'Test participant type',
			priority: 'MEDIUM',
			isExemptedFromFullQuota: false,
			isExemptedFromOpenSessionQuota: false,
			isExemptedFromClosedSessionQuota: false,
		},
	})
}

/**
 * Create a test invitation
 */
export async function createTestInvitation(
	tenantId: string,
	eventId: string,
	overrides: Partial<{
		organization: string
		email: string
		maximumQuota: number
	}> = {}
) {
	return testPrisma.invitation.create({
		data: {
			tenantId,
			eventId,
			organization: overrides.organization ?? 'Test Organization',
			email: overrides.email ?? 'org@test.com',
			maximumQuota: overrides.maximumQuota ?? 10,
		},
	})
}

/**
 * Create a test participant
 * Note: This requires a workflow with steps to be set up first
 */
export async function createTestParticipant(
	data: {
		tenantId: string
		eventId: string
		participantTypeId: string
		userId: string
		stepId: string
		nationalityId: string
		countryId: string
		titleId: string
	},
	overrides: Partial<{
		firstName: string
		familyName: string
		email: string
		passportNumber: string
		organization: string
		invitationId: string
	}> = {}
) {
	const timestamp = Date.now()
	return testPrisma.participant.create({
		data: {
			tenantId: data.tenantId,
			eventId: data.eventId,
			participantTypeId: data.participantTypeId,
			userId: data.userId,
			stepId: data.stepId,
			nationalityId: data.nationalityId,
			countryId: data.countryId,
			titleId: data.titleId,
			registrationCode: `REG${timestamp}`,
			gender: 'Male',
			firstName: overrides.firstName ?? 'John',
			familyName: overrides.familyName ?? 'Doe',
			dateOfBirth: new Date('1990-01-01'),
			passportNumber: overrides.passportNumber ?? `PASS${timestamp}`,
			passportExpiry: new Date('2030-01-01'),
			organization: overrides.organization ?? 'Test Organization',
			jobTitle: 'Test Job',
			city: 'Test City',
			email: overrides.email,
			needsCarFromOrganizer: false,
			status: 'PENDING',
			invitationId: overrides.invitationId,
		},
	})
}

/**
 * Create a test title
 */
export async function createTestTitle(
	overrides: Partial<{
		name: string
	}> = {}
) {
	const name = overrides.name ?? 'MR.'
	return testPrisma.title.upsert({
		where: { name },
		update: {},
		create: { name },
	})
}

/**
 * Create a test country
 */
export async function createTestCountry(
	overrides: Partial<{
		name: string
		code: string
	}> = {}
) {
	return testPrisma.country.create({
		data: {
			name: overrides.name ?? 'Test Country',
			code: overrides.code ?? 'TC',
		},
	})
}

/**
 * Create a test role
 */
export async function createTestRole(
	overrides: Partial<{
		name: string
	}> = {}
) {
	const timestamp = Date.now()
	return testPrisma.role.create({
		data: {
			name: overrides.name ?? `TestRole${timestamp}`,
			scope: 'EVENT',
		},
	})
}

/**
 * Create a test workflow with initial step
 */
export async function createTestWorkflow(
	tenantId: string,
	eventId: string,
	participantTypeId: string,
	roleId: string,
	overrides: Partial<{
		name: string
	}> = {}
) {
	const workflow = await testPrisma.workflow.create({
		data: {
			tenantId,
			eventId,
			participantTypeId,
			name: overrides.name ?? 'Test Workflow',
		},
	})

	const step = await testPrisma.step.create({
		data: {
			tenantId,
			workflowId: workflow.id,
			roleId,
			order: 1,
			name: 'Initial Review',
			action: 'APPROVE',
		},
	})

	return { workflow, step }
}

/**
 * Seed a complete test scenario with tenant, event, user, and invitation
 */
export async function seedTestScenario() {
	const tenant = await createTestTenant()
	const user = await createTestUser(tenant.id)
	const event = await createTestEvent(tenant.id)
	const participantType = await createTestParticipantType(tenant.id)
	const invitation = await createTestInvitation(tenant.id, event.id)
	const country = await createTestCountry()
	const role = await createTestRole()
	const title = await createTestTitle()
	const { workflow, step } = await createTestWorkflow(
		tenant.id,
		event.id,
		participantType.id,
		role.id
	)

	return {
		tenant,
		user,
		event,
		participantType,
		invitation,
		country,
		role,
		title,
		workflow,
		step,
	}
}

/**
 * Setup hooks for database tests
 */
export function setupDatabaseTests() {
	beforeAll(async () => {
		await testPrisma.$connect()
	})

	beforeEach(async () => {
		await cleanupTestDatabase()
	})

	afterAll(async () => {
		await cleanupTestDatabase()
		await disconnectTestDatabase()
	})
}
