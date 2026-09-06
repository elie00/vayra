# Mobile App

Écrans et patterns d'applications mobiles natives. Source : <https://checklist.design/mobile>

---

## Action Sheet

<https://checklist.design/mobile/action-sheet>

The sheet that slides up from the bottom of the screen to present options or confirmations — the mobile equivalent of a dropdown menu or modal dialog.

**Checklist**

- [ ] **Heading and actions** — Similar to modals, there must be a clear heading outline the purpose of the action sheet, along with relevant actions the user can select to continue
- [ ] **Swipe or backdrop dismiss** — The sheet is dismissible by dragging it down or tapping the dimmed area behind it, along with the expected close button
- [ ] **Destructive action styling** — Any destructive option — delete, remove, block — styled in red and positioned last, separated from safe actions.
  - *Conseil :* Users scan top-to-bottom and tap quickly — a destructive action buried at the bottom prevents accidental taps.
- [ ] **Cancel action** — A clearly labelled cancel/close option that dismisses the sheet without taking any action
  - *Conseil :* Typically the secondary action, similar to a desktop modal
- [ ] **Snap points (if expandable)** — Defining where the action sheet expands or compresses to on resize, instead of it being free-form
  - *Conseil :* A drag handle at the top of the sheet indicates the action sheet can be expanded (or dismissed)
- [ ] **Content scrollability** — Consider what stickies as you scroll so the sheet remains contextual, and that the sheet stays fixed in position on scroll
  - *Conseil :* Similar to modals, it's best to avoid scrollability here unless you cannot avoid it
- [ ] **Keyboard relation** — Consider the action sheet size and responsiveness if keyboard needs to be triggered while it is active
- [ ] **Backdrop dimming** — The screen behind darkened to draw focus to the action sheet

*Voir aussi :* Settings, Empty State, Modal

---

## Paywall

<https://checklist.design/mobile/paywall>

A hard gate that blocks access to locked content and offers a path to subscribe.

**Checklist**

- [ ] **Locked feature context and breakdown** — A clear statement or short list of which specific feature/s the user is being blocked from accessing
- [ ] **Upgrade CTA** — The primary action to start a subscription or free trial, positioned prominently on the paywall screen
  - *Conseil :* Be specific with what is unlocked e.g. "Unlock unlimited projects" or "Access full library"
- [ ] **Free trial offer** — A clear statement of any trial period available before subscription billing begins.
  - *Conseil :* 'Try free for 7 days' framed as low-commitment is consistently one of the highest-converting messages on a paywall.
- [ ] **Dismiss action** — A clear, neutral way to close the paywall and return to the free experience
  - *Conseil :* This should be obvious and accessible for the user to do
- [ ] **Restore purchases** — A way for existing subscribers to recover their access after reinstalling or signing in on a new device
- [ ] **No guilt language** — Dismiss and decline actions written in neutral language, without shaming or pressuring users into subscribing
  - *Conseil :* 'No thanks, I don't want to save money' is manipulative and unnecessary

*Voir aussi :* Billing, Making a card payment, Billing

---

## Onboarding

<https://checklist.design/mobile/onboarding>

The first-run experience that orients a new user, collects necessary setup information, and delivers an early sense of the app value

**Checklist**

- [ ] **Steps** — The number of steps in the onboarding flow, limited to what is genuinely required before the app can be used
  - *Conseil :* Steps that can be deferred without preventing the app from functioning on day one consistently belong later, not in onboarding
- [ ] **Progress indicator** — A clear indication of how many steps remain and where in the sequence the user currently is
  - *Conseil :* Users who can see the end of onboarding are significantly less likely to abandon it than those who feel they are in a tunnel
- [ ] **Step navigation** — A clear mechanism for advancing through steps e.g. a 'next' button or a horizontal swipe gesture
- [ ] **Contextual permissions** — Permissions surfaced at their contextually relevant moment within onboarding, rather than grouped at the start
  - *Conseil :* Grouping all permission requests at the beginning can lead to denials given lack of context
- [ ] **Skip option** — A visible way to exit onboarding early and explore the app, with setup available to complete later
  - *Conseil :* Users who skip and explore freely often complete setup voluntarily once they understand the value
- [ ] **Personalisation step** — One or two choices that make the app feel tailored from the start e.g. your name, interests, a key piece of information that applies to the product
- [ ] **Keyboard handling** — Views that adjust correctly when the keyboard appears, appropriate keyboard types per field, and Next advancing to the following input

*Voir aussi :* Onboarding, Invite

---

## Account

<https://checklist.design/mobile/account>

Private account settings like credentials, linked accounts, notifications, and destructive actions.

**Checklist**

- [ ] **Email** — The current email address displayed with an option to update it
  - *Conseil :* Verifying the new address before completing the change is standard practice, where notifying the old address too adds a useful security signal.
- [ ] **Password change** — A way for users to update their account password.
  - *Conseil :* Requiring the current password before accepting a new one prevents unauthorised changes on an unlocked device
- [ ] **Linked accounts** — A view of which third-party accounts are connected for sign-in or data access, with ability to disconnect
- [ ] **Save confirmation** — Clear feedback that changes have been saved, either inline or as a toast
  - *Conseil :* Auto-save with a subtle confirmation is more pleasant than explicit save, but if you want an explicit save button, it should remain disabled until there are changes
- [ ] **Delete or deactivate account** — Options to deactivate or permanently delete the account, clearly separated from other settings

*Voir aussi :* Login, Settings, Billing, Account, Deleting account, Verifying account

---

## Login

<https://checklist.design/mobile/login>

Everything a returning user needs to authenticate quickly and securely.

**Checklist**

- [ ] **Social sign-in** — Sign-in options that connect to an existing Apple or Google account, bypassing manual credential entry.
  - *Conseil :* On iOS, Apple Sign In is required by App Store guidelines if any other social provider is offered.
- [ ] **Email field** — The input where users enter the email address associated with their account.
- [ ] **Password field** — A masked text input for the account password, with the option to reveal what has been typed.
- [ ] **Biometric authentication** — Face ID or fingerprint sign-in for returning users who have already authenticated once with a password
  - *Conseil :* Encouraged to suggest after initial login so it’s a faster experience in the future
- [ ] **Credential autofill** — System-level support for pre-filling saved email and password from the user's password manager.
  - *Conseil :* textContentType on iOS and autoComplete on Android are the attributes that trigger native autofill.
- [ ] **Forgot password link** — The link users reach for when they can't recall their password, leading into the reset flow.
- [ ] **Error states** — Feedback shown when authentication fails, distinguishing between an unrecognised email address and an incorrect password.
  - *Conseil :* Generic 'incorrect credentials' gives users no useful signal — knowing whether the email or password is wrong helps them recover without guessing.
- [ ] **Passwordless sign-in (magic link)** — An alternative sign-in method that sends a one-time link to the user's email, requiring no password
  - *Conseil :* Useful for infrequent-use apps where remembering a password between sessions is difficult

**Notes de conception**

- **Face ID post-login**
- **Social login options**
- **Magic link**

*Voir aussi :* Resetting password, Input Field, Verifying account, Button, Toast, 2FA, Onboarding

---

## Cart

<https://checklist.design/mobile/cart>

**Checklist**

- [ ] **Item list** — Each item in the cart shown with its image, name, selected variants, and quantity
- [ ] **Quantity stepper** — Plus and minus controls for adjusting quantity inline that are large enough to tap accurately without zooming.
- [ ] **Swipe to remove** — A swipe-left gesture on a cart item revealing a remove action to delete item
- [ ] **Price breakdown** — Subtotal, any applied discounts, estimated tax, and total shown before the checkout action.
  - *Conseil :* If prices will change after cart e.g. delivery fee, specify that it will be shown later
- [ ] **Empty cart state** — The state shown when no items are in the cart, with a clear prompt to continue browsing
- [ ] **Promo code field** — The ability to enter the code and see discount across items and total
  - *Conseil :* Can also be visible at checkout, but users may want to see the discounts here first before proceeding

**Notes de conception**

- **Retail e-commerce app**
- **Food delivery app with empty cart**

*Voir aussi :* Adding to cart, Button, Making a card payment, Toast

---

## Search

<https://checklist.design/mobile/search>

The search experience on mobile where keyboard handling and filtering results are unique to web.

**Checklist**

- [ ] **Sticky search bar** — The search input fixed at the top of the screen as results scroll beneath it
  - *Conseil :* A search bar that scrolls away with results forces users to scroll back up if they need to refine their query
- [ ] **Keyboard auto-focus** — The keyboard opens immediately when the user navigates to the search screen — no extra tap required to start typing
- [ ] **Live results** — Results updating as the user types rather than requiring a submit tap
- [ ] **Recent searches** — Previously searched terms shown before the user starts typing for convenience to revisit results
- [ ] **Filter bottom sheet** — Filtering accessed via a bottom sheet rather than a separate screen, to keep the search context visible while adjusting
  - *Conseil :* A full-screen filter page can be better if the filtering is extensive e.g. a retail store or booking system
- [ ] **Skeleton loading** — Skeleton cards in the expected result shape shown while results load as user types
- [ ] **No results state** — A helpful empty state with suggestions e.g. suggestion to check spelling, remove filters or try related terms
- [ ] **Clear query button** — An action inside or near the search field to clear the current query with one tap

*Voir aussi :* Search Results, Empty State

---

## Splash Screen

<https://checklist.design/mobile/splash-screen>

The first screen a user sees when launching the mobile app and it initialises before transitioning to the home screen.

**Checklist**

- [ ] **Logo or wordmark** — The app brand mark centred on a clean background
- [ ] **Brand background** — A solid or subtly branded background that makes the transition from the  mobile home screen clear
- [ ] **Launch duration** — The splash visible only for as long as the app genuinely needs to initialise (not used as decorative padding)
- [ ] **Transition to first screen** — A smooth, intentional animation into the first real screen, ideally not a hard cut or jarring flash
- [ ] **No interactive elements** — The splash screen contains no buttons, inputs, or tappable areas, it is purely for transition
- [ ] **Loading indicator** — For any initialisation taking more than a second so the user knows something is happening
  - *Conseil :* This could be your logo, wordmark or illustration you use as the key visual in a looping animation

*Voir aussi :* Login, Onboarding

---

## In-App Browser

<https://checklist.design/mobile/in-app-browser>

A browser experience inside a mobile app, which is handy for opening web links or accessing web data via API.

**Checklist**

- [ ] **URL bar visibility** — The URL of the current page visible to the user, confirming the domain before they interact with any forms or enter credentials
  - *Conseil :* Users who cannot see the URL in an in-app browser cannot verify they are on a legitimate domain, since URL visibility is a security baseline
- [ ] **Close action** — A clear, persistent button for closing the browser and returning to the app (typically in a fixed toolbar rather than hidden behind a gesture)
- [ ] **Open in external default browser action** — An option to open the URL in the user's default browser, while preserving the in-app browser experience still
- [ ] **Share action** — Allowing the URL to be shared without opening the default browser
- [ ] **Loading feedback** — A progress indicator while the page loads (either a top progress bar or an activity indicator) so the user knows the browser is working

*Voir aussi :* Modal

---

## Gesture navigation

<https://checklist.design/mobile/gesture-navigation>

The touch-based interaction patterns that let users navigate and act without tapping buttons.

**Checklist**

- [ ] **Swipe to go back** — The standard action to allow a user to go back without tapping a button
  - *Conseil :* This can be disabled on screens where a horizontal swipe exists to not be a conflict
- [ ] **List item swipe actions** — Revealing quick actions such as delete, archive, mark as read on an item without opening it
  - *Conseil :* Suitable only if there are 2-3 actions available on the item, any more may be too significant space was
- [ ] **Pull to refresh** — For scrollable content lists with a visible indicator and haptic confirmation when triggered
- [ ] **Long press menus** — Triggered by long pressing, an item reveals actions relevant to that specific element
  - *Conseil :* These are utilised for quick actions, and the action should exist elsewhere in a more accessible way in the app
- [ ] **Pinch to zoom** — Image and map content supporting standard pinch-to-zoom, with zoom level reset logically on navigation away
- [ ] **Drag to reorder** — Lists or cards that can be reordered supporting long-press-to-lift and drag, with clear visual feedback during the drag state
- [ ] **Gesture hints** — A subtle animation or tooltip on first encounter with a key gesture, hinting at its existence
  - *Conseil :* If it's a significant value to learn the gesture, the hint could persist until the user tries the action, so they understand it better
- [ ] **Haptic feedback** — Beneficial for key gesture moments where your finger may cover the screen and therefore it's not clear whether you have engaged with the gesture e.g. the pull-to-refresh, long press or drag actions

*Voir aussi :* Tab Bar Navigation, Action Sheet

---

## Checkout

<https://checklist.design/mobile/checkout>

The payment flow on mobile optimised for native payment methods and the constraints of a small screen.

**Checklist**

- [ ] **Native payment methods** — Apple Pay and Google Pay as the primary checkout options, to complete the purchase with a single biometric tap.
  - *Conseil :* It is important to still offer manual card entry if you feel users will be concerned about 3rd part tool usage
- [ ] **Persistent order summary** — The item list, quantities, and total available throughout the checkout flow — either persistently visible or accessible with a single tap
- [ ] **Minimal form fields** — Only the fields genuinely required to complete the purchase e.g. card details, delivery address
- [ ] **Autofill capabilities** — Shipping address fields that support iOS and Android autofill, removing the need to type a full address manually.
- [ ] **Keyboard types per field** — Appropriate keyboard types throughout checkout e.g. numeric for card numbers and CVV, date or numeric pad for expiry.
- [ ] **Checkout progress** — A clear step indicator for a multi-step experience e.g. having a Details, Payment and Checkout page separately
- [ ] **Error recovery** — The experience after a payment failure, returning to the payment step with all previously entered data intact and a clear explanation of the reason
- [ ] **Order/payment confirmation** — A clear confirmation screen with summary, payment method and amount, along with any other relevant information e.g. expected arrival date if it involves physical delivery
  - *Conseil :* It's common to email the user an invoice or payment confirmation, which the user can be reminded of here so they know they don't have to keep this page open in the app

*Voir aussi :* Cart, Making a card payment, Billing

---

## Tab Bar Navigation

<https://checklist.design/mobile/tab-bar-navigation>

The persistent bottom navigation bar that gives users access to the top-level sections of the app

**Checklist**

- [ ] **Tab count** — Limited to the most important destinations — 3 to 5 items is the typical range
  - *Conseil :* More than 5 sections dilutes each option and may not fit
- [ ] **Icon and label** — Each tab paired with both an icon and a text label
  - *Conseil :* Labels may not be necessary but only if icons are explicitly clear at what lies within that section
- [ ] **Active and default states** — Active should be visually distinct whether it's colour, border or icon weight
- [ ] **Badge counts** — Useful for tabs with unread counts like messages and notifications, updating in real time
  - *Conseil :* Instead of a number, a dot is suitable if numbers feels less relevant
- [ ] **Fixed presence** — For the sections the tab bar applies to, tab bar should remain visible, and can be hidden on any page a level deeper
- [ ] **Tap target size** — Each tab at least 44×44pt to be reliably tappable with a thumb in any grip position
- [ ] **Haptic feedback** — A subtle tap haptic on tab selection confirming the action

*Voir aussi :* Gesture navigation

---

## In-App Notifications

<https://checklist.design/mobile/in-app-notifications>

The in-app feed of alerts, updates, and messages the user has received — distinct from system push notifications.

**Checklist**

- [ ] **Reverse chronological order** — Newest notifications at the top means users don’t have to scroll for the latest
- [ ] **Unread indicators** — Unread notifications visually distinct from read ones e.g. a dot, bolder text, or a background colour difference
- [ ] **Mark all as read** — A single action to clear all unread indicators at once
  - *Conseil :* Essential for an app with many notifications, or where there is likelihood the user spends a long time away
- [ ] **Notification grouping** — Related notifications grouped together e.g. multiple comments on the same post shown as a single expandable item, not separate rows
  - *Conseil :* Best applied to high-activity content
- [ ] **Swipe to dismiss action** — Individual notifications dismissible by swiping left, revealing a delete action
- [ ] **Deep link on tap** — Tapping a notification navigates the user directly to the relevant content
- [ ] **Empty state** — For when there are no notifications, to indicate they haven’t received any… yet
- [ ] **Settings shortcut** — A direct link from the notifications screen to notification preferences, for users who want to adjust what they receive
- [ ] **Notification content** — Information relevant to triggering the notification e.g. the change, author and time it occurred

*Voir aussi :* Notification Settings, Notifications

---

## Billing

<https://checklist.design/mobile/billing>

Payment history, receipts, and everything related to how the user is charged.

**Checklist**

- [ ] **Manage via App Store** — A link or prompt directing users to the App Store or Play Store to manage their subscription
  - *Conseil :* Apple and Google require subscription management to happen through their platform, so a buried path there is a consistent source of support contacts and poor reviews
- [ ] **Next billing date and amount** — The next scheduled payment date and amount visible without needing to dig into billing history
  - *Conseil :* Surfacing this proactively reduces cancellations driven by surprise charges
- [ ] **Billing history and receipts** — A list of past charges with amounts and dates, with individual receipts accessible
  - *Conseil :* Particularly important for users paying with a work card, who often need receipts for expense reporting
- [ ] **Restore purchases** — A button to restore previously purchased subscriptions or in-app purchases after reinstalling or signing in on a new device
  - *Conseil :* Required by Apple for apps with in-app purchases, since it solves the common case of reinstalling after a device change
- [ ] **Refund help link** — Guidance on how to request a refund, typically via the platform's own process
  - *Conseil :* Refunds are handled by Apple or Google, not the app directly, and making this clear reduces confusion and support volume
- [ ] **Tax display** — Tax or VAT amounts displayed separately from the base price where legally required.

---

## Camera

<https://checklist.design/mobile/camera-media-capture>

Capturing photos, video, or documents as well as reviewing and customising the capture experience for accessing the phone camera within an app.

**Checklist**

- [ ] **Permission request** — Camera permission requested at the moment capture is triggered (not on app launch or during onboarding)
  - *Conseil :* Asking earlier without context of camera usage doesn't feel trustworthy
- [ ] **Viewfinder and capture button** — A full-screen viewfinder with a clearly positioned, large capture button
  - *Conseil :* Button should be reachable by thumb at the bottom of the screen
- [ ] **Flash controls** — Flash toggle accessible without leaving the capture screen, with auto, on, and off states clearly indicated
- [ ] **Camera flip** — A clear camera flip button accessible during capture, positioned so it is not accidentally triggered during shooting
- [ ] **Post-capture preview** — A preview shown after capturing, giving the user the chance to retake or confirm before the media is used
- [ ] **Gallery picker of captures** — The option to open photo library containing only photos captured within that series until exit of camera

*Voir aussi :* Uploading media, Press / Media

---

## Map View

<https://checklist.design/mobile/map-view>

The native map screen showing location-based content, user position, and contextual overlays

**Checklist**

- [ ] **Pin and marker designs** — Custom markers clearly distinguishable from each other and from the base map, sized for reliable tap accuracy on mobile
  - *Conseil :* Ensure the marker design for current location is the most prominent, as all map view interactions are centred around it
- [ ] **Marker clustering (if applicable)** — How markers are shown when a group of them are so close together they cannot be shown individually, and must be grouped
- [ ] **Native map components** — Leverage either MapKit for iOS or Google Maps for Android to utilise existing foundations and layout that is time consuming to create from scratch
- [ ] **Location permission** — The point in the flow at which location permission is requested, with context explaining the level of access needed and why
  - *Conseil :* Consider the UI if permissions are denied, where you can provide instructions on how to change the permission in settings
- [ ] **Current location re-centre** — A clearly visible button to re-centre the map to the user's current position without zooming or scrolling to it
- [ ] **Selected item bottom sheet** — Tapping a marker expanding a bottom sheet with details about that location — not a full-screen navigation away from the map.
- [ ] **Search or filter actions** — Search or filter controls accessible as a persistent overlay on the map or as a separate screen
  - *Conseil :* Selecting filters can be on a separate screen, but when on map the applied filters should be visible for context
- [ ] **Offline handling** — When offline, cached map tiles displayed where available, with a clear indicator that the map may not be current

*Voir aussi :* Icon, Button, Search, Filtering items

---

## Onboarding Checklist

<https://checklist.design/mobile/onboarding-checklist>

The in-app progress checklist that guides a new user through key setup steps to learn how the product works by completing actions.

**Checklist**

- [ ] **Card or sheet presentation** — The checklist presented as a dismissible bottom sheet or a persistent card on the home screen, not a full-screen overlay
- [ ] **Task count and progress** — A visible count of completed versus total tasks and a progress bar or ring that updates as steps are completed
- [ ] **Tap to start each task** — Each checklist item tappable, navigating directly to the relevant screen or feature not just informational
- [ ] **Completion celebration** — When all tasks are complete, show a brief celebratory moment before the checklist disappears (animation, confetti, congratulatory message)
- [ ] **Dismissible action** — The checklist is dismissible for users who do not want it not a forced guided path.
  - *Conseil :* Making the checklist dismissible is fair because sometimes users don't want or need guidance
- [ ] **Persistent but unobtrusive** — The checklist is accessible from a consistent location (dashboard, profile, home)
- [ ] **Personalised to user type (if applicable)** — If there are different user types or ways to use the app, include onboarding questions that direct to tailored steps in this checklist so it feels more personal

*Voir aussi :* Empty State, Onboarding, Notifications, Onboarding

---

## Chat

<https://checklist.design/mobile/chat>

The one-to-one or group messaging screen, handling keyboard behaviour, message input, media sharing, and real-time updates in the constraints of a mobile screen.

**Checklist**

- [ ] **Keyboard push-up** — The message input bar rising with the keyboard when it opens, so the conversation history is not obscured
  - *Conseil :* The behaviour differs between iOS and Android, so explicit handling on both platforms is what prevents the common bug of the keyboard obscuring the input bar
- [ ] **Input bar** — A persistent input bar at the bottom of the screen containing a text field, send button, and media attachment option, thumb-reachable in all grip positions
- [ ] **Message bubbles** — Sent messages on the right, received on the left, consistent with every messaging convention the user already knows
  - *Conseil :* Breaking the sent-right received-left convention for a design reason is rarely worth the disorientation it causes
- [ ] **Swipe to reply** — Swiping a message right revealing a reply-to action, threading the response to the specific message
- [ ] **Long press message actions** — Long pressing a message opening a reaction picker and action menu e.g. react, reply, copy, delete
- [ ] **Read receipts** — Sent message status shown as subtle indicators below or within the message bubble (sent, delivered, read)
- [ ] **Media and file sharing** — Images, videos, and files shareable directly from the input bar, with inline previews in the conversation thread
- [ ] **Typing indicator** — An animated indicator when the other party is composing
- [ ] **Scroll to latest** — When new messages arrive while the user is scrolled up, a button to jump to the latest message

*Voir aussi :* Chat, Notifications

---

## Settings

<https://checklist.design/mobile/settings>

The screen where users manage their account, preferences, notifications, and app behaviour.

**Checklist**

- [ ] **Grouped table layout** — Settings organised into clearly labelled sections (Account, Notifications, Privacy, Support) using the native grouped list pattern
  - *Conseil :* Grouped settings are a platform convention users have deeply internalised. Deviating from it forces users to relearn navigation they already know
- [ ] **Native toggle controls** — Binary settings presented with the platform-native toggle switch (UISwitch on iOS, Material Switch on Android)
  - *Conseil :* Custom toggles that look slightly off from the native ones create subtle distrust, since the difference is small but users notice it
- [ ] **Destructive actions grouped** — Log out, delete account, and other irreversible actions in their own section at the bottom, visually distinguished in red
- [ ] **Account details at top** — The user's avatar, name, and email shown prominently at the top of settings, a clear anchor for whose account is being managed
- [ ] **Deep link to specific settings** — A direct link from relevant in-app prompts to the specific settings screen they reference — notification preferences, privacy, and so on.
  - *Conseil :* Telling users where to find a setting is far less effective than linking them there directly.
- [ ] **Support and feedback access** — A clear path to contact support, submit feedback, or access help documentation, accessible from within settings.
- [ ] **App version** — The current app version shown at the bottom of settings — essential for support conversations and identifying build-specific issues.
- [ ] **Legal links** — Links to the Privacy Policy and Terms of Service accessible within settings, as required by app stores.

*Voir aussi :* Notification Settings, Settings, Account

---

## Invite

<https://checklist.design/mobile/invite>

The flow for adding collaborators or members to a shared space with role assignment and pending invite management.

**Checklist**

- [ ] **Email invite** — The primary method of inviting someone by entering their email address directly
- [ ] **Role or permission selection** — A control for setting what the invited person will be able to see and do once they accept
  - *Conseil :* Show what each role can and cannot do before the invite is sent, since this prevents over-permissioning and the back-and-forth of revoking access later. Keep roles to three or fewer where possible
- [ ] **Contact picker** — Access to the device's contacts list for finding people to invite without typing a full address
  - *Conseil :* On iOS this requires explicit permission. Prime the user with a custom screen before the system prompt, since 'Find people you already know' performs better than asking cold
- [ ] **Bulk invite** — A way to add multiple people at once, by entering several addresses or pasting a list
  - *Conseil :* Support comma-separated and line-break-separated input, since users are likely to paste from spreadsheets or threads
- [ ] **Pending invites + actions** — A list of sent invitations that have not yet been accepted, with the option to resend or revoke each one
  - *Conseil :* Show when each invite was sent and when it expires for context on most recent invite sent
- [ ] **Shareable invite link** — A link that grants access to anyone who opens it, with a configurable permission level
  - *Conseil :* Include an expiry option and a usage limit on the link for security
- [ ] **Seat or member limit** — A visible count of remaining available seats, surfaced before the user reaches the plan's member cap
- [ ] **Access scope summary** — A clear statement of what the invited person will be able to see and do, shown to the sender before confirming

*Voir aussi :* Chat

---
