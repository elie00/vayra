# Design System

Composants réutilisables et fondations visuelles. Source : <https://checklist.design/design-system>

---

## Typography

<https://checklist.design/design-system/typography>

The type layer of a design system that defines a scale, hierarchy, and set of text styles that is consistent, accessible, and expressive across the full range of product contexts

**Checklist**

- [ ] **Type scale** — A defined set of font sizes with a consistent ratio between them, covering everything from captions to display headings
  - *Conseil :* A modular scale (1.25, 1.333, 1.5 ratio) produces a more harmonious hierarchy than arbitrary size choices
- [ ] **Semantic text styles** — Named styles that describe role rather than size so usage is driven by meaning, not pixel values e.g. display-large, body-default, label-small, caption
  - *Conseil :* Style names chosen by size — 24px, 18px, 14px — consistently result in designers selecting styles by measurement rather than role, which makes the system harder to evolve when the scale changes.
- [ ] **Typeface selection and loading** — The chosen typefaces detailing style and weight e.g. Inclusive Sans Medium
- [ ] **Line height per style** — Line height defined explicitly for every text style since tightly spaced headings and readable body text require different values
  - *Conseil :* Similar style groups follow a consistent line height e.g. 1.5 for body text, 1.2 for heading and 1.1 for display
- [ ] **Letter spacing per style** — Letter spacing defined per style where needed
  - *Conseil :* Similar to line height, where style groups often following a consistent pattern
- [ ] **Responsive type behaviour** — How text styles respond to viewport size, whether through fluid type scaling, breakpoint-based overrides, or fixed sizes with responsive layout compensation
- [ ] **Minimum readable size** — The smallest text size in use across the system, and how readability at that size is validated in the actual rendering environment
  - *Conseil :* Consider minimum size between desktop and mobile differently
- [ ] **Accessibility responsiveness** — How text styles behave at 200% browser zoom, and whether any style communicates meaning through colour variation alone

*Voir aussi :* Color System, Icon

---

## Tokens

<https://checklist.design/design-system/tokens>

The layer of a design system where defined variables are outlined across the platform to enable consistency, theming and alignment with code.

**Checklist**

- [ ] **Three-tier token architecture** — Tokens organised into primitive, semantic, and component tiers — primitives store raw values, semantic tokens describe purpose, component tokens scope decisions to a specific element
  - *Conseil :* It's okay to start with just primitives and component tokens first, and only utilise semantic for theming
- [ ] **Naming convention** — A consistent, predictable naming pattern so any token name communicates its purpose without needing documentation.
  - *Conseil :* A token named blue-500 tells you the value, but a token named color-interactive-primary-default tells you when and where to use it, making that system the scalable one
- [ ] **Token documentation** — Each semantic token documented with its intended use, example contexts, and what it can and cannot be used for
- [ ] **Token governance** — A clear rule for what constitutes a token versus a hardcoded value, and a process for reviewing and approving new tokens before they are added to the system
  - *Conseil :* New tokens should always be suggested, but have clear reasoning of purpose and scalable use to be genuinely considered
- [ ] **Design tool sync** — Tokens maintained in your design tool of choice as variables
  - *Conseil :* Aim to find a way to connect your tokens to what is in code — naming convention being 1:1 is ideal for ongoing maintenance
- [ ] **Versioning and changelog** — Token changes versioned and communicated in a way that teams consuming the token system can know when values change and what the impact will be on their surfaces

*Voir aussi :* Color System, Typography

---

## Accordion

<https://checklist.design/design-system/accordion>

An accordion is a vertically stacked list of items that reveal or hide associated content sections when clicked. They help organize information hierarchically and saves screen space by showing only relevant content.

**Checklist**

- [ ] **Header** — The clickable area that triggers expanding and collapsing and has a title
  - *Conseil :* The header text should clearly convey the content that is inside
- [ ] **Expand/collapse icon** — Visual indicator of the current state — typically a plus/minus, or a caret/chevron that rotates between states
- [ ] **Content area** — The content that shows or hides when toggled, containing detailed information associated with the header
  - *Conseil :* While headers should be text only, content can be anything that is suited to help answer or elaborate on the header (text, image, video, etc)
- [ ] **States** — Default (collapsed), expanded, hover, focused, and disabled
- [ ] **Expanding logic** — Decide if users can open multiple sections at once, or one at a time
  - *Conseil :* Can be determined by whether you think information from other items are related and should be seen together

**Notes de conception**

- **Choice of icon** — Can be a plus (expanded) or minus (collapsed), or a caret/chevron that rotates on trigger
- **States** — Default (collapsed), expanded, hover, and disabled
- **Style** — Accordion style can change based on overall design system style (container, lines, cards)

*Voir aussi :* Tabs, Button

---

## Banner

<https://checklist.design/design-system/banner>

A banner is a prominent notification item that displays important messages to users. It communicates things like errors, success confirmations, warnings, or general information using distinct colors and placement to stand out from regular page content and grab attention.

**Checklist**

- [ ] **Style** — How the banner types look (fill, text colour, border radius etc)
  - *Conseil :* Ensure the banner stands out enough on your default UI as it’s usage typically means it should not be missed
- [ ] **Content** — A title is a must but you can consider a description if you feel a title does not convey enough information
- [ ] **Types** — Banners typically appear as 5 options: information, success, warning, error, neutral. This helps visually establish context and level of importance.
- [ ] **Call to action button** — A banner may call for the user to do something, like fix the error it is calling out, or viewing the successful outcome of an event.
  - *Conseil :* Only have a button if it feels needed, banners typically work best to inform
- [ ] **Placement** — Where the banner sits on the page, dependent on context and importance
  - *Conseil :* Consider the impact the banner contents has on the user experience to determine where it’s placed best e.g. information affecting the entire application should have a banner at the top on every page. Information only affecting a small feature may be within a relevant section.
- [ ] **Dismissable** — Whether the banner can be dismissed. Positive/neutral banners (info and success) would suit this, but not warning/error banners as they are too critical.

**Notes de conception**

- **Variations** — Different colours can be used to match the message type: red for errors, green for success, yellow for warnings, and blue or neutral for general information. This helps the first impression be more specific.
- **Content** — It’s perfectly fine to just have 1 line of text to explain the scenario. If more details are needed, it’s good to have a short, clear title followed by a longer description. This lets people quickly scan the main message or read more if they want to.
- **Actions** — An error or warning banner is common to contain an action, to take you directly to where the issue can be fixed or investigated.
- **Contrast to UI** — Make banners look different from the rest of the page so they grab attention. Use background colors, borders, or shadows that make the banner clearly separate from normal page content.
- **Icons** — Add simple, recognizable symbols that match the message - like checkmarks for success or warning triangles for problems. Icons help people understand the banner's meaning at a glance, even before reading the text.
- **Placement** — Put banners where users will notice them relative to the context. Top of the page works for site-wide messages, while placing near related content works better for specific notifications.

*Voir aussi :* Button, Icon

---

## Radio

<https://checklist.design/design-system/radio>

A radio button is an interactive control that allows users to select exactly one option from a predefined set of mutually exclusive choices. Unlike checkboxes, when one radio button is selected, all others in the same group are automatically deselected.

**Checklist**

- [ ] **Label** — Text associated with the radio input
- [ ] **Grouping** — There must be more than one radio option for the experience to work
  - *Conseil :* Utilise radio to surface all inputs options, only being able to select one Radios with short labels can be align horizontally, but should usually be aligned vertically
- [ ] **Default selection** — Start with a radio option selected
  - *Conseil :* This doesn't always have to be the first option, it can be the more likely option based on previous research and experiences
- [ ] **Style** — Make sure radio is unique and stands out from other input options
- [ ] **Clickability** — Consider what is clickable to make the radio option active (text label, container)
- [ ] **States** — Radio can be default, active and disabled (see examples below)

**Notes de conception**

- **Style** — A container on a radio can improve it's clickability, but will take up more space. It's worth considering both options in your design system.
- **States** — All the possible variations a radio can exist as depending on interaction and logic.

*Voir aussi :* Checkbox, Input Field, Toggle

---

## Tooltip

<https://checklist.design/design-system/tooltip>

A tooltip is a small informational popup that appears when users hover over or focus on an element, providing additional context or explanations. It disappears when the user moves away, making it ideal for offering brief, helpful hints without cluttering the interface.

**Checklist**

- [ ] **Information** — Keep content clear and concise
  - *Conseil :* Information should be entirely relevant to what the tooltip is for, and elaborate on what is already visible
- [ ] **Contrast** — The background should be different from the underlying content
  - *Conseil :* An inverse colour works best for contrast - if behind the tooltip is dominantly light, make the tooltip background dark with light text
- [ ] **Visibility** — How a tooltip looks and shows
  - *Conseil :* A tooltip should activate on hover or select of an icon or text it is relevant to Only one tooltip should be visible at a time A tooltip should not cover the content it is relevant to
- [ ] **Dismiss action** — Depending on how intrusive or extensive the tooltip is, a dismiss allows the user to feel more in control and allow the tooltip to feel more flexible and non-compulsory

**Notes de conception**

- **Interaction** — Tooltips typically appear through hover or focus, and disappear when leaving the trigger area, so it does not obstruct other information permanently.
- **Additional description** — Tooltips may have another level of text if more context is needed, without making the title too overwhelming.
- **Width** — Maintain readability with a limiting width, with a maximum value of 150-300px.
- **Relative position** — Tooltips can dynamically appear relative to the interaction trigger, and its position can help reduce obstruction of other information.
- **Use cases** — Tooltips can go beyond providing additional context. Consider their usage in revealing shortcuts, displaying statuses or previewing data.

*Voir aussi :* Icon, Button

---

## Modal

<https://checklist.design/design-system/modal>

A modal is a dialog box or popup window that appears on top of the main content, requiring user attention or interaction before returning to the main interface. It creates a focused experience by temporarily disabling the underlying page and dimming the background.

**Checklist**

- [ ] **Title** — Clear, simple text explaining the action of the modal
  - *Conseil :* Ensure your icon is recognisable in all possible sizes it's displayed at, and whether the detail needs to be simplified at a smaller size
- [ ] **Actionable item** — A button or link to continue or close the event
  - *Conseil :* Users should always have an idea where they will be going to, or what event will happen before clicking a button If your button has generic copy such as 'Okay' or 'Cancel', include a label above it describing the event or purpose of the button
- [ ] **Close action** — A way to exit the modal
- [ ] **Responsiveness** — Consider the size of the modal on different device sizes, and whether a modal is suitable on all
  - *Conseil :* On mobile, adapt the modal to full screen to gain more space
- [ ] **Background change behind modal** — Darken, blur or lighten - change the background behind the modal to bring focus to it
- [ ] **Description** — Incase they require more information to understand how to make their decision

**Notes de conception**

- **Buttons** — Consider the button hierarchy and variations in a modal. It's common to have 2 contrasting button types that present opposing actions e.g. continue and cancel.
- **Close action** — To dismiss the modal, but this can be a variable if you want to force the user to select a button to proceed, as the close action is a generic dismiss.
- **Responsiveness** — A modal takes up a part of the desktop screen, but it is recommended to make a modal full size on mobile. This is incase the modal content requires scrolling, which is easier to interact with if the modal takes up the entire screen.

*Voir aussi :* Button, Drawer, Input Field

---

## Input Field

<https://checklist.design/design-system/input-field>

An input field is an interactive area where users can enter and edit text or data. It provides a clear visual container for user input, often accompanied by labels and validation feedback, making it essential for forms and data collection interfaces.

**Checklist**

- [ ] **Input field** — Interactive text field for user to enter their data into
  - *Conseil :* Ensure text size is readable on all devices
- [ ] **Label** — Stating what information the user is meant to provide
  - *Conseil :* Avoid all caps for text labels to improve readability
- [ ] **Placeholder text** — Text inside the input field acting as an example of what you want the user to enter
  - *Conseil :* Text colour must be notably lighter than default text, so users don't assume its filled in Providing examples lets users understand how you would like them to enter the information
- [ ] **Data format** — Set text fields to allow the relevant text values e.g. numeric only for phone number
  - *Conseil :* Hint at preferred data format with placeholder text or hint
- [ ] **Illustration or icon** — A visual cue can help break up a long list of text fields
- [ ] **Hint** — Elaborate on the title of the text field incase a user struggles to know what to enter

**Notes de conception**

- **Style** — Style of the field container establishes visual hierarchy and accessibility, and should be consistent with branding.
- **Labels and hints** — Both are essential context and guidance. Labels are required as they succintly call out what information is needed, while hints elaborate on context, instructions or formatting.
- **Icons** — There are two types of icons for input fields: leading and trailing. A leading icon is typically for visually representing the context of the field, helping differentiate it from others. A trailing icon is typically an action that can trigger behaviour in the field.
- **States** — A breakdown of all different interactions with an input field
- **Sizes** — An optional flexibility in the case of navigating spacing constraints and/or creating a balanced interface based on surrounding elements
- **Area** — While input fields are the common default, input areas allow for larger content to be entered and viewed. They can also provide an expectation of how much to write

*Voir aussi :* Button, Checkbox, Searchbar

---

## Button

<https://checklist.design/design-system/button>

A button is an interactive element that triggers an action when clicked or tapped. It clearly communicates its clickability through visual styling and provides feedback on user interaction, making it a fundamental component for enabling user actions in interfaces.

**Checklist**

- [ ] **Base style** — Your default style, one of the following: fill, outline, underline
- [ ] **Shape** — Visual properties of a button: padding, border, border radius, shadow
- [ ] **Variants** — Each visual type to represent button structure e.g. primary and secondary buttons
- [ ] **Copy** — Instructional text that details what will happen if you click the button
  - *Conseil :* Users should understand what will happen before clicking a button. Buttons can have generic copy such as 'Okay' or 'Cancel', but only if there is context around that action, in the title or as a label for example.
- [ ] **States** — How the button changes based on the interaction: hover, focused, disabled

**Notes de conception**

- **Sizes** — Having multiple sizes helps with a complex interface that has several actions.
- **States** — To help indicate an interaction (or lack of one) on a button. These are the 4 standard but there are many more.
- **Icons** — Icons can help differentiate buttons, and familiarise a user with an action using a visual they recognise
- **Style** — Style can help establish hierarchy. The number of styles should depend on the experience

*Voir aussi :* Icon, Color System, Tooltip

---

## Toggle

<https://checklist.design/design-system/toggle>

A toggle is a switch-like control that allows users to quickly alternate between two opposing states (on/off) with a single click or tap.

**Checklist**

- [ ] **Context** — Explaining what the toggle will do
  - *Conseil :* A toggle should always be turning a function on or off, not between two opposing versions of a function e.g. hot or cold Consider toggles for straightforward decisions that have low risk implications
- [ ] **Transition** — A clear visual change of the toggle switching between different states
- [ ] **State** — How the button changes based on the interaction, examples below
  - *Conseil :* Contrast active and inactive with brand colour for active and keeping the inactive muted

**Notes de conception**

- **Default** — Toggles are usually off by default. It allows users to explicitly opt in to the action, rather than being opted in automatically deceptively.
- **Active** — Toggle is on meaning it is actively performing an action. The active state can utilise the brand colours to help it feel part of the UI.
- **With label** — The label should convey the action or state of the toggle being active. For example, the label stating 'silent mode' means if the toggle is active, silent mode is active.

*Voir aussi :* Checkbox, Button, Icon

---

## Table

<https://checklist.design/design-system/table>

**Checklist**

- [ ] **Table header** — The value of each column to provide structure for the row content
  - *Conseil :* Fix your header on scroll to continue giving context to user
- [ ] **Row style** — Borders and contrasting background colours can be explored to differentiate
- [ ] **Spacing** — Define the consistent padding of each row and the header
- [ ] **Search** — The ability to find a specific keyword or row
  - *Conseil :* Ensure all of your possible data points can be searched and defined by text input
- [ ] **Actions** — Performing a task based on the row and information seen e.g. view, edit, delete
- [ ] **Filter and sort** — Allow users to customise what they want to see in the table and in which order
- [ ] **Responsiveness** — Determine the structure on significantly smaller devices - whether the information collapses into an accordion for example
  - *Conseil :* Horizontal scrolling is an alternative to rethinking a new layout
- [ ] **Pagination** — Breakpoints in the table for digesting information in parts

*Voir aussi :* Checkbox, Icon, Tooltip

---

## Drawer

<https://checklist.design/design-system/drawer>

A drawer is a panel that slides in from the edge, overlaying content. It provides access to detailed information without completely navigating away from the current page.

**Checklist**

- [ ] **Placement** — Which edge the drawer slides from - most commonly from left (navigation) or right (details/settings)
- [ ] **Dimensions** — Typically full height, but width can vary. Should be wide enough for complex content to be shown, without taking over the entire page
- [ ] **Overlay** — A semi-transparent background for the remaining screen area to bring focus to the drawer
- [ ] **Header** — Top section with a title describing drawer contents or purpose, along with a close action (optional)
  - *Conseil :* Can also include a description of drawer contents if header is too simple
- [ ] **Content area** — Main section, which should be scrollable if content exceeds window height
- [ ] **Open and close trigger** — How user activate the drawer — typically a button to open, while closing can have multiple ways: clicking overlay, a close button, or pressing Esc on keyboard should all be active options
- [ ] **Footer** — Fixed area at the bottom for actions, usually a primary and secondary e.g. Save & Cancel

**Notes de conception**

- **Placement** — Best practices are left for navigation, right for anything else
- **Overlay** — Ensure it brings enough focus to the drawer (considering using same overlay as modal)
- **Content layout** — The anatomy of a drawer

*Voir aussi :* Modal, Button, Icon

---

## Date Picker

<https://checklist.design/design-system/date-picker>

**Checklist**

- [ ] **Calendar grid** — A month view with days arranged in a weekly grid, navigable forward and backward by month, as the primary date selection surface
- [ ] **Text input alongside** — A free-text date field paired with the calendar, so users who know the date can type it rather than relying on clicking only
  - *Conseil :* Suitable for when you know dates selected may be months or years away e.g. date of birth
- [ ] **Date range selection (if applicable)** — The ability to select a start and end date, with the range highlighted across the calendar grid and both values independently editable
- [ ] **Disabled dates** — Past dates, unavailable dates, or out-of-range dates visually distinct from selectable ones
- [ ] **Today shortcut** — A clearly labelled button or link to jump to today's date
- [ ] **Locale and format** — The calendar respecting regional conventions e.g. week starting on Monday or Sunday, date format in the text input matching the user's locale (DD/MM or MM/DD)
- [ ] **Time selection (if applicable)** — When a time is also required, a time picker integrated with or accessible directly from the date picker (not a separate, disconnected control)

*Voir aussi :* Dropdown Menu, Input Field, Timeline / Gantt View, Toggle, Radio, Checkbox

---

## Spacing / Grid

<https://checklist.design/design-system/spacing-and-grid>

The spatial layer of a design system, defining a consistent scale for spacing, a grid for layout, and the rules that make both feel deliberate and coherent across all surfaces.

**Checklist**

- [ ] **Spacing scale** — A defined set of spacing values (typically base-4 or base-8, covering 4, 8, 12, 16, 24, 32, 48, 64, 96) used for all margin, padding, and gap decisions
  - *Conseil :* A base-8 scale is the most commonly adopted because it divides evenly across common device pixel ratios and helps avoid exceptions being made
- [ ] **Semantic spacing tokens** — Named tokens for spacing that describe purpose (space-component-padding-sm, space-layout-section-gap) so spacing decisions are intentional, not arbitrary
  - *Conseil :* Raw spacing values appearing as hardcoded numbers in components make global spacing changes significantly harder, since each instance requires a separate update rather than a single token edit
- [ ] **Column grid** — A defined column grid for each major breakpoint (typically 4 columns mobile, 8 tablet, 12 desktop) with gutter and margin values specified
- [ ] **Breakpoints** — A named set of breakpoints (sm, md, lg, xl) that are shared between design and code, so responsive behaviour is described in consistent terms across both disciplines
  - *Conseil :* Breakpoint names tied to device types (phone, tablet, desktop) tend to age poorly as screen sizes shift. Content-based naming (narrow, mid, wide) describes viewport behaviour rather than hardware categories
- [ ] **Component vs layout spacing** — A clear distinction between spacing used inside components and spacing used to compose layouts, since different scales often apply to each
  - *Conseil :* Buttons that use the same spacing tokens as page-level section gaps, and vice versa, tend to produce compositions where internal padding and layout rhythm feel mismatched
- [ ] **Density variants** — Where applicable, defined compact and comfortable density modes, common in data-heavy products where users need to choose between information density and breathing room
- [ ] **Baseline grid alignment** — Text baselines and component heights designed to align to the base unit, so stacking elements produces predictable, harmonious vertical rhythm

*Voir aussi :* Typography, Color System, Tokens, Table

---

## Color System

<https://checklist.design/design-system/color-system>

The color layer of a design system — defining a palette that is purposeful, accessible, themeable, and expressed as tokens rather than raw values.

**Checklist**

- [ ] **Primitive palette** — A base set of named color ramps (blue-100 through blue-900, neutral-0 through neutral-1000) that serves as the raw material for all semantic decisions
  - *Conseil :* Systems where components reference primitive values directly are significantly harder to theme — a color change requires updating each component individually rather than a single token definition
- [ ] **Semantic color tokens** — Named tokens that describe purpose rather than appearance so the system can be reskinned without touching components e.g. color-background-primary, color-text-danger, color-border-interactive
  - *Conseil :* The semantic layer is what makes a design system actually themeable by defining purpose for colors
- [ ] **Interactive state colors** — Defined color values for default, hover, pressed, focused, disabled, and selected states applied consistently across all interactive elements
- [ ] **Feedback colors** — A consistent set of colors for success, warning, error, and informational states — used across alerts, form validation, badges, and status indicators.
  - *Conseil :* Feedback colors that pass contrast in light mode frequently fail in dark mode — testing each token pair against every surface in both themes is where most gaps tend to surface.
- [ ] **Contrast ratios (accessibility)** — A breakdown of text and interactive element color combinations verified to meet WCAG AA contrast minimums — 4.5:1 for normal text, 3:1 for large text and UI components
  - *Conseil :* Not all colors will pair together nicely so defining this for all usage is helpful
- [ ] **Dark and light mode definition** — A complete parallel set of semantic token values for the opposite mode
  - *Conseil :* It is not as simple as inverting colors of one mode to the other, they require their own system (still using the same primitive colors though)
- [ ] **Brand color integration** — Brand colors mapped into the semantic system in a way that maintains accessibility
  - *Conseil :* Where brand values fall below contrast thresholds, they are restricted to decorative contexts, with accessible token values carrying the text and interactive roles.
- [ ] **Color blindness considerations** — The palette tested against common color vision deficiencies for when color is used to convey state
  - *Conseil :* It's worthwhile considering relative items to the color if vision is a concern, meaning an icon or text can help further convey a state incase the color is not successfully visible

*Voir aussi :* Button, Icon, Badge

---

## Skeleton

<https://checklist.design/design-system/skeleton>

A skeleton is a placeholder that mimics the structure of content while it loads. It provides visual feedback that content is coming and reduces perceived wait time.

**Checklist**

- [ ] **Match content structure** — Skeletons should mirror the size and layout of the content that will replace it, to reduce jumpiness on load.
- [ ] **Animation** — Subtle motion to indicate loading without being too distracting. Can be a shimmer, pulse, or wave motion in the objects
- [ ] **Style** — Flat shapes with no depth, can be rounded or sharp
- [ ] **Color scheme** — Typically a neutral gray or very soft colour that does not call too much attention and contrasts just enough with its background.
- [ ] **Transition to real content** — Should be a smooth, subtle movement like a fade out before the content loads.

**Notes de conception**

- **Match content structure** — Skeletons should mirror the size and layout of the content that will replace it, to reduce jumpiness on load.
- **Shape variety** — Skeleton shapes can vary in width, height, radius and shape type to help differentiate content and reflect it better

*Voir aussi :* Loading, Card, Color System

---

## Carousel

<https://checklist.design/design-system/carousel>

A carousel is a slideshow component that displays content one slide at a time. Users can alternate content through manual navigation or waiting for automatic transition.

**Checklist**

- [ ] **Ways of interaction** — Defining whether the carousel transitions are auto-play, navigated by controls, or both
- [ ] **Visual progress indicator** — Show dots, numbers, or a progress bar so users know how many slides there are and which one they're currently viewing.
  - *Conseil :* Make the current slide's indicator look noticeably different so people can track their position at a glance.
- [ ] **Dimensions and alignment** — The size of the items in the carousel, and their responsiveness across devices.
  - *Conseil :* Decide how content sits inside the item container so that it is filling the required space without being stretched or not looking uniform.
- [ ] **Animation behaviour** — The direction, speed and feeling of how the items transition between each other.
- [ ] **Focused item state** — if your carousel shows one item a time, the one on focus should appear different to the items that are entering and exiting
  - *Conseil :* Size, transparency and colour are typical properties to change on the non-focused items to allow the focused have more attention naturally

**Notes de conception**

- **Ways of interaction** — Defining whether the carousel transitions are auto-play, navigated by controls, or both. Auto-play: user can’t change item themselves and it is set to a routine timer. Navigated by controls = user can interact and progress to next item through action (click, drag or swipe).
- **Visual progress indicator** — Show dots, numbers, or a progress bar so users know how many slides there are and which one they're currently viewing.
- **Animation behaviour** — The direction, speed and feeling of how the items transition between each other.
- **Focused item state** — If your carousel shows one item a time, the one on focus should appear different to the items that are entering and exiting.

*Voir aussi :* Card, Button, Icon

---

## Slider

<https://checklist.design/design-system/slider>

A slider is an interactive control that allows users to select a value from a continuous range by dragging a handle along a track. It often provides intuitive visual feedback as it is interacted with.

**Checklist**

- [ ] **Style** — How the range and the handlers look visually (see documentation for inspiration)
- [ ] **Intervals** — Whether the slider intervals has continuous (any value between 0-10000), or stepped (fixed values like a 0-5 rating)
- [ ] **Handles** — The elements that users select to drag and change the slider value
  - *Conseil :* Handles should clearly 'break' out from the slider container to be easily identified
- [ ] **Labelling** — Text that conveys the spectrum of the slider, or if there are intervals between those ends too
- [ ] **Interaction states** — What the handles and slider look like when the user is changing the value

**Notes de conception**

- **Style** — Sliders can look different based on the context and purpose. The direction of your other design system components can influence how it should look too.
- **Labels** — Labels help define the ends of your slider spectrum, or the intervals available, depending on what the slider is being used for.
- **Handle interaction** — It's critical for it to be visually clear when a user is interacting with the handle to change the value.
- **Tooltip** — If the slider value is more abstract, it's typical to show the value by default or on interaction, so the user understands precisely what is selected.
- **Input as value** — If a slider has an extremely wide range, an input can help make it easier to define a particular value, instead of relying on the user to drag to that exact point.

*Voir aussi :* Carousel, Input Field, Tooltip

---

## Toast

<https://checklist.design/design-system/toast>

A toast is a brief, non-disruptive message that appears temporarily at the edge of the screen to provide feedback about an action or system status.

**Checklist**

- [ ] **Copy** — The text in the toast
  - *Conseil :* Copy should be clear and concise, focusing on a status or action
- [ ] **Placement** — Toast should appear on the corners of the viewport, not as the focus
- [ ] **Usage** — Toasts are triggered to appear after an action or event
- [ ] **Variants** — Dictated by colour usually, variants affects the emotion of a message
  - *Conseil :* Example: A green toast informing success, red toast informing error. If informing a status, don't rely on just color and leverage icons or the copy.
- [ ] **Length of appearance** — Toasts should be visible long enough to read but short enough to not obstruct other information for too long
  - *Conseil :* Read the text out loud slowly to gauge how much time is needed
- [ ] **Dismissable** — Depending on the amount of content, a toast can be closed by a user (it should fade away shortly after appearing if it cannot be manually dismissed)

**Notes de conception**

- **Action** — A toast can contain an action: to dismiss, or a specific action related to the context of the toast (view, undo, remove). Not every toast requires an action, so long as it disappears after a set time.
- **Icons**
- **Placement** — Toasts typically appear on the edges of an interface, to be intrusive but not interrupting. The visual represents common spots it can be placed on desktop.
- **Automatic dismissal** — Toasts should stay visible enough to be acknowledged, but eventually dismiss to not intrude the interface for too long

*Voir aussi :* Banner, Icon

---

## Tabs

<https://checklist.design/design-system/tabs>

Tabs are navigation elements that organize and separate content into different sections within the same view. They allow users to switch between related content, maintaining context while reducing clutter.

**Checklist**

- [ ] **Labels** — Name of each tab
  - *Conseil :* Label should be logical enough for the user to predict what's in the tab Keep it concise, ideally 1 word
- [ ] **Content area** — Where the content for the active tab is displayed
  - *Conseil :* Typically underneath a horizontal tab, or to the right of a vertical tab
- [ ] **Style** — How the active tab and inactive tabs differentiate visually, as well as the tab container overall
- [ ] **Item order** — Consider the arrangement of tabs to be ordered by popularity or familiarity
- [ ] **States** — Default, active, hover are the key states

**Notes de conception**

- **Style** — How your tab container and cells look. It's important to view them in context of the UI surrounding it, to help it stay aligned
- **Dynamic content** — Make sure that navigating between tabs only changes content underneath it. The user will not expect content to change above the tabs or significantly further away from the component.
- **States** — These are the 3 key states, but you may also want to consider focused and disabled.

*Voir aussi :* Button, Accordion, Icon

---

## Checkbox

<https://checklist.design/design-system/checkbox>

A checkbox is an interactive control that allows users to select or unselect items. They may be a single item to trigger other logic, or a list of multiple items to select amongst.

**Checklist**

- [ ] **Label** — Text paired with the checkbox to indicate what is enabled if selected
- [ ] **Default selection** — Whether the checkbox is selected or not
  - *Conseil :* An active checkbox by default depends on its purpose - it should come down to how much this conveniences the user
- [ ] **Style** — Make sure checkbox is unique and stands out from other input options, and consider whether it's in a container, how it's grouped, and what colour it uses
- [ ] **States** — Default, hover, focused, active and disabled (see documentation tab for examples)

**Notes de conception**

- **Style** — A checkbox can be contained to make it easier to select. But if you can't afford the space for it, just the box and label are fine. It's acceptable to have both in your design system.
- **States** — A breakdown of all different interactions with the checkbox

*Voir aussi :* Radio, Toggle, Input Field

---

## Searchbar

<https://checklist.design/design-system/searchbar>

A search bar is an interactive input field that allows users to find specific content by entering keywords or phrases. It typically includes a text input area and a search icon/button, often enhanced with features like autocomplete suggestions to help users find information quickly.

**Checklist**

- [ ] **Input field** — A clear container for a user to start typing in
- [ ] **Label or placeholder text** — Identify the purpose of the field is for them to search
  - *Conseil :* Use your placeholder text to suggest examples of what to search for
- [ ] **Quick links, autocomplete and suggestions** — As the user is typing, offer available links and phrases based on what they have entered so far
  - *Conseil :* With enough data from the user, you can collect quick links and suggestions based on their previous searches to streamline their search
- [ ] **Submit search button** — A visible link to submit search and view results
  - *Conseil :* Include a loading icon or feature once search has been submitted incase there is a connection issue
- [ ] **Previous searches** — Showing what a user has searched before can speed up their experience if they frequently search the same queries
- [ ] **Appropriate visibility** — Search should be directly linked to what you are looking for, whether it's searching across the entire platform or in a specific area

*Voir aussi :* Input Field, Icon, Button

---

## Loading

<https://checklist.design/design-system/loading>

A loading indicator is a visual element that communicates to users that content or an action is being processed. It provides feedback through animations like spinning wheels, progress bars, or skeleton screens to maintain user engagement during wait times.

**Checklist**

- [ ] **Visual indicator** — A clear representation that content is loading or in progress of change
- [ ] **Text** — Explaining the loading state
  - *Conseil :* Let the standard 'loading' text be a fallback, and try to be more specific e.g. 'adding your contacts, syncing your emails'
- [ ] **Time** — Determine how long the time between two actions must be to require a loading component
  - *Conseil :* Don't interrupt two actions that instantly transition, but if there's a known 5 second period between two actions then the component is appropriate
- [ ] **Accessibility** — Ensure your loading state can be clearly seen
  - *Conseil :* Place the loading indicator in a container to ensure accessibility, regardless of background If the loading indicator is on its own, create a version appropriate for light/dark backgrounds
- [ ] **Visuals** — Entertain the user with an illustration during the loading state

**Notes de conception**

- **Style** — A loading indicator can have many different looks, the core principle must be that it shows a motion in loop or towards and endpoint.
- **Text** — Text can help remind users what is happening and that they need to wait. It is optional, depending on how much space there is in the area that is loading.
- **Context (optional)** — It doesn't just have to be 'loading'. The loading text can be specific to what action is being run. There's also a chance here to add some personality, as waiting for something to load is typically a mundane experience.

*Voir aussi :* Skeleton, Icon, Color System

---

## Icon

<https://checklist.design/design-system/icon>

An icon is a small, symbolic visual element that represents an action, feature, or concept. It's purpose is to communicate meaning quickly, save space, and enhance visual navigation across an interface.

**Checklist**

- [ ] **Responsiveness** — The flexibility in detail of the icons at varying sizes
  - *Conseil :* Ensure your icon is recognisable in all possible sizes it's displayed at, and whether the detail needs to be simplified at a smaller size
- [ ] **Visual style consistency** — All icons share the same stroke weight, corner radius, and optical sizing approach
- [ ] **Color** — Black and white, flat colors or gradients
  - *Conseil :* Incorporate your branding colours into the style
- [ ] **Naming** — Name an icon by what it literally is so it can be used flexibly
  - *Conseil :* Don't name an icon based on an action so it stays adaptable e.g. a pencil icon shouldn't be named "edit", as it could be used for another purpose elsewhere

**Notes de conception**

- **Styles** — Fill, outline, sharp or rounded — what matters most is that it's consistent!
- **Sizes** — Systemising the icon sizes makes it easier to implement
- **Naming** — Icon names can be based on an action but should also include the literal meaning too e.g. a pencil icon is commonly used for edit, but should still include the name 'pencil'

*Voir aussi :* Button, Color System, Tooltip

---

## Card

<https://checklist.design/design-system/card>

A card is a contained, modular component that groups related information and actions. It displays content like text, images, and interactive elements within a distinct container, often with shadows or borders to create visual hierarchy and organization in layouts.

**Checklist**

- [ ] **Style** — Consider default background, border, shadow
- [ ] **Consistency** — Ensure you have one base style for all cards
- [ ] **Spacing** — A framework to sort your padding levels by
  - *Conseil :* Choose an easily divisible number as your padding difference, like divided by 4 or 5
- [ ] **Responsiveness** — Consider the structure of the content in all various screen sizes
  - *Conseil :* Adopt a 'top-down' approach on mobile to not overfill the rows
- [ ] **Content hierarchy** — The primary action/s you want users to perform
  - *Conseil :* Display links at the end of the card so the user is informed by the content in the card before making a decision

**Notes de conception**

- **Style** — Card style should be consistent across the product, with levels of a particular style e.g. different levels of shadows on all cards.
- **Spacing** — This can be a series of numeric values. The most common is multiples of 4 (8, 12, 16, 24, 32, 48, etc).
- **Radius** — Border radius of cards should be consistent across the product

*Voir aussi :* Button, Avatar, Badge

---

## Badge

<https://checklist.design/design-system/badge>

A badge is a small visual indicator that displays short, dynamic information like counts or status. It typically appears as a colored circle or pill shape, often overlaid on other elements.

**Checklist**

- [ ] **Detail** — A badge can have a numeric value, or a basic shape
  - *Conseil :* A basic shape like a small circle is effective in conveying one update, while numeric value represents the amount of updates
- [ ] **Color** — Badges can represent your standard states - error, success, warning
  - *Conseil :* Be consistent in the details - outlines, shadows, perspective, corners and colours
- [ ] **Offset position** — A badge should sit outside it's relevant element to gain attention easier

**Notes de conception**

- **Number count** — A badge number can indicate an amount of unread items like messages or notifications
- **Dot** — Just a dot is a more subtle option to indicate there is unread items, without including how many

*Voir aussi :* Icon, Color System, Avatar

---

## Avatar

<https://checklist.design/design-system/avatar>

An avatar is a visual representation of a user. It helps identify individuals across a digital interface, commonly used in user profiles, comment sections, and chat applications.

**Checklist**

- [ ] **Visualiser** — Show what the avatar looks like before posting or updating
- [ ] **Link to upload or select avatar** — Accessible link for a user to select
  - *Conseil :* If you want the avatar visual itself to be clickable to change, add an indicator on it to show it's editable from that source e.g. a pencil icon
- [ ] **Placeholder image** — If a user hasn't uploaded or added an avatar yet there should be a placeholder e.g. a default icon, or the user's initials
- [ ] **Acceptable file types** — Tell the user what file types are allowed (JPEG, PNG, SVG)
- [ ] **Status change updating avatar** — This doesn't have to be apart of the avatar component (it can be a banner or toast for example), but it is possible to incorporate it
- [ ] **Alternatives** — If a user doesn't want to upload an image, offer an illustrative alternative, as it's better than nothing and can still convey their personality
- [ ] **Editing uploaded avatar** — Allow a user to crop and resize their avatar before saving it

**Notes de conception**

- **Shape** — An avatar can be rounded in several ways, but what matters most is establishing a consistent shape.
- **Size** — Having pre-determined sizes can help apply an avatar across multiple scenarios.
- **Status** — Accompanying an avatar can be a symbol indicating status, verification and more.
- **Fallback** — Incase a user doesn't want to upload an avatar, it's important to have fallbacks so the component can still appear in the UI.

*Voir aussi :* Icon, Badge, Color System

---

## Dropdown Menu

<https://checklist.design/design-system/dropdown-menu>

A dropdown triggered from a button or right-click target to reveal a menu of actions the user can proceed with

**Checklist**

- [ ] **Trigger affordance** — The element that opens the menu: an overflow icon, chevron button, or right-click target
- [ ] **Menu item anatomy** — The structure of each action: label, optional leading icon, optional trailing shortcut, optional destructive styling
  - *Conseil :* Mixing icon and non-icon items in the same list throws off the scan
- [ ] **Section dividers and groups** — Dividers and/or labels that break related actions into sections once the menu gets large
- [ ] **Destructive item styling** — Visual differentiation — typically the danger colour — for actions that cannot be undone
  - *Conseil :* Always place destructive actions at the end of the menu, after a divider to reduce misclicks
- [ ] **Nested submenu** — A secondary menu triggered by a parent item, used for grouping related but distinct actions
  - *Conseil :* Limit nesting to one level to be too layered and confusing
- [ ] **Disabled items** — Menu items that are visible but cannot be triggered, indicating an unavailable action
  - *Conseil :* A tooltip on that item that reveals the reason it is disabled is handy
- [ ] **Positioning and overflow** — The menu's placement relative to its trigger, repositioning automatically to stay within the viewport
- [ ] **Keyboard shortcut display** — Shortcut hints aligned to the trailing edge of the item label

---
