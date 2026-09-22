# Web App

Écrans de produits SaaS et applications web. Source : <https://checklist.design/web-app>

---

## Admin Panel

<https://checklist.design/web-app/admin-panel>

Where administrators manage users, configure the product, and oversee activity across the organisation

**Checklist**

- [ ] **Role-based access** — The admin panel visible and accessible only to users with the appropriate permissions
- [ ] **User management** — A view of all users in the organisation with the ability to invite, edit roles, and remove members
- [ ] **Organisation settings** — Controls for configuring the product at an account level — name, logo, SSO, domains
- [ ] **Usage overview** — High-level metrics on how the product is being used across the organisation, with ability to export information for reporting
- [ ] **Billing and plan management** — Access to subscription details, seat counts, and invoices at the account level
- [ ] **Audit log** — A record of account related actions taken by users e.g. logins, permission changes, deletions
- [ ] **Danger zone** — Destructive account-level actions e.g. deleting the workspace, transferring ownership
  - *Conseil :* Establish friction by visually separated this from other settings and having typed confirmation for irreversible actions

*Voir aussi :* User Management

---

## Billing

<https://checklist.design/web-app/billing>

Payment methods, invoices, and everything related to the financial side of the account

**Checklist**

- [ ] **Payment method on file** — The current card or payment method linked to the account, shown with masked details
  - *Conseil :* Last 4 digits of card are enough for the user to identify which card is in use without exposing sensitive information
- [ ] **Add or update payment method action** — A way to enter a new card or change the current one
- [ ] **Next billing date and amount** — When the next payment will be taken and for how much
  - *Conseil :* Including the plan name alongside the amount if applicable
- [ ] **Invoices and receipts** — A list of past charges with the ability to download a PDF invoice for each.
  - *Conseil :* Ensure invoices include company name, address, and VAT number — legally required in many countries and a frequent request from business users.
- [ ] **Tax and VAT (if applicable)** — Applicable tax or VAT shown on invoices and billing history
- [ ] **Failed payment recovery** — Clear messaging and recovery instructions when a payment attempt has failed
  - *Conseil :* Surface this issue prominently in the app as it can eventually restrict access if not resolve in time
- [ ] **Billing contact email** — The email address where invoices and billing notifications are sent
  - *Conseil :* For larger teams, this is often different from the account owner's email

*Voir aussi :* Billing, Billing, Pricing, Making a card payment, Paywall

---

## Onboarding

<https://checklist.design/web-app/onboarding>

A guided experience that introduces new users to the product and gets them to their first moment of value as quickly as possible

**Checklist**

- [ ] **Progress indicator** — An indication of how many steps are involved and where the user currently is in the sequence
  - *Conseil :* Every step beyond five is another opportunity to lose the user — 3 to 5 is the reliable range
- [ ] **Welcome message** — A brief message acknowledging this is a new experience and orienting the user toward what the product does.
- [ ] **Account setup** — The minimum information needed to personalise the experience, gathered at the start
  - *Conseil :* Delay any fields not genuinely needed to start using the product
- [ ] **Product highlights** — Key features introduced through short contextual tips or a visual walkthrough
  - *Conseil :* Offer a skip route for user who has seen content before or prefers to learn by doing
- [ ] **First action prompt** — A clear prompt directing the user to an action or feature
  - *Conseil :* This should be the quickest step towards a user understanding the value of the product
- [ ] **Completion confirmation** — A clear acknowledgement that setup is complete, transitioning the user into the main product

*Voir aussi :* Login

---

## Pricing

<https://checklist.design/web-app/pricing>

A pricing page breaks down costs, features and options for paying to access the product itself or a version of it.

**Checklist**

- [ ] **Plan names, prices and frequency** — The name and cost of each available plan, with billing frequency clearly stated
- [ ] **Billing period toggle** — A switch between monthly and annual billing, with the annual discount shown if applicable
- [ ] **Feature comparison (if price options)** — A side-by-side breakdown of what each plan includes and excludes
- [ ] **Call to action** — A button on each plan to start a trial, subscribe, or contact sales
- [ ] **Free tier or trial details** — What's included, how long it lasts, and what happens when it ends
  - *Conseil :* State clearly whether the account downgrades or charges automatically once the trial ends
- [ ] **FAQ section** — Answers to the most common questions about billing, plan limits, cancellation, and payment
- [ ] **Enterprise option** — A prompt for organisations that need a custom arrangement beyond the standard listed plans

*Voir aussi :* Making a card payment, Button, Canceling subscription, Card, Toggle, Badge

---

## Settings

<https://checklist.design/web-app/settings>

A screen that gives users control over their account, preferences, and application behaviour

**Checklist**

- [ ] **Structure** — Organising settings controls into logical categories e.g. account, notifications, security, billing.
  - *Conseil :* Consider elevating the most commonly changed settings rather than the most important
- [ ] **Account details** — The fields where users update their name, email address, and profile photo
- [ ] **Security details** — The ability to change the password,  two-factor authentication and other security information
  - *Conseil :* These fields should require re-authentication to save changes
- [ ] **Notification preferences** — Controls for which notifications the user receives and through which channel, grouped by type (product updates, reminders, billing)
  - *Conseil :* Grouping by type and/or platform helps reduce the chances of a user disabling all notifications rather than some
- [ ] **Billing** — Managing payment method, upgrading or cancelling a payment — this could also be a preview of this information with a link directly to the billing page if separate
- [ ] **Additional preferences (if applicable)** — Language, timezone, date format, and appearance settings like dark mode
- [ ] **Danger zone** — Destructive actions like account deletion, clearly separated from the rest of settings
  - *Conseil :* Include a confirmation step for any destructive actions, with details on what will be lost if the user continues

*Voir aussi :* Notification Settings, Account

---

## Empty State

<https://checklist.design/web-app/empty-state>

The state of a screen or component when there is no data to display, whether it's because a user is new, has cleared their content, or a search returned no results.

**Checklist**

- [ ] **Illustration or icon** — A visual that signals the empty state and gives the screen some personality, rather than feeling broken
  - *Conseil :* Visual should be contextual e.g. empty inbox and a deleted account shouldn't be the same
- [ ] **Clear heading** — A short, plain-language title naming what's missing
  - *Conseil :* 'It's empty' isn't helpful while 'No projects yet' is clear
- [ ] **Supporting description** — A brief explanation of what belongs in this space, most useful for first-time users
- [ ] **Primary action** — A CTA pointing toward the next step: creating, importing, connecting etc
  - *Conseil :* It should create the first item, not just link somewhere generic
- [ ] **Zero state vs. no-results state** — A distinction between a screen that is empty because nothing has been created versus one that returned no search or filter results
  - *Conseil :* A no-results state without a way to reset or broaden the search is a dead end — always provide an escape route
- [ ] **Error state variant** — A separate variant for when content failed to load, as opposed to genuinely being empty
  - *Conseil :* Showing an empty state when the real issue is a loading error causes users to assume they have lost their data

*Voir aussi :* Onboarding

---

## Notifications

<https://checklist.design/web-app/notifications>

An area that surfaces alerts, updates, and activity relevant to the user to help them stay informed

**Checklist**

- [ ] **Notification list** — A chronological feed of alerts, messages, and activity updates for the user.
  - *Conseil :* Date grouping (today, yesterday, this week) makes the list more scannable
- [ ] **Read and unread states** — A clear visual distinction between notifications the user has and hasn't seen
  - *Conseil :* An unread count can also appear on the icon/button that opens notifications
- [ ] **Notification type** — A visual or label indicating type e.g. mention, system alert, billing event
- [ ] **Timestamp** — A relative time for recent items e.g. 2 mins ago, a complete date and time for older ones e.g. May 14 7:08pm
- [ ] **Actions (if applicable)** — An action related to the notification event e.g. a notification that involves a direct message could have a 'reply' button
- [ ] **Mark all as read** — A single action to clear all unread indicators at once
- [ ] **Empty state** — A clear message when there are no notifications

*Voir aussi :* Notification Settings, In-App Notifications

---

## Comments

<https://checklist.design/web-app/comments>

**Checklist**

- [ ] **Anchor to context** — Comments attached to a specific piece of content (a paragraph, image, task, or row) rather than floating in a general thread
- [ ] **Reply threading** — Replies nested under the comment they respond to, keeping related discussion together without flattening into a chronological list
- [ ] **Resolve and archive (if applicable)** — A way to mark a comment thread as resolved, removing it from the active view while keeping it accessible in a history or resolved state
- [ ] **Reactions** — Emoji reactions on individual comments as a lightweight way to acknowledge without adding a reply
- [ ] **@mention element** — Mentioning a user by name notifying them directly, drawing them into the thread without requiring a separate message
  - *Conseil :* Visually distinguish this so it's clear when a user is mentioned vs their name just being written in plain text
- [ ] **Edit action** — The ability to edit a comment after posting, with a visible edited marker for transparency after saving edit
- [ ] **Delete action** — Ability to delete a comment after posting, with a confirmation modal beforehand
- [ ] **Comment count indicator** — A visible count or badge on the item being discussed, so collaborators can see where active threads exist without opening each one

*Voir aussi :* Chat

---

## 2FA

<https://checklist.design/web-app/2-factor-authentication>

A screen that guides users through setting up or completing two-factor authentication to add a second layer of security to their account

**Checklist**

- [ ] **Method selection** — Authenticator app, SMS, or email code
  - *Conseil :* Offer at least 2 methods as some users potentially don't have access to one or the other
- [ ] **Setup instructions** — Clear step-by-step guidance for completing setup, particularly for authenticator flows that require scanning a QR code
- [ ] **QR code or setup key** — A scannable QR code or copyable key for linking an authenticator app to the account
  - *Conseil :* Ensure QR code size large enough to be easy to scan
- [ ] **Verification step** — A code entry step confirming the setup was successful before 2FA is enabled on the account
  - *Conseil :* Enabling 2FA without this step risks a silent setup failure that locks the user out — a serious support burden
- [ ] **Recovery codes** — A set of one-time backup codes the user can use if they lose access to their 2FA method
  - *Conseil :* Make download or copying the code a required step before completing setup for the sake of the user
- [ ] **Setup confirmation** — A clear success state confirming that 2FA is now active on the account
- [ ] **Disable or reset option** — A way for users to turn off or reconfigure 2FA, accessible from account security settings
  - *Conseil :* Re-authentication should be required before disabling 2FA

*Voir aussi :* Login, Verifying account, Account

---

## Notification Settings

<https://checklist.design/web-app/notification-settings>

Where users configure exactly which notifications they receive, through which channels, and how frequently.

**Checklist**

- [ ] **Categories** — Notification types organised into logical groups e.g. product activity, mentions, billing, security, marketing
- [ ] **Channel selection** — Controls for which channel each notification type comes through e.g. in-app, email, push, or SMS
  - *Conseil :* Not all channels make sense for all notification types — a billing alert via push notification is rarely necessary
- [ ] **Frequency controls** — Where applicable, controls for how often notifications arrive e.g. immediately, daily digest, or weekly summary.
- [ ] **Global mute** — A way to temporarily silence all notifications without having to turn each one off individually
- [ ] **Save confirmation** — A clear indication that preference changes have been saved.
  - *Conseil :* Auto-save works well also, the key thing is ensuring the user is aware the changes are enabled as often they are customising due to preference or annoyance

*Voir aussi :* Settings, Notifications, Account

---

## Account

<https://checklist.design/web-app/account>

Where users view and manage their personal information, preferences, and account-level details

**Checklist**

- [ ] **Profile photo** — A way for users to upload or change their profile image
  - *Conseil :* Consider a sensible fallback like initials or a placeholder icon for users who haven't uploaded a photo so a profile image still exists
- [ ] **Display name** — The name shown to other users or across the product interface e.g. username, email address, first and last name
  - *Conseil :* Worth clarifying whether this is a public-facing name or an internal account label
- [ ] **Account details** — Fields for email address, phone number, job title, or other relevant identifying information based on the product and information collected
  - *Conseil :* If the information becomes extensive, it's suitable to group e.g. contact information, job history
- [ ] **Linked accounts (if applicable)** — A view of which third-party accounts are connected for sign-in or data access, with ability to disconnect
- [ ] **Save confirmation** — Clear feedback that changes have been saved, either inline or as a toast
  - *Conseil :* Auto-save with a subtle confirmation is more pleasant than explicit save, but if you want an explicit save button, it should remain disabled until there are changes
- [ ] **Delete or deactivate account** — Options to deactivate or permanently delete the account, clearly separated from other settings

*Voir aussi :* Verifying account, Deleting account, Account

---

## Help Center

<https://checklist.design/web-app/help-center>

A self-serve documentation hub where users can find answers without contacting support.

**Checklist**

- [ ] **Search with suggestions** — A prominent search input that returns relevant articles as the user types
  - *Conseil :* Autocomplete suggestions increase the chance of the user finding an answer quicker
- [ ] **Content categories** — A hierarchy of topics that lets users browse when they are not sure what to search for
  - *Conseil :* Categories that reflect how users think about the product, not internal team structure, are what make browsing work
- [ ] **Featured and popular content** — The most-viewed or most-useful articles surfaced on the help center homepage
  - *Conseil :* Popular articles shift as features change, so ensure featured content does not stay stale
- [ ] **Article formatting** — Proper heading hierarchy, screenshots, and formatted code blocks in articles where relevant
  - *Conseil :* Screenshots become outdated quickly after redesigns, so a regular review process is critical
- [ ] **Last updated date** — The date each article was last reviewed or edited, shown at the top.
  - *Conseil :* A recent date reaffirms the user that the content is up to date and valid to follow
- [ ] **Helpfulness feedback** — A simple thumbs up/down or yes/no at the end of each article to help identify if content is not helpful and needs to be reconsidered
- [ ] **Related articles** — Links to similar or adjacent articles that might answer follow-up questions

*Voir aussi :* Contact Us, Contacting support

---

## User Management

<https://checklist.design/web-app/user-management>

A screen that allows admins to view, invite, and manage the users who have access to a product or workspace.

**Checklist**

- [ ] **User list** — A table of all users showing name, email, role, and account status
  - *Conseil :* Activity information is also useful to show here to help spotlight inactive users
- [ ] **Invite user action** — A clear way to add new members by email, with an option to set their role before sending
  - *Conseil :* Depending on your average user team size, a bulk invite action is valuable to include and a common way for teams to transfer a company user base from another product
- [ ] **Roles and permissions** — The ability to assign and change what each user can see and do within the product
  - *Conseil :* Stick with universal terms like admin, member or viewer where possible, avoiding custom user titles
- [ ] **Pending invitation status** — A view of invitations sent but not yet accepted, with the option to resend or revoke
- [ ] **Search and filter** — The ability to find users quickly by name, email, role or other additional user information that applies
- [ ] **Remove or deactivate user** — A clear way to revoke access, with a distinction between temporary deactivation and permanent removal

*Voir aussi :* Account, Login, Settings, Deleting account

---

## Single Item Detail

<https://checklist.design/web-app/single-item-detail>

A screen that displays the full details of a single record — a user, order, document, or any other entity — after selecting it from a list.

**Checklist**

- [ ] **Clear title or identifier** — The name, ID, or primary label of the item, shown prominently at the top of the screen
- [ ] **Status indicator (if applicable)** — A clear signal of the item's current state (active, pending, completed, archived)
  - *Conseil :* Colour-blind users can't distinguish status by colour alone, so include a text label alongside the colour indicator to ensure it's readable
- [ ] **Key details section** — The most important attributes of the item surfaced prominently, with secondary details available below or in a sidebar
  - *Conseil :* It’s critical to exercise hierarchy here and consider what details matter more than others, and how can they be effectively grouped
- [ ] **Edit action** — A clear way to modify the item's details, either inline or via an edit mode
- [ ] **Related items or activity** — Associated records, linked content, or a history of changes related to this item
  - *Conseil :* An activity log showing who did what and when is highly valued in collaborative products
- [ ] **Breadcrumb or back navigation** — A way to return to the list or parent context
- [ ] **Destructive actions** — Delete or archive options, available on the detail screen but kept visually separate from the primary actions

*Voir aussi :* Adding to cart

---

## Public Profile

<https://checklist.design/web-app/public-profile>

The view of a user that other people in the product see, distinct from the account settings profile, which is private and editable.

**Checklist**

- [ ] **Avatar and display name** — The user's photo and name, shown prominently as the primary identifier on the profile
  - *Conseil :* A fallback avatar using initials is better than a blank space
- [ ] **Role or title** — The user's job title, team, or role within the product context, where relevant
- [ ] **Bio or description** — A short free-text description the user has written about themselves
- [ ] **Activity or contributions** — A summary of what the user has done in the product (posts, projects, comments, or other public actions)
  - *Conseil :* Surfacing activity the user hasn't chosen to make public is a privacy violation, since public profiles should only reflect what the user has explicitly opted in to show
- [ ] **Contact or follow action** — A way to initiate contact, follow, or connect with the user, depending on what the product supports
- [ ] **Joined date (optional)** — When the user joined the product
- [ ] **Profile visibility controls** — Which profile fields are visible according to the user's own privacy preferences

*Voir aussi :* Account, Settings

---

## Timeline / Gantt View

<https://checklist.design/web-app/timeline-gantt-view>

A screen that displays tasks, milestones, or events along a horizontal time axis, commonly used in project management products to show schedules and dependencies.

**Checklist**

- [ ] **Time axis** — A horizontal axis representing time, with clear date markers (days, weeks, or months depending on the zoom level)
  - *Conseil :* A timeline locked to a single timescale rarely fits all project sizes, and zoom controls let users shift between day, week, and month views as needed
- [ ] **Task bars** — Horizontal bars representing each task or milestone, positioned according to their start and end dates
  - *Conseil :* A monochrome timeline becomes hard to parse at a glance — colouring bars by status, assignee, or category makes patterns visible immediately
- [ ] **Dependencies** — Visual connectors between tasks that must be completed in sequence, showing which items are blocked by others
  - *Conseil :* Dependency lines can visually overwhelm a busy timeline, so showing them on hover or when a task is selected keeps the default view readable
- [ ] **Today indicator** — A vertical line marking the current date so users can immediately see what is on track and what is overdue
- [ ] **Milestones** — Distinct markers for key dates or deliverables that are not duration-based tasks
- [ ] **Drag to reschedule** — The ability to move or resize task bars by dragging to update dates directly on the timeline
  - *Conseil :* A date tooltip while dragging gives users precise feedback on the new start and end dates
- [ ] **Row grouping** — The ability to organise tasks by assignee, team, project phase, or another dimension

*Voir aussi :* Kanban board

---

## Feed

<https://checklist.design/web-app/feed>

A stream of content, activity, or updates that users scroll through to stay informed.

**Checklist**

- [ ] **Feed item preview** — A preview of each feed item (title, excerpt, or thumbnail) sufficient to judge whether the item is worth opening
  - *Conseil :* Variable-height items force the eye to re-adjust between each card whereas a consistent layout makes items harder to differentiate
- [ ] **Author** — The name and avatar of the person who created or posted each item
  - *Conseil :* Linking the author name to their profile is a natural interaction expectation in most social or collaborative contexts
- [ ] **Timestamps** — When each item was published or last updated
  - *Conseil :* Relative time works well for recent items, but eventually it should switch to the exact date and time
- [ ] **Engagement actions** — Ways to interact with feed items (like, comment, share, save, or react)
  - *Conseil :* Consider size of every interaction in terms of prominence and frequency of use
- [ ] **New content indicator** — A banner or button that appears when new items have been posted since the user loaded the feed
  - *Conseil :* Auto-injecting new posts while the user is reading pushes existing content down and makes scrolling janky
- [ ] **Filtering** — Controls for narrowing the feed to a specific category, content type, or followed accounts
  - *Conseil :* Always indicate when filters are active for users to understand why specific content may or may not be shown
- [ ] **Pagination or infinite scroll** — A mechanism for loading more items as the user reaches the bottom of the feed
  - *Conseil :* Pagination is suited well for work-related apps that have extensive databases
- [ ] **Empty state** — The state shown when the feed has no items to display whether due to no connections, no activity, or an empty filter result
  - *Conseil :* A first-use empty state can point towards a specific action e.g. follow people, create a post, invite a colleague

*Voir aussi :* Notifications

---

## API Keys

<https://checklist.design/web-app/api-keys>

A screen where users generate and manage API keys and other developer-facing credentials needed to integrate the product programmatically.

**Checklist**

- [ ] **Key list** — A table of all existing API keys showing name, creation date, last used date, and permissions
  - *Conseil :* Only show the last few characters after creation for identification without risk of revealing entire key
- [ ] **Generate key** — A clear way to create a new API key, with the option to give it a name and set its scope or permissions
  - *Conseil :* Unnamed keys become impossible to manage as the list grows, so requiring a name before generation is useful
- [ ] **Copy key on creation** — The full key revealed exactly once immediately after creation, with a prominent copy button
  - *Conseil :* Users need to be explicitly told this is the only time the key will be shown in full, following this it will be impossible to copy again
- [ ] **Key permissions or scopes** — The ability to limit what each key can access (read-only, specific resources, or full access)
  - *Conseil :* Least-privilege access is a security best practice, and when fine-grained scopes are easier to set than full-access, more users choose them
- [ ] **Revoke key** — A clear way to immediately invalidate a key, with a confirmation step before proceeding.
  - *Conseil :* Revocation is instant and irreversible, so the confirmation message needs to communicate this clearly, since there is no undo
- [ ] **Documentation link** — A direct link to API documentation so developers can get started without having to search for it

*Voir aussi :* Account, Settings, Integrations

---

## Search Results

<https://checklist.design/web-app/search-results>

Displaying and navigating results matching a user's query from within the product.

**Checklist**

- [ ] **Search input** — A search field at the top of the results, pre-filled with the current query so it can be refined without starting over
- [ ] **Result count** — How many results were found for the query
  - *Conseil :* Show it even at zero as it tells the user the search ran, not that something broke
- [ ] **Result items** — Each result shown with enough to identify it — title, type, image, and a snippet of the matching content
  - *Conseil :* Highlighting the matched term in the snippet confirms
- [ ] **Result type indicators** — A label or icon marking what kind of item each result is (document, person, project, message)
- [ ] **Filters** — The ability to narrow results by category, date, status, or other relevant values
- [ ] **No results state** — The state shown when a query returns no matches, ideally with suggestions for what to try instead
  - *Conseil :* Offer alternatives instead of a blank space, whether it's a suggested query or spelling change
- [ ] **Recent searches** — A list of the user's previous queries, shown when the search field is focused but empty

*Voir aussi :* Search, Filtering items, Empty State

---

## Integrations

<https://checklist.design/web-app/integrations>

A screen that shows the third-party tools and services a product can connect with, allowing users to link their existing workflows.

**Checklist**

- [ ] **Catalogue** — A browsable list or grid of all available integrations with logos, names, and a brief description of each
  - *Conseil :* Suggested to group later by installed and not installed after first integration is successfully connected
- [ ] **Categories or filtering** — A way to browse integrations by category to narrow down a large catalogue (productivity, communication, analytics, CRM)
- [ ] **Search** — A search field to find a specific integration by name without having to scroll through the full list
- [ ] **Connection status** — A clear indicator on each integration showing whether it is connected, disconnected, or connected but is experiencing an issue
  - *Conseil :* A dot is better paired with a label if you want to be explicitly clear
- [ ] **Connect and disconnect actions** — A clear way to initiate or remove a connection, with a confirmation step before disconnecting
  - *Conseil :* For disconnecting, include what will stop working in the confirmation step
- [ ] **Integration detail** — A dedicated view for each integration showing what data it accesses, configuration options, and a sync or activity log.
- [ ] **Request an integration** — A way for users to suggest tools they would like the product to support
  - *Conseil :* This doubles as a lightweight research tool as the most-requested integrations tell you exactly where to invest next.

*Voir aussi :* API Keys, Settings, Contact Us

---

## Version History

<https://checklist.design/web-app/version-history>

A screen outlining different versions of an item or experience that you can navigate between.

**Checklist**

- [ ] **Version timeline** — A list of saved versions in reverse chronological order, each labelled with a timestamp and the user who saved it
- [ ] **Named versions** — The ability to give a version a name (a milestone, a submission date, a phase label) so it is findable without scrolling through timestamps
  - *Conseil :* Autosave versions are useful for recovery, but named versions are what users actually navigate by, so making both available covers both use cases
- [ ] **Version preview** — A read-only preview of any past version, visible without committing to a restore
- [ ] **Diff or change summary** — A visual indication of what changed between two versions (added, removed, or modified content)
  - *Conseil :* A diff view reduces the time it takes to evaluate whether a version is the right one to restore
- [ ] **Restore action** — A clear way to make a past version the current one, with a confirmation step that sets expectations about what will happen to the current content
- [ ] **Autosave indicator** — A persistent, subtle indicator of when the document was last saved automatically, visible without being disruptive

*Voir aussi :* Settings, Timeline / Gantt View

---

## Multi-step form

<https://checklist.design/web-app/multi-step-form>

A form split across multiple steps or screens to reduce cognitive load when collecting a large amount of information from the user.

**Checklist**

- [ ] **Progress indicator** — A clear visual showing how many steps exist and which one the user is currently on
  - *Conseil :* Labels for each step help give context hint to future steps
- [ ] **Step heading and context** — A clear title and brief context for each step, so users know what they are being asked to provide.
- [ ] **Field grouping** — Each step containing only fields that belong together logically e.g. phone and email for contact details
- [ ] **Step-level validation** — Validation happening at each step before the user proceeds, not surfaced all at once at the end
- [ ] **Back navigation** — The ability to return to a previous step to review or change answers without losing subsequent progress
- [ ] **Save and resume** — The ability to save progress and return to the form later
  - *Conseil :* Particularly useful for forms that require information that connect be instantly provided or sourced
- [ ] **Final review step** — A summary of all entered information before final submission, giving the user a chance to review and edit
  - *Conseil :* Offer a link to each section on at this step for editing

*Voir aussi :* Submitting a form, Input Field, Button, Dropdown Menu

---

## Kanban board

<https://checklist.design/web-app/kanban-board-view>

A visual board that organises items into columns representing stages or statuses, allowing users to track and move work through a workflow.

**Checklist**

- [ ] **Columns** — Distinct vertical lanes representing each stage of the workflow (To Do, In Progress, Done, or custom stages)
  - *Conseil :* Every team structures their workflow differently, so adding, renaming, and reordering columns should be available
- [ ] **Cards** — Individual items displayed within each column, showing the title and key metadata at a glance
  - *Conseil :* Title, assignee, and due date on the card face covers most use cases without cluttering
- [ ] **Drag and drop** — The ability to move cards between columns and reorder them within a column by dragging
  - *Conseil :* A visual drop target as the card is dragged to indicate whereWithout it, users are never sure where the card will land
- [ ] **Quick add card** — A fast way to create a new card directly within a column without opening a full form
- [ ] **Card detail on click** — Clicking a card opening its full detail — description, comments, attachments, history — without leaving the board.
  - *Conseil :* Card detail in a side panel or modal rather than navigating away — losing the board context frustrates users.
- [ ] **Column item count** — A count of how many cards are in each column, visible in the column header
  - *Conseil :* A count is useful for conversations and to keep track of column amount without individually counting items
- [ ] **Filtering, sorting and grouping** — The ability to re-organise cards by assignee, label, priority, or due date to focus on a subset of work, as an example

*Voir aussi :* Filtering items, Timeline / Gantt View

---

## Chat

<https://checklist.design/web-app/chat>

A screen for real-time or asynchronous messaging between users, either one-on-one or in a group context.

**Checklist**

- [ ] **Message thread** — A chronological display of messages in the conversation, with the most recent at the bottom
  - *Conseil :* Auto-scrolling to the latest message on load is expected, but scrolling up to read history should never be interrupted by new messages arriving
- [ ] **Message input** — A text field for composing and sending messages, with support for multi-line input
  - *Conseil :* Multi-line input is often defined with Shift + Enter, with just Enter alone triggering the message to be sent
- [ ] **Sender identification** — The sender's name and avatar displayed alongside each message, making the conversation easy to follow
  - *Conseil :* Consecutive messages from the same sender typically don't need repeated name and avatar, so grouping them reduces visual clutter
- [ ] **Timestamps** — When each message was sent, using relative time for recent messages and a full timestamp for older ones
- [ ] **Read receipts** — An indicator showing whether the other participant has seen a message.
  - *Conseil :* Not all users want this level of visibility into their activity — read receipts are worth making optional where the product allows.
- [ ] **File and media sharing** — The ability to attach images, files, or links within the conversation, and show those attachments within the conversation
- [ ] **Reactions** — Emoji reactions on individual messages as a lightweight way to respond without sending a full reply

*Voir aussi :* Chat, Notifications

---

## Maintenance

<https://checklist.design/web-app/maintenance>

A screen shown when the application is temporarily unavailable due to scheduled maintenance or an unexpected outage.

**Checklist**

- [ ] **Clear status message** — A plain-language explanation that the product is currently unavailable and why
  - *Conseil :* Scheduled maintenance and unexpected outages call for different messaging, since users respond very differently to each, and conflating them feels evasive
- [ ] **Estimated return time** — When the product is expected to be back online, as specifically as possible
  - *Conseil :* Vague messages like 'back soon' frustrate users, since even a rough estimate like 'within 2 hours' is far more reassuring
- [ ] **Status page link** — A link to a live status page where users can monitor progress and see real-time updates
  - *Conseil :* A status page hosted on a separate domain remains accessible even when your main infrastructure is down
- [ ] **Contact or support link** — A way to reach support for urgent issues that cannot wait for the maintenance window to end
- [ ] **Brand consistency** — A maintenance page styled consistently with the product, even if the content is minimal
  - *Conseil :* A well-designed maintenance page communicates professionalism and reduces user anxiety

*Voir aussi :* Settings, Saving changes, 404

---

## Login

<https://checklist.design/web-app/login>

A login page is a critical component of many web applications, serving as the gateway for users to access personalized features, secure content, and their own data

**Checklist**

- [ ] **Email and password fields** — The two standard authentication inputs: an email address field and a password field.
  - *Conseil :* Pre-filling the email field after a failed login so the user only has to re-enter the password is a small detail that reduces friction
- [ ] **Show/hide password toggle** — A button alongside the password field that reveals or conceals what the user has typed
- [ ] **Forgot password** — A link that begins the password reset flow for users who cannot remember their credentials
- [ ] **Remember me** — A checkbox that persists the user's session across browser closures
- [ ] **SSO or social login** — Alternative authentication via a third-party identity provider (Google, Microsoft, GitHub) that bypasses the email/password form.
- [ ] **Sign up link** — A link to the account creation screen for users who do not yet have an account
- [ ] **Error messages** — Feedback shown when authentication fails, indicating what the user should try next

*Voir aussi :* Resetting password, Input Field, Verifying account, Button, Toast

---
