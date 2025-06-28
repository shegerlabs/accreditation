# **Event Management Prisma Schema Documentation**

This document provides a comprehensive overview of the Prisma schema for the
event management platform. The schema is designed to support event creation and
management, including entities such as users, events, venues, categories,
templates, and media. Below is a detailed explanation of each part of the
schema, organized for clarity and ease of understanding.

---

## **Table of Contents**

1. [Enums](#enums)
   - [RecurrencePattern](#recurrencepattern)
   - [EventStatus](#eventstatus)
   - [MediaType](#mediatype)
   - [AttendeeStatus](#attendeestatus)
   - [TemplateVisibility](#templatevisibility)
   - [FieldType](#fieldtype)
2. [Models](#models)
   - [User](#user)
   - [UserImage](#userimage)
   - [Password](#password)
   - [Category](#category)
   - [Venue](#venue)
   - [VenueImage](#venueimage)
   - [EventOrganizer](#eventorganizer)
   - [EventTemplate](#eventtemplate)
   - [TemplateSection](#templatesection)
   - [TemplateField](#templatefield)
   - [FieldOption](#fieldoption)
   - [TemplateChangeLog](#templatechangelog)
   - [Event](#event)
   - [EventVenue](#eventvenue)
   - [EventMedia](#eventmedia)
   - [EventCategory](#eventcategory)
3. [Indexing and Relations](#indexing-and-relations)
4. [Schema Diagram](#schema-diagram)
5. [Conclusion](#conclusion)

---

## **Enums**

### **RecurrencePattern**

Defines the patterns for recurring events.

- **Values:**
  - `NONE`
  - `DAILY`
  - `WEEKLY`
  - `MONTHLY`
  - `YEARLY`

### **EventStatus**

Represents the publication status of an event.

- **Values:**
  - `DRAFT`
  - `PUBLISHED`
  - `CANCELED`

### **MediaType**

Specifies the type of media associated with an event or venue.

- **Values:**
  - `IMAGE`
  - `VIDEO`

### **AttendeeStatus**

Indicates the status of an attendee's registration (not fully utilized in the
current schema).

- **Values:**
  - `CONFIRMED`
  - `CANCELED`
  - `PENDING`
  - `REQUESTED`
  - `DECLINED`
  - `UNKNOWN`

### **TemplateVisibility**

Determines the visibility level of an event template.

- **Values:**
  - `PRIVATE` - Only accessible by the creator.
  - `TEAM` - Accessible by the creator's team.
  - `PUBLIC` - Accessible by all users.

### **FieldType**

Defines the types of fields that can be used in an event template.

- **Values:**
  - `TEXT`
  - `NUMBER`
  - `DATE`
  - `TIME`
  - `DATETIME`
  - `BOOLEAN`
  - `SELECT`
  - `MULTISELECT`
  - `IMAGE`
  - `VIDEO`
  - `RICHTEXT`

---

## **Models**

### **User**

Represents a user of the platform.

- **Fields:**

  - `id` _(String)_: Unique identifier, defaulted to a cuid.
  - `email` _(String)_: User's email address, unique.
  - `username` _(String)_: User's username, unique.
  - `name` _(String?)_: User's full name, optional.
  - `createdAt` _(DateTime)_: Timestamp of creation, defaults to now.
  - `updatedAt` _(DateTime)_: Timestamp of last update, auto-updated.
  - `image` _(UserImage?)_: Relation to user's profile image, optional.
  - `password` _(Password?)_: Relation to user's password hash, optional.
  - `organizer` _(EventOrganizer?)_: Relation to organizer profile, optional.
  - `templates` _(EventTemplate[])_: List of event templates created by the
    user.

- **Relations:**
  - `eventsCreated` _(Event[])_: Events created by the user.
  - `eventsUpdated` _(Event[])_: Events updated by the user.
  - `eventsDeleted` _(Event[])_: Events deleted by the user.

### **UserImage**

Stores profile images for users.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `altText` _(String?)_: Alternative text for the image.
  - `contentType` _(String)_: MIME type of the image.
  - `blob` _(Bytes)_: Binary data of the image.
  - `userId` _(String)_: Foreign key to the associated user.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `user` _(User)_: The user the image belongs to.

### **Password**

Stores hashed passwords for users.

- **Fields:**

  - `hash` _(String)_: The hashed password.
  - `userId` _(String)_: Foreign key to the associated user.

- **Relations:**
  - `user` _(User)_: The user the password belongs to.

### **Category**

Represents categories for organizing events.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the category.
  - `description` _(String?)_: Description of the category.
  - `parentId` _(String?)_: Foreign key to the parent category, optional.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `parent` _(Category?)_: Parent category.
  - `subcategories` _(Category[])_: Subcategories under this category.
  - `events` _(EventCategory[])_: Events associated with this category.

### **Venue**

Represents event venues.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the venue.
  - `description` _(String?)_: Description of the venue.
  - `contactInfo` _(String?)_: Contact information.
  - `address` _(String)_: Street address.
  - `city` _(String)_: City.
  - `state` _(String)_: State or province.
  - `zip` _(String)_: ZIP or postal code.
  - `country` _(String)_: Country.
  - `capacity` _(Int)_: Maximum capacity.
  - `latitude` _(Float?)_: Latitude coordinate.
  - `longitude` _(Float?)_: Longitude coordinate.
  - `amenities` _(String?)_: Amenities available.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `events` _(EventVenue[])_: Events held at this venue.
  - `images` _(VenueImage[])_: Images of the venue.

### **VenueImage**

Stores images for venues.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `altText` _(String?)_: Alternative text for the image.
  - `contentType` _(String)_: MIME type of the image.
  - `blob` _(Bytes)_: Binary data of the image.
  - `venueId` _(String)_: Foreign key to the associated venue.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `venue` _(Venue)_: The venue the image belongs to.

### **EventOrganizer**

Represents organizers of events.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the organizer or organization.
  - `email` _(String)_: Contact email.
  - `phone` _(String)_: Contact phone number.
  - `website` _(String?)_: Website URL.
  - `userId` _(String)_: Foreign key to the associated user.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `user` _(User)_: The user profile associated with the organizer.
  - `events` _(Event[])_: Events organized by this organizer.

### **EventTemplate**

Represents templates for creating events.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the template.
  - `description` _(String?)_: Description of the template.
  - `version` _(Int)_: Version number, defaults to 1.
  - `createdById` _(String)_: Foreign key to the creator.
  - `visibility` _(TemplateVisibility)_: Visibility level of the template.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `createdBy` _(User)_: User who created the template.
  - `sections` _(TemplateSection[])_: Sections within the template.
  - `changeLogs` _(TemplateChangeLog[])_: Change logs for version tracking.

### **TemplateSection**

Represents sections within an event template.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the section.
  - `position` _(Int)_: Position/order within the template.
  - `eventTemplateId` _(String)_: Foreign key to the parent template.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `eventTemplate` _(EventTemplate)_: The template this section belongs to.
  - `fields` _(TemplateField[])_: Fields within this section.

### **TemplateField**

Represents fields within a template section.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the field.
  - `fieldType` _(FieldType)_: Type of the field.
  - `isRequired` _(Boolean)_: Whether the field is required.
  - `position` _(Int)_: Position/order within the section.
  - `templateSectionId` _(String)_: Foreign key to the parent section.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `templateSection` _(TemplateSection)_: The section this field belongs to.
  - `options` _(FieldOption[])_: Options for select-type fields.

### **FieldOption**

Represents options for select or multiselect fields.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `label` _(String)_: Display label for the option.
  - `value` _(String)_: Value stored when the option is selected.
  - `templateFieldId` _(String)_: Foreign key to the parent field.

- **Relations:**
  - `templateField` _(TemplateField)_: The field this option belongs to.

### **TemplateChangeLog**

Tracks changes made to event templates.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `eventTemplateId` _(String)_: Foreign key to the template.
  - `version` _(Int)_: Version number after the change.
  - `timestamp` _(DateTime)_: Timestamp of the change.
  - `changes` _(String)_: Description of the changes made.

- **Relations:**
  - `eventTemplate` _(EventTemplate)_: The template this change log belongs to.

### **Event**

Represents an event.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `name` _(String)_: Name of the event.
  - `description` _(String)_: Description of the event.
  - `organizerId` _(String)_: Foreign key to the organizer.
  - `status` _(EventStatus)_: Publication status of the event.
  - `isRecurring` _(Boolean)_: Indicates if the event is recurring.
  - `maxAttendees` _(Int?)_: Maximum number of attendees, optional.
  - `slug` _(String)_: SEO-friendly identifier, unique.
  - `isDeleted` _(Boolean)_: Flag to indicate soft deletion, defaults to false.
  - `deletedAt` _(DateTime?)_: Timestamp of deletion, optional.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `organizer` _(EventOrganizer)_: Organizer of the event.
  - `createdBy` _(User)_: User who created the event.
  - `updatedBy` _(User?)_: User who last updated the event.
  - `deletedBy` _(User?)_: User who deleted the event.
  - `venues` _(EventVenue[])_: Venues where the event is held.
  - `categories` _(EventCategory[])_: Categories associated with the event.
  - `media` _(EventMedia[])_: Media files associated with the event.

### **EventVenue**

Associates events with venues and schedules.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `eventId` _(String)_: Foreign key to the event.
  - `venueId` _(String)_: Foreign key to the venue.
  - `startDate` _(DateTime)_: Start date and time.
  - `endDate` _(DateTime)_: End date and time.
  - `recurrencePattern` _(RecurrencePattern?)_: Recurrence pattern, optional.
  - `recurrenceDetails` _(Json?)_: Additional recurrence details, optional.
  - `timezone` _(String?)_: Timezone for the event occurrence.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**

  - `event` _(Event)_: The event occurring at the venue.
  - `venue` _(Venue)_: The venue where the event is held.

- **Constraints:**
  - Unique combination of `eventId`, `venueId`, `startDate`, and `endDate`.

### **EventMedia**

Stores media files associated with events.

- **Fields:**

  - `id` _(String)_: Unique identifier.
  - `altText` _(String?)_: Alternative text for the media.
  - `description` _(String?)_: Description of the media.
  - `url` _(String)_: URL to the media file.
  - `mediaType` _(MediaType)_: Type of media.
  - `eventId` _(String)_: Foreign key to the event.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**
  - `event` _(Event)_: The event the media is associated with.

### **EventCategory**

Join table associating events with categories.

- **Fields:**

  - `eventId` _(String)_: Foreign key to the event.
  - `categoryId` _(String)_: Foreign key to the category.
  - `createdAt` _(DateTime)_: Timestamp of creation.
  - `updatedAt` _(DateTime)_: Timestamp of last update.

- **Relations:**

  - `event` _(Event)_: The event associated with the category.
  - `category` _(Category)_: The category associated with the event.

- **Constraints:**
  - Unique combination of `eventId` and `categoryId`.

---

## **Indexing and Relations**

- **Indexes:**

  - `Event` model has indexes on `name` and `status` for efficient querying.

- **Relations Overview:**
  - **User** ↔ **EventOrganizer**: One-to-one relation; a user can be an
    organizer.
  - **User** ↔ **EventTemplate**: One-to-many; a user can create multiple
    templates.
  - **EventTemplate** ↔ **TemplateSection**: One-to-many; a template has
    multiple sections.
  - **TemplateSection** ↔ **TemplateField**: One-to-many; a section has
    multiple fields.
  - **TemplateField** ↔ **FieldOption**: One-to-many; a field can have multiple
    options.
  - **EventTemplate** ↔ **TemplateChangeLog**: One-to-many; tracks changes to
    the template.
  - **Event** ↔ **EventVenue**: One-to-many; an event can occur at multiple
    venues.
  - **Event** ↔ **EventCategory**: Many-to-many via `EventCategory`.
  - **Event** ↔ **EventMedia**: One-to-many; events can have multiple media
    files.
  - **Event** ↔ **User**: Users can create, update, or delete events.
  - **Venue** ↔ **EventVenue**: One-to-many; a venue can host multiple events.
  - **Venue** ↔ **VenueImage**: One-to-many; a venue can have multiple images.
  - **Category** ↔ **EventCategory**: Many-to-many via `EventCategory`.
  - **Category** ↔ **Category**: Self-referential relation for parent and
    subcategories.

---

## **Schema Diagram**

Below is a simplified representation of the schema's relationships:

```
User
 ├─ EventOrganizer
 ├─ EventTemplate
 │   ├─ TemplateSection
 │       ├─ TemplateField
 │           ├─ FieldOption
 │   └─ TemplateChangeLog
 ├─ Event (createdBy, updatedBy, deletedBy)
 └─ Password

Event
 ├─ EventVenue
 │   ├─ Venue
 │       └─ VenueImage
 ├─ EventCategory
 │   └─ Category (parent, subcategories)
 └─ EventMedia

Category
 └─ EventCategory

Venue
 ├─ EventVenue
 └─ VenueImage
```

---
