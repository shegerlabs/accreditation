# Quota Management System - Complete Documentation

This document provides a comprehensive explanation of the quota management system used in the accreditation application. The quota system controls how many participants can register under an invitation, based on two dimensions: **Participant Type** and **Access Level**.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Database Model](#database-model)
3. [Two-Dimensional Quota Model](#two-dimensional-quota-model)
4. [Case 1: Creating a New Request](#case-1-creating-a-new-request-newtsx)
5. [Case 2: Editing a Rejected Request](#case-2-editing-a-rejected-request-participantid_edittsx)
6. [Case 3: Changing Type/Meeting via Edit Details Dialog](#case-3-changing-typemeeting-via-edit-details-dialog-participantid_edit-detailstsx)
7. [Quota Utility Functions](#quota-utility-functions)
8. [Common Scenarios and Examples](#common-scenarios-and-examples)
9. [Edge Cases and Gotchas](#edge-cases-and-gotchas)

---

## Core Concepts

### Invitation
An `Invitation` is sent to an organization to allow them to register participants for an event. Key fields:
- `maximumQuota`: Overall ceiling on total participants (null = unlimited)
- `invitationConstraints[]`: Per-type and per-access-level quotas

### InvitationConstraint
Defines a quota bucket for a specific combination of:
- `participantTypeId`: Which participant type (or "Any" for all types)
- `accessLevel`: `OPEN` or `CLOSED`
- `quota`: Maximum allowed (null = unlimited)

### Access Levels
- **OPEN**: Participant does NOT have "Closed Session" in their wishlist
- **CLOSED**: Participant HAS "Closed Session" in their wishlist

### The `attendClosedSession` Boolean
Stored on the `Participant` model. This boolean is **derived** from the wishlist:
- `true` if "Closed Session" meeting type is in the participant's `wishList`
- `false` otherwise

This field is **indexed** for fast quota counting queries.

---

## Database Model

```
┌──────────────────────┐       ┌──────────────────────────┐
│     Invitation       │       │  InvitationConstraint    │
├──────────────────────┤       ├──────────────────────────┤
│ id                   │──────<│ invitationId             │
│ organization         │       │ participantTypeId        │
│ email                │       │ accessLevel (OPEN/CLOSED)│
│ maximumQuota         │       │ quota                    │
│ eventId              │       └──────────────────────────┘
│ tenantId             │
└──────────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────────┐
│    Participant       │
├──────────────────────┤
│ id                   │
│ invitationId         │
│ participantTypeId    │
│ attendClosedSession  │  ◄── Derived from wishList
│ status               │
│ wishList             │
│ ...                  │
└──────────────────────┘
```

---

## Two-Dimensional Quota Model

The quota system operates on TWO dimensions:

### Dimension 1: Participant Type
- **"Any"**: The constraint applies to ALL participant types
- **Specific Type**: The constraint applies only to that exact type (e.g., "Delegate", "Press")

### Dimension 2: Access Level
- **CLOSED**: Applies to participants requesting Closed Session
- **OPEN**: Applies to participants NOT requesting Closed Session

### Quota Counting Logic

For each constraint, participants are counted if they match BOTH:
1. The participant type (or "Any" matches all types)
2. The access level (based on `attendClosedSession` boolean)

**Participants with status `REJECTED` or `CANCELLED` are ALWAYS excluded from counts.**

### Visual Example

Given these registered participants:
```
Participant A: Delegate, attendClosedSession = true  (Closed Session)
Participant B: Delegate, attendClosedSession = false (Open Session)
Participant C: Press,    attendClosedSession = true  (Closed Session)
Participant D: Press,    attendClosedSession = false (Open Session)
Participant E: Observer, attendClosedSession = false (Open Session)
```

| Constraint            | Matches                       | Count |
|-----------------------|-------------------------------|-------|
| Any, CLOSED           | A + C                         | 2     |
| Any, OPEN             | B + D + E                     | 3     |
| Delegate, CLOSED      | A                             | 1     |
| Delegate, OPEN        | B                             | 1     |
| Press, CLOSED         | C                             | 1     |
| Press, OPEN           | D                             | 1     |
| Observer, CLOSED      | (none)                        | 0     |
| Observer, OPEN        | E                             | 1     |

---

## Case 1: Creating a New Request (`new.tsx`)

**Route:** `/requests/new`
**File:** `app/routes/requests+/new.tsx`

### Who Can Create?
- **Focal persons** (role: `focal`): Must select an invitation
- **Regular users** (role: `user`): Can register themselves without invitation

### Quota Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEW REQUEST QUOTA FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Is user a focal person?                                     │
│     ├── NO: No quota validation (user registers themselves)     │
│     └── YES: Continue to step 2                                 │
│                                                                 │
│  2. Did focal select an invitation?                             │
│     ├── NO: Error - "Select an invitation"                      │
│     └── YES: Continue to step 3                                 │
│                                                                 │
│  3. Check maximumQuota (overall ceiling)                        │
│     ├── maximumQuota is null: Skip (unlimited)                  │
│     └── Count active participants under invitation              │
│         └── If count >= maximumQuota: BLOCKED                   │
│                                                                 │
│  4. Check invitationConstraints                                 │
│     ├── No constraints: ALLOWED (no restrictions)               │
│     └── Has constraints: Continue to step 5                     │
│                                                                 │
│  5. Find applicable constraints for selected participantType    │
│     ├── Constraints with participantType.name = "Any"           │
│     └── Constraints with matching participantTypeId             │
│                                                                 │
│  6. No applicable constraints found?                            │
│     └── BLOCKED: "This participant type is not allowed"         │
│                                                                 │
│  7. Determine access level request                              │
│     └── Is "Closed Session" in selected meetings?               │
│         ├── YES: Match CLOSED constraints                       │
│         └── NO: Match OPEN constraints                          │
│                                                                 │
│  8. Check if ANY applicable constraint has available quota      │
│     ├── quota = null: ALLOWED (unlimited)                       │
│     ├── count < quota AND access level matches: ALLOWED         │
│     └── All constraints full: BLOCKED                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Loader Data (SQL Query)

The loader uses a complex raw SQL query with CTEs to fetch all data in one round-trip:

```sql
-- Each invitation constraint gets a participantCount computed:
'participantCount', CASE
    -- For "Any" participant type: use total counts (all types)
    WHEN participantType.name = 'Any' THEN
        CASE
            WHEN accessLevel = 'CLOSED' THEN closedCount
            ELSE openCount
        END
    -- For specific participant type: use type-specific counts
    ELSE
        CASE
            WHEN accessLevel = 'CLOSED' THEN typeClosedCount
            ELSE typeOpenCount
        END
END
```

### Action Validation (Lines 788-975)

The action performs validation in this order:

1. **maximumQuota check**: Count all active participants under invitation
2. **Constraint applicability**: Find constraints matching type or "Any"
3. **Access level determination**: Check if "Closed Session" is in meetings
4. **Quota availability**: At least ONE matching constraint must have room

### Key Code Section

```typescript
// Batch fetch ALL participant counts in a single query (eliminates N+1)
const participantCounts = await prisma.participant.groupBy({
    by: ['participantTypeId', 'attendClosedSession'],
    where: {
        invitationId: data.invitationId,
        status: { notIn: ['REJECTED', 'CANCELLED'] },  // ← Key exclusion
    },
    _count: { id: true },
})

// Check each applicable constraint
for (const constraint of applicableConstraints) {
    // If quota is unlimited, this constraint has space
    if (constraint.quota === null) {
        hasAvailableQuota = true
        break
    }

    // Determine if constraint matches access level request
    const isClosedConstraint = constraint.accessLevel === 'CLOSED'
    const constraintMatchesRequest =
        (isRequestingClosed && isClosedConstraint) ||
        (!isRequestingClosed && !isClosedConstraint)

    // Count and check quota
    if (currentCount < constraint.quota && constraintMatchesRequest) {
        hasAvailableQuota = true
        break
    }
}
```

---

## Case 2: Editing a Rejected Request (`$participantId_.edit.tsx`)

**Route:** `/requests/:participantId/edit`
**File:** `app/routes/requests+/$participantId_.edit.tsx`

### Preconditions
- Participant MUST have `status = 'REJECTED'`
- User must own the participant (same `userId`)
- Both focal persons and regular users can edit their rejected requests

### What Can Be Changed?
- ALL participant fields (name, passport, etc.)
- Participant type (if allowed by constraints)
- Meeting wishlist

### Quota Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│               EDIT REJECTED REQUEST QUOTA FLOW                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Is there an invitation linked?                              │
│     ├── NO: No quota validation needed                          │
│     └── YES: Continue to step 2                                 │
│                                                                 │
│  2. Did participant type change?                                │
│     ├── YES: Reset meetings to empty, attendClosedSession=false │
│     └── NO: Keep existing meetings selection                    │
│                                                                 │
│  3. Compute new attendClosedSession                             │
│     └── Is "Closed Session" in effective meetings list?         │
│                                                                 │
│  4. Validate with validateQuotaForTypeChange()                  │
│     └── IMPORTANT: Excludes current participant from counts!    │
│                                                                 │
│  5. Check result                                                 │
│     ├── allowed: true → Proceed with update                     │
│     └── allowed: false → Show error message                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Special Handling for Type Change

When participant type changes, meetings are reset:

```typescript
// Check if participant type changed - if so, reset meetings
const participantTypeChanged = originalParticipant?.participantTypeId !== formValues.participantTypeId
// If type changed, reset meetings to empty
const effectiveMeetings = participantTypeChanged ? [] : (formValues.meetings ?? [])
```

### Loader: Closed Session Availability Check

The loader checks if Closed Session can be selected:

```typescript
// Check if Closed Session quota is still available for this participant
// (excluding themselves from the count since they're being edited)
const canSelectClosedSession = await isClosedSessionQuotaAvailable({
    participantId: participant.id,
    invitationId: participant.invitationId,
    participantTypeId: participant.participantTypeId,
})
```

### UI Restriction for Closed Session

```typescript
// Closed Session: only show if:
// 1. Participant previously had it selected, AND
// 2. Quota is still available
if (meetingType.name === 'Closed Session') {
    return (
        participant.wishList.includes(meetingType.id) &&
        canSelectClosedSession
    )
}
```

**Important:** Users CANNOT add new Closed Session access during edit; they can only keep existing if quota is still available.

### Action Validation (Lines 446-483)

```typescript
// Validate quota for the new type and access level
if (participant.invitationId) {
    const quotaCheck = await validateQuotaForTypeChange({
        participantId: participant.id,          // ← Current participant ID
        invitationId: participant.invitationId,
        newParticipantTypeId: data.participantTypeId,
        newAttendClosedSession,
    })

    if (!quotaCheck.allowed) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: quotaCheck.reason ?? 'Quota exceeded for the selected participant type.',
        })
    }
}
```

---

## Case 3: Changing Type/Meeting via Edit Details Dialog (`$participantId_.edit-details.tsx`)

**Route:** `/requests/:participantId/edit-details`
**File:** `app/routes/requests+/$participantId_.edit-details.tsx`

### Purpose
Allows focal persons to change participant type and meeting preferences for ANY participant (not just rejected ones), without going through full rejection/resubmission.

### Preconditions
- User must be a focal person (`role: focal`)
- User must own the participant (`participant.userId === user.id`)

### What Can Be Changed?
- Participant type
- Meeting wishlist (determines `attendClosedSession`)

### Quota Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│             EDIT DETAILS DIALOG QUOTA FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Focal person selects new participant type                   │
│                                                                 │
│  2. Focal person selects meeting types                          │
│     └── Check if "Closed Session" is among selected             │
│                                                                 │
│  3. Validate with validateQuotaForTypeChange()                  │
│     └── Excludes current participant from counts                │
│                                                                 │
│  4. Check result                                                 │
│     ├── allowed: true → Update participant                      │
│     └── allowed: false → Show error with specific reason        │
│                                                                 │
│  5. Update participant with:                                    │
│     ├── participantTypeId                                       │
│     ├── wishList (comma-separated meeting IDs)                  │
│     └── attendClosedSession (derived boolean)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Loader: Quota Usage Display

```typescript
const quotaUsage = await getQuotaUsage(participant.id, participant.invitationId)

// Returns:
type QuotaUsageInfo = {
    maximumQuota: number | null  // Overall cap
    totalUsed: number            // Total active participants
    constraints: QuotaConstraintRow[]  // Per-constraint usage
}
```

### Loader: Allowed Participant Types

Only types that are allowed by constraints are shown:

```typescript
const participantTypes = await getAllowedParticipantTypes({
    invitationId: participant.invitationId,
    tenantId: participant.tenantId,
})
```

### Action Validation (Lines 152-206)

```typescript
// Determine if "Closed Session" is among the selected meeting types
const attendClosedSession = meetingTypesValues.length
    ? Boolean(
            await prisma.meetingType.findFirst({
                where: {
                    tenantId: participant.tenantId,
                    name: 'Closed Session',
                    id: { in: meetingTypesValues },
                },
            }),
        )
    : false

// Check quota before proceeding
const quotaCheck = await validateQuotaForTypeChange({
    participantId: participant.id,
    invitationId: participant.invitationId,
    newParticipantTypeId: participantTypeId,
    newAttendClosedSession: attendClosedSession,
})

if (!quotaCheck.allowed) {
    return json({
        result: submission.reply({
            formErrors: [quotaCheck.reason ?? 'Quota exceeded...'],
        }),
    }, { status: 400 })
}
```

### UI: Quota Usage Alert

The dialog displays current quota usage:

```tsx
<QuotaUsageAlert quotaUsage={quotaUsage} />

// Shows:
// - Per-constraint usage: "Delegate (CLOSED): 3 / 5"
// - Overall usage: "Overall: 10 / 15"
// - Warning if at or near limit
```

---

## Quota Utility Functions

**File:** `app/utils/quota.server.ts`

### `getQuotaUsage(participantId, invitationId)`

Returns current quota usage for display purposes.

**Logic:**
1. Fetch invitation with constraints and participants
2. For each constraint, count matching participants
3. Return aggregated usage info

**Excludes:** `REJECTED` and `CANCELLED` participants

### `validateQuotaForTypeChange(params)`

Validates if a type/access-level change is allowed.

**Parameters:**
```typescript
{
    participantId: string       // Current participant (excluded from count)
    invitationId: string | null
    newParticipantTypeId: string
    newAttendClosedSession: boolean
}
```

**Returns:**
```typescript
{ allowed: boolean; reason?: string }
```

**Logic:**
1. No invitation → always allowed
2. Check if matching constraints exist (type + access level)
3. If no matching constraints → BLOCKED (no quota allocated)
4. Count participants per constraint (excluding current)
5. If any constraint has room → allowed
6. Also check maximumQuota

### `getAllowedParticipantTypes(params)`

Returns participant types allowed for an invitation.

**Logic:**
1. No invitation → return all tenant types
2. No constraints → return all tenant types
3. Has "Any" constraint → return all tenant types
4. Has specific constraints → return only those types

### `isClosedSessionQuotaAvailable(params)`

Checks if a participant can select Closed Session access.

**Logic:**
1. Find CLOSED constraints for the participant type
2. If no CLOSED constraints exist → not available
3. If any CLOSED constraint has unlimited quota → available
4. If any CLOSED constraint has room → available
5. Otherwise → not available

---

## Common Scenarios and Examples

### Scenario 1: No Constraints (Free Registration)

**Setup:**
- Invitation with no `invitationConstraints`
- `maximumQuota = null`

**Result:**
- All participant types allowed
- Unlimited registrations
- Any access level allowed

### Scenario 2: Simple Type-Based Quota

**Setup:**
```
InvitationConstraints:
- Delegate, OPEN, quota: 5
- Press, OPEN, quota: 3
```

**Result:**
- Only Delegate and Press types allowed
- Max 5 Delegates with OPEN access
- Max 3 Press with OPEN access
- Closed Session not available (no CLOSED constraints)

### Scenario 3: Type + Access Level Quota

**Setup:**
```
InvitationConstraints:
- Delegate, OPEN, quota: 10
- Delegate, CLOSED, quota: 2
- Press, OPEN, quota: 5
- Press, CLOSED, quota: 1
```

**Result:**
- Delegates: 10 Open + 2 Closed
- Press: 5 Open + 1 Closed
- Total possible: 18 participants

### Scenario 4: "Any" Type Constraints

**Setup:**
```
InvitationConstraints:
- Any, OPEN, quota: 20
- Any, CLOSED, quota: 5
```

**Result:**
- All participant types allowed
- Max 20 participants with OPEN access (combined)
- Max 5 participants with CLOSED access (combined)

### Scenario 5: Mixed "Any" and Specific Types

**Setup:**
```
InvitationConstraints:
- Any, OPEN, quota: 10
- VIP, CLOSED, quota: 2
```

**Result:**
- All types get max 10 OPEN slots (shared)
- Only VIP type can get CLOSED access (max 2)
- Other types cannot select Closed Session

### Scenario 6: Swapping Closed Session Between Participants

**Use Case:** Focal person wants to give Closed Session access to Participant B instead of Participant A.

**Steps:**
1. Open edit-details for Participant A
2. Uncheck "Closed Session" → saves with attendClosedSession = false
3. Open edit-details for Participant B
4. Check "Closed Session" → quota validation passes (A's slot is now free)
5. Save → Participant B now has attendClosedSession = true

### Scenario 7: Changing Type Releases Quota

**Setup:**
```
InvitationConstraints:
- Delegate, OPEN, quota: 3 (currently 3 used - FULL)
- Observer, OPEN, quota: 5 (currently 2 used)
```

**Participant A:** Currently Delegate (OPEN)

**Action:** Change Participant A from Delegate to Observer

**Result:**
- Validation excludes Participant A from count
- Delegate count: 2 (room for change)
- Observer count: 2 (room available)
- Change allowed
- After save: Delegate = 2, Observer = 3

---

## Edge Cases and Gotchas

### 1. Participant Excluded From Own Count

When editing, the current participant is **always excluded** from quota counts. This prevents false "quota full" errors when a participant just wants to keep their current type.

```typescript
// In validateQuotaForTypeChange:
where: {
    id: { not: participantId },  // ← Exclude self
    status: { notIn: ['REJECTED', 'CANCELLED'] },
}
```

### 2. Type Change Resets Meetings

When participant type changes during edit, meetings are reset to prevent invalid state:

```typescript
const effectiveMeetings = participantTypeChanged ? [] : (formValues.meetings ?? [])
```

This means changing type automatically sets `attendClosedSession = false`.

### 3. No Matching Constraints = Blocked

If constraints exist but none match the requested type + access level combination, the request is **blocked**:

```typescript
if (matchingConstraints.length === 0) {
    return {
        allowed: false,
        reason: `No quota allocated for this participant type with ${newAccessLevel} access level.`,
    }
}
```

### 4. Unlimited vs Zero Quota

- `quota = null` → Unlimited
- `quota = 0` → Treated as unlimited (legacy behavior)

### 5. maximumQuota is Separate

The `maximumQuota` on invitation is checked **independently** of constraint quotas:

```typescript
// Check overall cap
if (maximumQuota && maximumQuota > 0) {
    if (participants.length + 1 > maximumQuota) {
        return { allowed: false, reason: 'Overall invitation quota exceeded...' }
    }
}
```

### 6. Status Filter Always Applied

All quota counts exclude `REJECTED` and `CANCELLED`:

```typescript
status: { notIn: ['REJECTED', 'CANCELLED'] }
```

This allows rejected participants to resubmit without counting against quota.

### 7. "Any" Constraint Behavior

An "Any" constraint counts ALL participants regardless of type:

```typescript
const isAnyType = constraint.participantType.name === 'Any'
// If Any: count ALL participants with matching access level
// If specific: count only that type with matching access level
```

### 8. Closed Session UI Restriction

In the edit form, users can only **keep** existing Closed Session, not add new:

```typescript
if (meetingType.name === 'Closed Session') {
    return (
        participant.wishList.includes(meetingType.id) &&  // Had it before
        canSelectClosedSession                             // Still has room
    )
}
```

This prevents race conditions where quota fills between form load and submit.

---

## Summary Table

| Scenario | File | Excludes Self? | Validates Type? | Validates Access? | Resets Meetings? |
|----------|------|----------------|-----------------|-------------------|------------------|
| New Request | `new.tsx` | N/A (new) | Yes | Yes | N/A |
| Edit Rejected | `$participantId_.edit.tsx` | Yes | Yes | Yes | Yes (on type change) |
| Edit Details | `$participantId_.edit-details.tsx` | Yes | Yes | Yes | No |

---

## Related Files

- `app/routes/requests+/new.tsx` - New registration with quota validation
- `app/routes/requests+/$participantId_.edit.tsx` - Edit rejected requests
- `app/routes/requests+/$participantId_.edit-details.tsx` - Edit details dialog
- `app/utils/quota.server.ts` - Quota validation utilities
- `prisma/schema.prisma` - Database models

---

*Last updated: 2026-02-08*
