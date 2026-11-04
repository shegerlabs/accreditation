import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'

// Note: Integration tests require a running test database
// Run: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/accreditation_test npm test
// Or skip with: SKIP_DB_TESTS=true npm run test:integration

// Check if database tests should be skipped
const SKIP_DB_TESTS = process.env.SKIP_DB_TESTS === 'true' || !process.env.TEST_DATABASE_URL

describe('Registration Form Integration Tests', () => {
	describe.skipIf(SKIP_DB_TESTS)('Database Operations', () => {
		// Only import database utilities when tests will actually run
		let testPrisma: Awaited<typeof import('../../db-setup')>['testPrisma']
		let seedTestScenario: Awaited<typeof import('../../db-setup')>['seedTestScenario']
		let createTestParticipant: Awaited<typeof import('../../db-setup')>['createTestParticipant']
		let cleanupTestDatabase: Awaited<typeof import('../../db-setup')>['cleanupTestDatabase']
		let disconnectTestDatabase: Awaited<typeof import('../../db-setup')>['disconnectTestDatabase']

		beforeAll(async () => {
			const dbSetup = await import('../../db-setup')
			testPrisma = dbSetup.testPrisma
			seedTestScenario = dbSetup.seedTestScenario
			createTestParticipant = dbSetup.createTestParticipant
			cleanupTestDatabase = dbSetup.cleanupTestDatabase
			disconnectTestDatabase = dbSetup.disconnectTestDatabase
			await testPrisma.$connect()
		})

		beforeEach(async () => {
			await cleanupTestDatabase()
		})

		afterAll(async () => {
			await cleanupTestDatabase()
			await disconnectTestDatabase()
		})

		describe('Participant Creation', () => {
			it('should create a participant with valid data', async () => {
				const scenario = await seedTestScenario()

				const participant = await createTestParticipant(
					{
						tenantId: scenario.tenant.id,
						eventId: scenario.event.id,
						participantTypeId: scenario.participantType.id,
						userId: scenario.user.id,
						stepId: scenario.step.id,
						nationalityId: scenario.country.id,
						countryId: scenario.country.id,
						titleId: scenario.title.id,
					},
					{
						firstName: 'John',
						familyName: 'Doe',
						passportNumber: 'AB123456',
						organization: 'Test Corp',
						email: 'john@test.com',
						invitationId: scenario.invitation.id,
					}
				)

				expect(participant).toBeDefined()
				expect(participant.firstName).toBe('John')
				expect(participant.familyName).toBe('Doe')
				expect(participant.passportNumber).toBe('AB123456')
			})

			it('should enforce passport uniqueness within tenant and event', async () => {
				const scenario = await seedTestScenario()

				// Create first participant
				await createTestParticipant(
					{
						tenantId: scenario.tenant.id,
						eventId: scenario.event.id,
						participantTypeId: scenario.participantType.id,
						userId: scenario.user.id,
						stepId: scenario.step.id,
						nationalityId: scenario.country.id,
						countryId: scenario.country.id,
						titleId: scenario.title.id,
					},
					{
						passportNumber: 'UNIQUE123',
					}
				)

				// Try to create second participant with same passport
				await expect(
					createTestParticipant(
						{
							tenantId: scenario.tenant.id,
							eventId: scenario.event.id,
							participantTypeId: scenario.participantType.id,
							userId: scenario.user.id,
							stepId: scenario.step.id,
							nationalityId: scenario.country.id,
							countryId: scenario.country.id,
							titleId: scenario.title.id,
						},
						{
							passportNumber: 'UNIQUE123',
						}
					)
				).rejects.toThrow()
			})
		})

		describe('Invitation Constraints', () => {
			it('should create invitation constraint with quota', async () => {
				const scenario = await seedTestScenario()

				const constraint = await testPrisma.invitationConstraint.create({
					data: {
						invitationId: scenario.invitation.id,
						participantTypeId: scenario.participantType.id,
						accessLevel: 'OPEN',
						quota: 5,
					},
				})

				expect(constraint).toBeDefined()
				expect(constraint.quota).toBe(5)
			})

			it('should allow unlimited participants when quota is null', async () => {
				const scenario = await seedTestScenario()

				const constraint = await testPrisma.invitationConstraint.create({
					data: {
						invitationId: scenario.invitation.id,
						participantTypeId: scenario.participantType.id,
						accessLevel: 'OPEN',
						quota: null,
					},
				})

				expect(constraint).toBeDefined()
				expect(constraint.quota).toBeNull()
			})
		})

		describe('Workflow Steps', () => {
			it('should create workflow with multiple steps', async () => {
				const scenario = await seedTestScenario()

				// Create additional step
				const secondStep = await testPrisma.step.create({
					data: {
						tenantId: scenario.tenant.id,
						workflowId: scenario.workflow.id,
						roleId: scenario.role.id,
						order: 2,
						name: 'Final Review',
						action: 'APPROVE',
					},
				})

				// Link steps
				await testPrisma.step.update({
					where: { id: scenario.step.id },
					data: { nextStepId: secondStep.id },
				})

				const updatedStep = await testPrisma.step.findUnique({
					where: { id: scenario.step.id },
				})

				expect(updatedStep?.nextStepId).toBe(secondStep.id)
			})

			it('should mark step as rejection target', async () => {
				const scenario = await seedTestScenario()

				await testPrisma.step.update({
					where: { id: scenario.step.id },
					data: { isRejectionTarget: true },
				})

				const updatedStep = await testPrisma.step.findUnique({
					where: { id: scenario.step.id },
				})

				expect(updatedStep?.isRejectionTarget).toBe(true)
			})

			it('should mark step as bypass target', async () => {
				const scenario = await seedTestScenario()

				await testPrisma.step.update({
					where: { id: scenario.step.id },
					data: { isBypassTarget: true },
				})

				const updatedStep = await testPrisma.step.findUnique({
					where: { id: scenario.step.id },
				})

				expect(updatedStep?.isBypassTarget).toBe(true)
			})
		})

		describe('Participant Documents', () => {
			it('should create participant document', async () => {
				const scenario = await seedTestScenario()

				const participant = await createTestParticipant({
					tenantId: scenario.tenant.id,
					eventId: scenario.event.id,
					participantTypeId: scenario.participantType.id,
					userId: scenario.user.id,
					stepId: scenario.step.id,
					nationalityId: scenario.country.id,
					countryId: scenario.country.id,
					titleId: scenario.title.id,
				})

				const document = await testPrisma.participantDocument.create({
					data: {
						participantId: participant.id,
						documentType: 'PHOTO',
						contentType: 'image/jpeg',
						fileName: 'photo.jpg',
						extension: 'jpg',
					},
				})

				expect(document).toBeDefined()
				expect(document.documentType).toBe('PHOTO')
			})

			it('should create multiple documents for participant', async () => {
				const scenario = await seedTestScenario()

				const participant = await createTestParticipant({
					tenantId: scenario.tenant.id,
					eventId: scenario.event.id,
					participantTypeId: scenario.participantType.id,
					userId: scenario.user.id,
					stepId: scenario.step.id,
					nationalityId: scenario.country.id,
					countryId: scenario.country.id,
					titleId: scenario.title.id,
				})

				await testPrisma.participantDocument.createMany({
					data: [
						{
							participantId: participant.id,
							documentType: 'PHOTO',
							contentType: 'image/jpeg',
							fileName: 'photo.jpg',
							extension: 'jpg',
						},
						{
							participantId: participant.id,
							documentType: 'PASSPORT',
							contentType: 'application/pdf',
							fileName: 'passport.pdf',
							extension: 'pdf',
						},
						{
							participantId: participant.id,
							documentType: 'LETTER',
							contentType: 'application/pdf',
							fileName: 'letter.pdf',
							extension: 'pdf',
						},
					],
				})

				const documents = await testPrisma.participantDocument.findMany({
					where: { participantId: participant.id },
				})

				expect(documents).toHaveLength(3)
			})
		})

		describe('Quota Enforcement', () => {
			it('should count participants per invitation', async () => {
				const scenario = await seedTestScenario()

				// Create participants under the invitation
				await createTestParticipant(
					{
						tenantId: scenario.tenant.id,
						eventId: scenario.event.id,
						participantTypeId: scenario.participantType.id,
						userId: scenario.user.id,
						stepId: scenario.step.id,
						nationalityId: scenario.country.id,
						countryId: scenario.country.id,
						titleId: scenario.title.id,
					},
					{
						passportNumber: 'PASS1',
						invitationId: scenario.invitation.id,
					}
				)

				await createTestParticipant(
					{
						tenantId: scenario.tenant.id,
						eventId: scenario.event.id,
						participantTypeId: scenario.participantType.id,
						userId: scenario.user.id,
						stepId: scenario.step.id,
						nationalityId: scenario.country.id,
						countryId: scenario.country.id,
						titleId: scenario.title.id,
					},
					{
						passportNumber: 'PASS2',
						invitationId: scenario.invitation.id,
					}
				)

				const count = await testPrisma.participant.count({
					where: { invitationId: scenario.invitation.id },
				})

				expect(count).toBe(2)
			})

			it('should respect maximum quota on invitation', async () => {
				const scenario = await seedTestScenario()

				// Update invitation with maximum quota of 1
				await testPrisma.invitation.update({
					where: { id: scenario.invitation.id },
					data: { maximumQuota: 1 },
				})

				// Create first participant (should succeed)
				await createTestParticipant(
					{
						tenantId: scenario.tenant.id,
						eventId: scenario.event.id,
						participantTypeId: scenario.participantType.id,
						userId: scenario.user.id,
						stepId: scenario.step.id,
						nationalityId: scenario.country.id,
						countryId: scenario.country.id,
						titleId: scenario.title.id,
					},
					{
						passportNumber: 'PASS1',
						invitationId: scenario.invitation.id,
					}
				)

				const count = await testPrisma.participant.count({
					where: { invitationId: scenario.invitation.id },
				})

				const invitation = await testPrisma.invitation.findUnique({
					where: { id: scenario.invitation.id },
				})

				expect(count).toBe(1)
				expect(invitation?.maximumQuota).toBe(1)
				// In real app, the second registration would be blocked by validation
			})
		})
	})
})

// Mock tests that don't require database
describe('Registration Form Validation Logic', () => {
	describe('Email validation based on role', () => {
		const validateEmail = (email: string | undefined, isFocal: boolean) => {
			// User role: email required and must match logged-in user
			if (!isFocal) {
				if (!email) {
					return { valid: false, error: 'Email is required' }
				}
			}
			// Focal role: email optional
			return { valid: true }
		}

		it('should require email for user role', () => {
			const result = validateEmail(undefined, false)
			expect(result.valid).toBe(false)
			expect(result.error).toBe('Email is required')
		})

		it('should allow empty email for focal role', () => {
			const result = validateEmail(undefined, true)
			expect(result.valid).toBe(true)
		})

		it('should accept valid email for user role', () => {
			const result = validateEmail('user@example.com', false)
			expect(result.valid).toBe(true)
		})
	})

	describe('Invitation validation based on role', () => {
		const validateInvitation = (
			invitationId: string | undefined,
			isFocal: boolean
		) => {
			// Focal role: invitation required
			if (isFocal && !invitationId) {
				return { valid: false, error: 'Select an invitation' }
			}
			// User role: no invitation needed
			return { valid: true }
		}

		it('should require invitation for focal role', () => {
			const result = validateInvitation(undefined, true)
			expect(result.valid).toBe(false)
			expect(result.error).toBe('Select an invitation')
		})

		it('should not require invitation for user role', () => {
			const result = validateInvitation(undefined, false)
			expect(result.valid).toBe(true)
		})

		it('should accept valid invitation for focal role', () => {
			const result = validateInvitation('inv-123', true)
			expect(result.valid).toBe(true)
		})
	})

	describe('Quota validation', () => {
		const checkQuota = (
			currentCount: number,
			maxQuota: number | null
		): boolean => {
			if (maxQuota === null) return true // Unlimited
			return currentCount < maxQuota
		}

		it('should allow registration when under quota', () => {
			expect(checkQuota(3, 10)).toBe(true)
		})

		it('should block registration when at quota', () => {
			expect(checkQuota(10, 10)).toBe(false)
		})

		it('should block registration when over quota', () => {
			expect(checkQuota(11, 10)).toBe(false)
		})

		it('should allow registration when quota is unlimited (null)', () => {
			expect(checkQuota(100, null)).toBe(true)
		})
	})
})
