# Performance Optimization Changes for /requests and /requests/new Routes

## Overview

This document details all changes made to optimize the `/requests` and `/requests/new` routes, which were experiencing performance issues with thousands of participants due to:
1. Missing database indexes on frequently queried columns
2. Slow string pattern matching (`LIKE '%id%'`) on `wishList` column
3. N+1 query pattern in quota validation

The key insight is that the `attendClosedSession Boolean @default(false)` field already exists on the Participant model but was never used - the code was using slow `wishList LIKE '%closedSessionId%'` queries instead.

---

## File 1: prisma/schema.prisma

### Change 1: Added indexes to Participant model (lines 705-708)

**Before:**
```prisma
  @@unique([tenantId, eventId, passportNumber])
  @@index([eventId, stepId, status])
  @@index([tenantId, eventId, participantTypeId])
  @@index([status, createdAt])
}
```

**After:**
```prisma
  @@unique([tenantId, eventId, passportNumber])
  @@index([eventId, stepId, status])
  @@index([tenantId, eventId, participantTypeId])
  @@index([status, createdAt])
  @@index([userId])                              // Performance: /requests list filter
  @@index([invitationId])                        // Performance: quota validation counts
  @@index([invitationId, participantTypeId])     // Performance: constraint counts
  @@index([invitationId, attendClosedSession])   // Performance: closed session counts
}
```

**Purpose:** These indexes optimize:
- `userId` index: Speeds up filtering participants by user on the `/requests` page
- `invitationId` index: Speeds up counting participants per invitation for quota validation
- `invitationId, participantTypeId` composite: Speeds up constraint-specific counts
- `invitationId, attendClosedSession` composite: Speeds up closed session participant counts

---

### Change 2: Added index to Invitation model (line 631)

**Before:**
```prisma
  @@unique([tenantId, eventId, organization, email])
}
```

**After:**
```prisma
  @@unique([tenantId, eventId, organization, email])
  @@index([tenantId, eventId, email])            // Performance: invitation lookup by user email
}
```

**Purpose:** Speeds up looking up invitations by user email during registration.

---

## File 2: prisma/migrations/20260118_backfill_attend_closed_session/migration.sql

**New file created:**

```sql
-- Backfill attendClosedSession based on wishList containing Closed Session meeting type
-- This migration sets attendClosedSession = true for participants who have a Closed Session
-- meeting type ID in their wishList field

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS "Participant_userId_idx" ON "Participant"("userId");
CREATE INDEX IF NOT EXISTS "Participant_invitationId_idx" ON "Participant"("invitationId");
CREATE INDEX IF NOT EXISTS "Participant_invitationId_participantTypeId_idx" ON "Participant"("invitationId", "participantTypeId");
CREATE INDEX IF NOT EXISTS "Participant_invitationId_attendClosedSession_idx" ON "Participant"("invitationId", "attendClosedSession");
CREATE INDEX IF NOT EXISTS "Invitation_tenantId_eventId_email_idx" ON "Invitation"("tenantId", "eventId", "email");

-- Backfill attendClosedSession for existing participants
-- Sets attendClosedSession = true where the wishList contains any Closed Session meeting type ID
UPDATE "Participant" p
SET "attendClosedSession" = true
WHERE EXISTS (
  SELECT 1 FROM "MeetingType" mt
  WHERE mt."tenantId" = p."tenantId"
  AND mt.name = 'Closed Session'
  AND p."wishList" LIKE '%' || mt.id || '%'
)
AND p."attendClosedSession" = false;
```

**Purpose:**
1. Creates all the new indexes
2. Backfills the `attendClosedSession` field for existing participants based on their `wishList`

---

## File 3: app/routes/requests+/new.tsx

### Change 1: Updated closedSessionCount subquery (lines 393-405)

**Before:**
```sql
/*
 * NESTED SUBQUERY: closedSessionCount
 * Counts participants under this invitation who have requested Closed Session
 * (i.e., have the Closed Session meeting type ID in their wishList)
 */
'closedSessionCount', (
    SELECT CAST(COUNT(*) AS INTEGER)
    FROM "Participant" p
    INNER JOIN "MeetingType" mt ON mt."tenantId" = ${tenantId} AND mt.name = 'Closed Session'
    WHERE p."invitationId" = i.id
    AND p."tenantId" = ${tenantId}
    AND p."eventId" = ${eventId}
    AND p."wishList" LIKE '%' || mt.id || '%'
),
```

**After:**
```sql
/*
 * NESTED SUBQUERY: closedSessionCount
 * Counts participants under this invitation who have requested Closed Session
 * Uses the indexed attendClosedSession boolean field for performance
 */
'closedSessionCount', (
    SELECT CAST(COUNT(*) AS INTEGER)
    FROM "Participant" p
    WHERE p."invitationId" = i.id
    AND p."tenantId" = ${tenantId}
    AND p."eventId" = ${eventId}
    AND p."attendClosedSession" = true
),
```

**Purpose:** Replaces slow LIKE pattern matching with fast boolean comparison using the indexed field.

---

### Change 2: Updated participant counts per constraint (lines 497-511)

**Before:**
```sql
/*
 * Pre-aggregated participant counts per (invitation, participantType)
 * Split by access level (CLOSED vs non-CLOSED based on wishlist)
 */
LEFT JOIN (
    SELECT
        p."invitationId",
        p."participantTypeId",
        COUNT(*) FILTER (
            WHERE EXISTS (
                SELECT 1 FROM "MeetingType" mt
                WHERE mt."tenantId" = ${tenantId}
                AND mt.name = 'Closed Session'
                AND p."wishList" LIKE '%' || mt.id || '%'
            )
        )::integer as "closedCount",
        COUNT(*) FILTER (
            WHERE NOT EXISTS (
                SELECT 1 FROM "MeetingType" mt
                WHERE mt."tenantId" = ${tenantId}
                AND mt.name = 'Closed Session'
                AND p."wishList" LIKE '%' || mt.id || '%'
            )
        )::integer as "openCount"
    FROM "Participant" p
    WHERE p."tenantId" = ${tenantId}
    AND p."eventId" = ${eventId}
    GROUP BY p."invitationId", p."participantTypeId"
) pc ON pc."invitationId" = i.id AND pc."participantTypeId" = ic."participantTypeId"
```

**After:**
```sql
/*
 * Pre-aggregated participant counts per (invitation, participantType)
 * Split by access level using the indexed attendClosedSession boolean
 */
LEFT JOIN (
    SELECT
        p."invitationId",
        p."participantTypeId",
        COUNT(*) FILTER (WHERE p."attendClosedSession" = true)::integer as "closedCount",
        COUNT(*) FILTER (WHERE p."attendClosedSession" = false)::integer as "openCount"
    FROM "Participant" p
    WHERE p."tenantId" = ${tenantId}
    AND p."eventId" = ${eventId}
    GROUP BY p."invitationId", p."participantTypeId"
) pc ON pc."invitationId" = i.id AND pc."participantTypeId" = ic."participantTypeId"
```

**Purpose:** Eliminates nested EXISTS subqueries with LIKE patterns, using simple boolean comparisons instead.

---

### Change 3: Updated total counts for "Any" participant type (lines 512-526)

**Before:**
```sql
/*
 * Total counts per invitation (for "Any" participant type constraints)
 * Counts ALL participants regardless of their participant type
 */
LEFT JOIN (
    SELECT
        p."invitationId",
        COUNT(*) FILTER (
            WHERE EXISTS (
                SELECT 1 FROM "MeetingType" mt
                WHERE mt."tenantId" = ${tenantId}
                AND mt.name = 'Closed Session'
                AND p."wishList" LIKE '%' || mt.id || '%'
            )
        )::integer as "closedCount",
        COUNT(*) FILTER (
            WHERE NOT EXISTS (
                SELECT 1 FROM "MeetingType" mt
                WHERE mt."tenantId" = ${tenantId}
                AND mt.name = 'Closed Session'
                AND p."wishList" LIKE '%' || mt.id || '%'
            )
        )::integer as "openCount"
    FROM "Participant" p
    WHERE p."tenantId" = ${tenantId}
    AND p."eventId" = ${eventId}
    GROUP BY p."invitationId"
) tc ON tc."invitationId" = i.id
```

**After:**
```sql
/*
 * Total counts per invitation (for "Any" participant type constraints)
 * Counts ALL participants regardless of their participant type
 * Uses the indexed attendClosedSession boolean for performance
 */
LEFT JOIN (
    SELECT
        p."invitationId",
        COUNT(*) FILTER (WHERE p."attendClosedSession" = true)::integer as "closedCount",
        COUNT(*) FILTER (WHERE p."attendClosedSession" = false)::integer as "openCount"
    FROM "Participant" p
    WHERE p."tenantId" = ${tenantId}
    AND p."eventId" = ${eventId}
    GROUP BY p."invitationId"
) tc ON tc."invitationId" = i.id
```

**Purpose:** Same optimization as Change 2, for the total counts used by "Any" participant type constraints.

---

### Change 4: Replaced N+1 quota validation with batched query (lines 853-919)

**Before:**
```typescript
// Check if at least ONE applicable constraint has available quota
let hasAvailableQuota = false

// Fetch closedSessionType ONCE before the loop (fixes N+1 query)
const closedSessionType = await prisma.meetingType.findFirst({
    where: { tenantId: data.tenantId, name: 'Closed Session' },
})

for (const constraint of applicableConstraints) {
    // If quota is unlimited, this constraint has space
    if (constraint.quota === null) {
        hasAvailableQuota = true
        break
    }

    // Determine if this constraint matches the access level request
    const isClosedConstraint = constraint.accessLevel === 'CLOSED'
    const constraintMatchesRequest =
        (isRequestingClosed && isClosedConstraint) ||
        (!isRequestingClosed && !isClosedConstraint)

    // Count participants matching this constraint
    // For "Any" type: count all participants with matching access level
    // For specific type: count that type with matching access level
    const isAnyType = constraint.participantType?.name === 'Any'

    let currentCount: number

    if (isClosedConstraint) {
        // Count participants who selected Closed Session
        if (closedSessionType) {
            currentCount = await prisma.participant.count({
                where: {
                    invitationId: data.invitationId,
                    tenantId: data.tenantId,
                    eventId: data.eventId,
                    ...(isAnyType
                        ? {}
                        : { participantTypeId: data.participantTypeId }),
                    wishList: { contains: closedSessionType.id },
                },
            })
        } else {
            currentCount = 0
        }
    } else {
        // Count participants who did NOT select Closed Session
        if (closedSessionType) {
            currentCount = await prisma.participant.count({
                where: {
                    invitationId: data.invitationId,
                    tenantId: data.tenantId,
                    eventId: data.eventId,
                    ...(isAnyType
                        ? {}
                        : { participantTypeId: data.participantTypeId }),
                    NOT: { wishList: { contains: closedSessionType.id } },
                },
            })
        } else {
            // No Closed Session meeting type exists, count all
            currentCount = await prisma.participant.count({
                where: {
                    invitationId: data.invitationId,
                    tenantId: data.tenantId,
                    eventId: data.eventId,
                    ...(isAnyType
                        ? {}
                        : { participantTypeId: data.participantTypeId }),
                },
            })
        }
    }

    // Check if this constraint has available quota
    if (currentCount < constraint.quota) {
        // Only count as available if it matches the access level request
        if (constraintMatchesRequest) {
            hasAvailableQuota = true
            break
        }
    }
}
```

**After:**
```typescript
// Check if at least ONE applicable constraint has available quota
let hasAvailableQuota = false

// Batch fetch ALL participant counts in a single query (eliminates N+1)
// Groups by participantTypeId and attendClosedSession for efficient lookup
const participantCounts = await prisma.participant.groupBy({
    by: ['participantTypeId', 'attendClosedSession'],
    where: {
        invitationId: data.invitationId,
        tenantId: data.tenantId,
        eventId: data.eventId,
    },
    _count: { id: true },
})

// Build lookup maps for O(1) access
const countMap = new Map<string, number>()
let totalClosedCount = 0
let totalOpenCount = 0

for (const group of participantCounts) {
    const key = `${group.participantTypeId}:${group.attendClosedSession}`
    countMap.set(key, group._count.id)
    if (group.attendClosedSession) {
        totalClosedCount += group._count.id
    } else {
        totalOpenCount += group._count.id
    }
}

// Helper to get count (replaces individual prisma.participant.count calls)
const getCount = (typeId: string | null, isClosed: boolean): number => {
    if (typeId === null) return isClosed ? totalClosedCount : totalOpenCount
    return countMap.get(`${typeId}:${isClosed}`) ?? 0
}

for (const constraint of applicableConstraints) {
    // If quota is unlimited, this constraint has space
    if (constraint.quota === null) {
        hasAvailableQuota = true
        break
    }

    // Determine if this constraint matches the access level request
    const isClosedConstraint = constraint.accessLevel === 'CLOSED'
    const constraintMatchesRequest =
        (isRequestingClosed && isClosedConstraint) ||
        (!isRequestingClosed && !isClosedConstraint)

    // Count participants matching this constraint using pre-fetched data
    // For "Any" type: count all participants with matching access level
    // For specific type: count that type with matching access level
    const isAnyType = constraint.participantType?.name === 'Any'
    const currentCount = getCount(
        isAnyType ? null : data.participantTypeId,
        isClosedConstraint,
    )

    // Check if this constraint has available quota
    if (currentCount < constraint.quota) {
        // Only count as available if it matches the access level request
        if (constraintMatchesRequest) {
            hasAvailableQuota = true
            break
        }
    }
}
```

**Purpose:** Eliminates N+1 query pattern by:
1. Fetching all counts in a single `groupBy` query
2. Building lookup maps for O(1) access
3. Using the lookup maps instead of individual count queries in the loop

---

### Change 5: Added attendClosedSession computation and setting on create (lines 1088-1130)

**Added code (lines 1088-1099):**
```typescript
// Determine if participant is requesting Closed Session (for attendClosedSession field)
const closedSessionMeetingType = formValues.meetings
    ? await prisma.meetingType.findFirst({
            where: {
                tenantId: formValues.tenantId,
                name: 'Closed Session',
                id: { in: formValues.meetings },
            },
            select: { id: true },
        })
    : null
const attendClosedSession = closedSessionMeetingType !== null
```

**Modified participant create (line 1130):**
```typescript
// Before:
wishList: formValues.meetings?.join(',') ?? null,
stepId: firstStep.id,

// After:
wishList: formValues.meetings?.join(',') ?? null,
attendClosedSession,
stepId: firstStep.id,
```

**Purpose:** Sets the `attendClosedSession` field when creating new participants, ensuring the field stays in sync with the `wishList`.

---

## File 4: app/routes/requests+/$participantId_.edit.tsx

### Change 1: Added attendClosedSession computation (lines 499-506)

**Added code:**
```typescript
// Determine if participant is requesting Closed Session (for attendClosedSession field)
const closedSessionMeetingType = await prisma.meetingType.findFirst({
    where: { tenantId: formValues.tenantId, name: 'Closed Session' },
    select: { id: true },
})
const attendClosedSession = closedSessionMeetingType
    ? (formValues.meetings?.includes(closedSessionMeetingType.id) ?? false)
    : false
```

**Purpose:** Computes the `attendClosedSession` value based on whether the Closed Session meeting type is in the selected meetings.

---

### Change 2: Added attendClosedSession to participant update (line 531)

**Before:**
```typescript
needsCarFromOrganizer: formValues.needsCarFromOrganizer,
wishList: formValues.meetings?.join(',') ?? null,
stepId: requestReceived.id,
```

**After:**
```typescript
needsCarFromOrganizer: formValues.needsCarFromOrganizer,
wishList: formValues.meetings?.join(',') ?? null,
attendClosedSession,
stepId: requestReceived.id,
```

**Purpose:** Sets the `attendClosedSession` field when updating participants, ensuring the field stays in sync with the `wishList`.

---

## Expected Performance Improvements

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| `/requests` list (userId filter) | Full table scan | Index seek | 10-100x |
| Quota count per constraint | N count queries per constraint | Single grouped query | 5-10x |
| Closed session detection | LIKE pattern match with JOIN | Boolean comparison | 5-20x |

---

## How to Apply Changes

```bash
# 1. Generate Prisma client (already done)
npx prisma generate

# 2. Push schema changes to database (creates indexes)
npx prisma db push

# 3. Run the backfill migration manually if needed
# (The migration file can be run directly against the database)
psql -d your_database -f prisma/migrations/20260118_backfill_attend_closed_session/migration.sql
```

---

## Verification

After applying changes:

1. **Verify indexes exist:**
   ```sql
   \d "Participant"
   -- Should show the new indexes
   ```

2. **Verify backfill worked:**
   ```sql
   SELECT COUNT(*) FROM "Participant" WHERE "attendClosedSession" = true;
   -- Should match count of participants with Closed Session in wishList
   ```

3. **Test functionality:**
   - Create a new participant with Closed Session selected
   - Verify `attendClosedSession` is `true`
   - Edit a rejected participant and change their meeting selection
   - Verify `attendClosedSession` updates correctly

---

## Rollback Plan

If issues occur:

1. **Indexes:** Can be dropped without functional impact:
   ```sql
   DROP INDEX IF EXISTS "Participant_userId_idx";
   DROP INDEX IF EXISTS "Participant_invitationId_idx";
   DROP INDEX IF EXISTS "Participant_invitationId_participantTypeId_idx";
   DROP INDEX IF EXISTS "Participant_invitationId_attendClosedSession_idx";
   DROP INDEX IF EXISTS "Invitation_tenantId_eventId_email_idx";
   ```

2. **Data:** The `wishList` field is preserved, so `attendClosedSession` can be re-derived

3. **Code:** Git revert to previous version
