import { PrismaClient } from '@prisma/client'

// Connect to the test database (separate from development)
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/accreditation_test?schema=public'

// Singleton Prisma client for E2E tests
let prismaClient: PrismaClient | null = null

export function getTestPrisma(): PrismaClient {
	if (!prismaClient) {
		prismaClient = new PrismaClient({
			datasources: {
				db: {
					url: DATABASE_URL,
				},
			},
		})
	}
	return prismaClient
}

export async function disconnectTestPrisma(): Promise<void> {
	if (prismaClient) {
		await prismaClient.$disconnect()
		prismaClient = null
	}
}

/**
 * Get a user by email
 */
export async function getUserByEmail(email: string) {
	const prisma = getTestPrisma()
	return prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true, username: true },
	})
}

/**
 * Check if 2FA is enabled for a user
 */
export async function is2FAEnabled(userId: string): Promise<boolean> {
	const prisma = getTestPrisma()
	const verification = await prisma.verification.findUnique({
		where: {
			target_type: {
				target: userId,
				type: '2fa',
			},
		},
	})
	return Boolean(verification)
}

/**
 * Enable 2FA for a user (directly in database)
 * This creates a verification record as if the user had completed 2FA setup
 */
export async function enable2FAForUser(userId: string): Promise<{ secret: string }> {
	const prisma = getTestPrisma()

	// Generate a TOTP secret (same format as the app uses)
	const { generateTOTP } = await import('@epic-web/totp')
	const { otp: _otp, secret, ...config } = generateTOTP()

	// Create the verification record
	await prisma.verification.upsert({
		where: {
			target_type: {
				target: userId,
				type: '2fa',
			},
		},
		update: {
			secret,
			algorithm: config.algorithm,
			digits: config.digits,
			period: config.period,
			charSet: config.charSet,
			expiresAt: null,
		},
		create: {
			target: userId,
			type: '2fa',
			secret,
			algorithm: config.algorithm,
			digits: config.digits,
			period: config.period,
			charSet: config.charSet,
			expiresAt: null,
		},
	})

	return { secret }
}

/**
 * Disable 2FA for a user (directly in database)
 */
export async function disable2FAForUser(userId: string): Promise<void> {
	const prisma = getTestPrisma()

	// Delete any 2FA verification records
	await prisma.verification.deleteMany({
		where: {
			target: userId,
			type: { in: ['2fa', '2fa-verify'] },
		},
	})
}

/**
 * Get the 2FA verification record for a user
 */
export async function get2FAVerification(userId: string) {
	const prisma = getTestPrisma()
	return prisma.verification.findUnique({
		where: {
			target_type: {
				target: userId,
				type: '2fa',
			},
		},
		select: {
			secret: true,
			algorithm: true,
			digits: true,
			period: true,
			charSet: true,
		},
	})
}

/**
 * Delete pending 2FA verification (the one created when clicking "Enable 2FA")
 */
export async function deletePending2FAVerification(userId: string): Promise<void> {
	const prisma = getTestPrisma()

	await prisma.verification.deleteMany({
		where: {
			target: userId,
			type: '2fa-verify',
		},
	})
}

// ==========================================
// Participant Test Helpers
// ==========================================

/**
 * Get or create a workflow with a step for testing
 */
export async function ensureWorkflowExists(
	tenantId: string,
	eventId: string,
	participantTypeId: string,
): Promise<{ workflowId: string; stepId: string }> {
	const prisma = getTestPrisma()

	// Check for existing workflow (any workflow for this combination)
	const existingWorkflow = await prisma.workflow.findFirst({
		where: { tenantId, eventId, participantTypeId },
		include: { steps: { take: 1 } },
	})

	if (existingWorkflow) {
		// Workflow exists - check if it has steps
		if (existingWorkflow.steps.length > 0) {
			return {
				workflowId: existingWorkflow.id,
				stepId: existingWorkflow.steps[0].id,
			}
		}

		// Workflow exists but has no steps - add one
		let role = await prisma.role.findFirst({
			where: { name: 'focal' },
		})

		if (!role) {
			role = await prisma.role.create({
				data: {
					name: 'focal',
					scope: 'EVENT',
				},
			})
		}

		const step = await prisma.step.create({
			data: {
				tenantId,
				workflowId: existingWorkflow.id,
				roleId: role.id,
				order: 1,
				name: 'Initial Review',
				action: 'APPROVE',
				isRejectionTarget: true,
			},
		})

		return { workflowId: existingWorkflow.id, stepId: step.id }
	}

	// No workflow exists - create one with a unique name
	let role = await prisma.role.findFirst({
		where: { name: 'focal' },
	})

	if (!role) {
		role = await prisma.role.create({
			data: {
				name: 'focal',
				scope: 'EVENT',
			},
		})
	}

	// Use a unique name to avoid conflicts
	const uniqueName = `Test Workflow ${Date.now()}`
	const workflow = await prisma.workflow.create({
		data: {
			tenantId,
			eventId,
			participantTypeId,
			name: uniqueName,
		},
	})

	// Create initial step
	const step = await prisma.step.create({
		data: {
			tenantId,
			workflowId: workflow.id,
			roleId: role.id,
			order: 1,
			name: 'Initial Review',
			action: 'APPROVE',
			isRejectionTarget: true,
		},
	})

	return { workflowId: workflow.id, stepId: step.id }
}

/**
 * Create a rejected participant for testing
 */
export async function createRejectedParticipant(
	userId: string,
): Promise<{ participantId: string } | null> {
	const prisma = getTestPrisma()

	// Get user's tenant
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { tenantId: true },
	})

	if (!user?.tenantId) return null

	const tenantId = user.tenantId

	// Get required related entities
	const event = await prisma.event.findFirst({
		where: { tenantId },
	})

	const participantType = await prisma.participantType.findFirst({
		where: { tenantId },
	})

	const country = await prisma.country.findFirst()

	if (!event || !participantType || !country) return null

	// Ensure workflow and step exist
	const { stepId } = await ensureWorkflowExists(
		tenantId,
		event.id,
		participantType.id,
	)

	// Get or create a title
	const title = await prisma.title.upsert({
		where: { name: 'MR.' },
		update: {},
		create: { name: 'MR.' },
	})

	// Generate unique registration code and passport
	const timestamp = Date.now()
	const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase()

	// Create rejected participant
	const participant = await prisma.participant.create({
		data: {
			userId,
			tenantId,
			eventId: event.id,
			participantTypeId: participantType.id,
			stepId,
			nationalityId: country.id,
			countryId: country.id,
			titleId: title.id,
			registrationCode: `REJ${timestamp}${randomSuffix}`,
			gender: 'MALE',
			firstName: 'Test',
			familyName: 'Rejected',
			dateOfBirth: new Date('1990-01-01'),
			passportNumber: `PASS${timestamp}${randomSuffix}`,
			passportExpiry: new Date('2030-01-01'),
			organization: 'Test Organization',
			jobTitle: 'Test Job',
			city: 'Test City',
			needsCarFromOrganizer: false,
			status: 'REJECTED',
		},
	})

	return { participantId: participant.id }
}

/**
 * Delete a participant (cleanup)
 */
export async function deleteParticipant(participantId: string): Promise<void> {
	const prisma = getTestPrisma()

	await prisma.participant.delete({
		where: { id: participantId },
	}).catch(() => {
		// Ignore if already deleted
	})
}

/**
 * Get a rejected participant for the user
 */
export async function getRejectedParticipant(userId: string) {
	const prisma = getTestPrisma()

	const participant = await prisma.participant.findFirst({
		where: {
			userId,
			status: 'REJECTED',
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			status: true,
			gender: true,
		},
	})

	// If participant exists but has invalid gender, delete it so we can recreate
	if (participant && participant.gender !== 'MALE' && participant.gender !== 'FEMALE') {
		await prisma.participant.delete({
			where: { id: participant.id },
		}).catch(() => {})
		return null
	}

	return participant
}

// ==========================================
// Test Data Helpers
// ==========================================

/**
 * Get the test tenant (first tenant in database, created by seed)
 */
export async function getTestTenant() {
	const prisma = getTestPrisma()

	return prisma.tenant.findFirst({
		orderBy: { createdAt: 'asc' },
		select: { id: true, name: true },
	})
}

/**
 * Get the test event for a tenant
 */
export async function getTestEvent(tenantId: string) {
	const prisma = getTestPrisma()

	return prisma.event.findFirst({
		where: { tenantId },
		orderBy: { createdAt: 'asc' },
		select: { id: true, name: true },
	})
}

/**
 * Get test data (tenant, event, user) for E2E tests
 */
export async function getTestData(userEmail: string = 'focal@test.com') {
	const prisma = getTestPrisma()

	const user = await prisma.user.findUnique({
		where: { email: userEmail },
		select: { id: true, tenantId: true },
	})

	if (!user?.tenantId) return null

	const event = await prisma.event.findFirst({
		where: { tenantId: user.tenantId },
		orderBy: { createdAt: 'asc' },
		select: { id: true, name: true },
	})

	if (!event) return null

	return {
		tenantId: user.tenantId,
		eventId: event.id,
		userId: user.id,
	}
}
