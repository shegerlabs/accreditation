# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **event accreditation management system** built with Remix, React, Prisma, and PostgreSQL. The application manages participant registrations, workflows, approvals, and badge generation for events. It supports multi-tenant architecture with role-based access control.

## Common Commands

### Development
```bash
npm run dev              # Start development server (runs server.js)
npm run build            # Build for production (Remix)
npm run build:icons      # Generate icon sprite from SVGs
npm start                # Start production server
```

### Code Quality
```bash
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run typecheck        # Run TypeScript type checking
```

### Database
```bash
npx prisma generate      # Generate Prisma Client
npx prisma db push       # Push schema changes to database
npx prisma db seed       # Seed database (runs prisma/seed.ts)
npx prisma studio        # Open Prisma Studio GUI
```

## Architecture Overview

### Multi-Tenant System
The application uses a **tenant-based architecture** where most entities are scoped to a tenant. Key models include:
- `Tenant`: Top-level organization
- `User`: Can belong to a tenant and have multiple roles
- `Event`: Scoped to tenant, represents conferences/summits
- `Participant`: Registration requests for events

### Workflow System
The application implements a **configurable approval workflow**:
- `Workflow`: Defines the approval process for each event + participant type combination
- `Step`: Individual stages in a workflow with assigned roles and actions
  - `isRejectionTarget`: Where rejected participants return to
  - `isBypassTarget`: Where bypassed participants jump to
  - `positionX`/`positionY`: Visual workflow builder coordinates
- `Approval`: Records decisions made at each step
- `WorkflowTemplate` / `StepTemplate`: Reusable workflow templates
- Actions: `APPROVE`, `REJECT`, `NOTIFY`, `PRINT`, `ARCHIVE`, `CANCEL`, `BYPASS`

The workflow engine is in `app/utils/workflow.server.ts` and processes participants through various approval steps based on their type and event.

### Request/Registration Flow
Participant registration follows a multi-step wizard pattern:
1. **New Request** (`requests+/new.tsx`): Select event and invitation
2. **General Info** (`requests+/general.tsx`): Personal details
3. **Professional Info** (`requests+/professional.tsx`): Organization details
4. **Wishlist** (`requests+/wishlist.tsx`): Special requirements (visa, car pass, etc.)
5. **Documents** (`requests+/documents.tsx`): Upload passport, photo, etc.

Draft state is persisted in the `Draft` model to allow users to save progress.

### Authentication & Authorization
- **Session-based auth** with fingerprinting for security (`app/utils/auth.server.ts`)
- **Role-based access control** with permissions linked to roles
- **Account lockout** after failed login attempts (configurable in `utils/constants.ts`)
- Auto-logout timer (1 hour inactivity) implemented in `root.tsx`

### File Structure Patterns
- **Flat Routes**: Using `remix-flat-routes` for route organization
  - `+` in folder names creates route segments
  - `__` prefix creates pathless layout routes (e.g., `__general-info-editor.tsx`)
  - `.` in filenames creates nested routes
- **Server-only files**: Use `.server.ts` suffix (automatically excluded from client bundle)
- **Conform Components**: Form field components in `app/components/conform/` wrap Radix UI with Conform validation

### UI Components
- **shadcn/ui** based components in `app/components/ui/`
- **Radix UI** primitives for accessibility
- **Tailwind CSS** for styling with dark mode support
- Icon system using sprite (`app/components/ui/icons/sprite.svg`) generated via `build:icons` script

## Key Domain Concepts

### Invitations & Quota Management
- **Invitation**: Sent to organizations to register participants for events
- **InvitationConstraint**: Per-invitation quotas (SOURCE OF TRUTH for quota management)
  - Links invitation to specific participant types with quotas
  - `quota: null` means unlimited registrations
  - `quota: N` means limited to N registrations for that type
  - If no constraints exist on invitation, ALL participant types are allowed (no restrictions)
- **Restriction** / **Constraint**: Legacy quota system (kept for backward compatibility)
- Access levels: `FREE`, `OPEN`, `CLOSED`, `ALL`

#### Quota Logic
| Scenario | Behavior |
|----------|----------|
| No InvitationConstraints | All participant types allowed (no restrictions) |
| Has InvitationConstraints | Only participant types defined in constraints are allowed |
| Constraint quota = null | Unlimited registrations for that type |
| Constraint quota = N | Limited to N registrations |
| maximumQuota on Invitation | Overall cap on total participants per invitation |

### Participant Types
Configurable types with different quotas and workflow rules:
- Can have flags like `canSendPrivateRequest`, `isExemptedFromFullQuota`
- Each type can have its own workflow for approvals
- Examples: Press/Media, Delegates, Observers

### Meetings & Venues
- Events can have multiple meetings at different venues
- Meetings have `AccessLevel` to control who can attend
- Venues store capacity and location data

### Templates
- Badge/flyer/banner/logo templates for events
- Stored as attachments linked to participant types
- Used for generating accreditation materials

## Important Patterns

### Security
- **CSRF protection** using `remix-utils/csrf` (tokens in all forms)
- **Honeypot** spam protection using `remix-utils/honeypot`
- **Helmet** for security headers in `server.js`
- **Rate limiting** with different tiers for sensitive endpoints
- **XSS prevention** using DOMPurify and xss library

### Data Loading
- Use Prisma Client from `app/utils/db.server.ts`
- Complex queries often use raw SQL for performance (see `requests+/new.tsx`)
- Always check user permissions in loaders/actions via `requireUserWithRoles()`, `requireUserWithPermission()`

#### Registration Form Data Query (`requests+/new.tsx`)
The registration form uses a single raw SQL query with CTEs to fetch all data in one round-trip:
```
┌─────────────────────────────────────────────────────────────────┐
│ CTE 1: invitation_data                                         │
│   └─> User's invitations with nested:                          │
│       ├─> participants[] (who already registered)              │
│       └─> invitationConstraints[] (quotas per participant type)│
│           └─> participantCount (computed per type)             │
├─────────────────────────────────────────────────────────────────┤
│ CTE 2: closed_session_data                                     │
│   └─> Count of participants requesting closed session access   │
├─────────────────────────────────────────────────────────────────┤
│ CTE 3: lookup_data                                             │
│   └─> Form dropdown options (participantTypes, countries, etc) │
├─────────────────────────────────────────────────────────────────┤
│ CTE 4: validation_data                                         │
│   └─> Security checks (event exists, tenant matches)           │
└─────────────────────────────────────────────────────────────────┘
```

### Email
- Azure Communication Services via `app/utils/email.server.ts`
- Email templates using `@react-email/components` in `app/components/`

### File Storage
- Azure Blob Storage integration in `app/utils/storage.server.ts`
- Documents stored as references with metadata in database
- Participant photos/passports uploaded through `ParticipantDocument` model

## Environment Variables
Required environment variables (see `.env` or `app/utils/env.server.ts`):
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: For session encryption
- `AZURE_COMMUNICATION_CONNECTION_STRING`: Email service
- `AZURE_STORAGE_CONNECTION_STRING`: Blob storage
- Node.js version: >=20.0.0 (specified in package.json engines)

## Testing Considerations
- No test runner currently configured
- When adding tests, note the MSW configuration in package.json for API mocking

## Code Style Notes
- TypeScript strict mode enabled
- Path alias `~/` maps to `app/`
- Import order: external packages → internal utils → components
- Prefer server-side validation with Zod schemas
- Use Conform for form handling with Remix actions
