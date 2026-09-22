# Flows

Parcours utilisateurs de bout en bout. Source : <https://checklist.design/flows>

---

## Adding to cart

<https://checklist.design/flows/adding-to-cart>

Shopping online means users need to easily add products they want to their cart. This fundamental action can make or break a sale, so getting it right is crucial.

**Notes de conception**

- **Outline variant selection for product** — Whether it’s size, colour, amount or something else, it must be clear what details must be picked to be able to add an item to cart.
- **Primary action on product page is add to cart** — One of if not the most prominent button on the page to draw the user’s attention. This may change if you want an 'add to cart' button on a grid view of multiple products.
- **Feedback once added** — Immediate confirmation the item has been added. This can be done several ways and depends on the amount of intrusion you want to have, which is why 2 options are shown.
- **Link to cart view** — Typically in a primary navigation, so that if the user continues shopping but is then ready to checkout, the cart is easily accessible. Showing the number of products is a way to catch their attention that they have items added but not purchased yet. A total price can also be considered to be shown.

*Voir aussi :* Button, Toast, Cart, Badge, Entering promo code

---

## Uploading media

<https://checklist.design/flows/uploading-media>

**Notes de conception**

- **Empty state** — Show a clear visual placeholder with an upload icon and simple text that indicate a file can be dropped into the area to upload. It’s also suitable to offer a click to upload route incase a user prefers that option.
- **Drag and drop interaction** — When a file is across the interaction canvas, there should be a clear visual state change to indicate it has detected a file attempting to be dropped. This lets the user know it’s safe to release the file at this point.
- **Progress indicator** — Display progress that updates in real-time so users know their upload is working. If a percentage is not possible to show, a loading indicator can at least show that something is happening. Include file names and show overall progress when uploading multiple files to keep users informed throughout the process.
- **File restrictions & constraints** — Clearly state limits to what files can be uploaded. This is commonly file size and format, shown in the upload area before users attempt to upload files. If a user tries to upload a file outside the constraints, an error message should show explaining it does follow the constraints.
- **Outcome status** — Use visual indicators like green checkmarks for successful uploads and red warning icons for failures. For failures, include an error message explaining what went wrong and what users can do to fix it.
- **Upload actions** — Ways to interact with an upload. Choose which actions to show by default vs on hover based on available space, aiming to avoid overwhelming users with too many visible options. Common actions include: Retry failed uploads Cancel upload in progress Delete files Rename files
- **Showing multiple uploaded files** — Display files in a clean list or grid with thumbnails when possible, and ensure the layout you choose is scalable. What information you show about each file depends on the context of the upload. A file name or size can be relevant in one case, while seeing the images uploaded can be the relevant detail in another.

*Voir aussi :* Button, Loading, Toast, Modal, Submitting a form, Saving changes

---

## Canceling subscription

<https://checklist.design/flows/canceling-subscription>

Similar to closing an account, a user can decide to end their experience and stop paying for your product. Just because they're leaving doesn't mean we can't give them a graceful exit. It's important to make a cancelation obvious to find and easy to travel through.

**Notes de conception**

- **Show a link in account details** — This doesn't have to be the first or most prominent link, but it should be clearly visible. If you're unsure about including it on the account page, it's suitable to place on the billing settings.
- **Confirm intent to cancel** — Sometimes, a user misclicks. So it's okay to ask if they're sure they want to make this choice, and not just automatically canceling their subscription. But... while the user is there, you can attempt a last ditch effort to reel them back (it cannot be pressuring or manipulative). If the product can only be access with a subscription, you can remind them of the product's value. If the product can be access in a free version, you can remind them of that specific subscription's value.
- **Request a reason for canceling (optional)** — It can be helpful to receive feedback on why a user is canceling. Too expensive? Competitor preferred? Just don't need it anymore? It's an easy way to start identifying the key factors affecting churn.
- **Confirm subscription has been canceled** — Now that it's canceled, make sure you tell the user when their subscription is active until.

*Voir aussi :* Button, Billing, Modal, Pricing, Toast, Deleting account, Contacting support

---

## Filtering items

<https://checklist.design/flows/filtering-items>

Filtering helps users find what they need in large collections by specifying specific values of properties the items contain.

**Notes de conception**

- **Show action near item collection** — Place above or beside the collection it affects, using a recognizable icons and/or label.
- **Show available filter options** — When the action is triggered, filter options can either be shown on the same page for immediate feedback, or on another page. This should be dependent on the amount of filtering that is possible, and whether you think the user is likelier to tweak filters ongoing, or apply several and then view results. It's also worthwhile considering a filtering priority order, with the most common options filtered sitting at the front.
- **Consider different filter types** — The standard filter is a multi-select option picker. But certain properties can benefit from a different way of managing the filtering. There's sliders, checkboxes, dropdowns and others to consider. Each property should be considered, asking yourself what feels like the easiest way to change this value.
- **Show active filters clearly when applied** — On the item collection page, display which filters are currently applied. You can also choose to have a high level active state applied to the filter action to imply it is in use, if you find showing all applied filters is too cluttered.
- **Provide easy filter removal** — Let users clear individual filters or all filters at once to allow easier refining of their results.
- **Show result count** — Not a must have, but this can be handy where it is meaningful for users to see what the total results value has reduced to. It will help users feel if their result is too narrow or broad, directing them to either add or remove filters.
- **Empty state** — It's possible that a combination of filters can product no results. Explain this clearly and suggest adjusting or clearing filters to see results.

*Voir aussi :* Searchbar, Checkbox, Loading, Skeleton, Search Results

---

## Resetting password

<https://checklist.design/flows/resetting-password>

Every now and then, a user can't remember their password to log back in. Luckily, it's a straightforward process to change it. It's important to make the experience feel straightforward, so the user feels like they've gotten back into their account as smooth as possible.

**Notes de conception**

- **Place reset link close to password field** — Style it as a link to show it is clickable
- **Ask for account details to verify** — In this case it's usually the email address that's requested, because it can recognise your account and be the channel the link is securely sent to. Note: If the user already entered their email address on the previous login page, that can be prefill this field and speed up the flow!
- **Show information has been sent** — Based on the account information provided in Step 2, explain how they can continue. If an email was provided, send an email for the next step. If a mobile number was provided, send a code or link to open.
- **The message sent explains next steps** — This could be a link to a page that allows the user to reset their password. It could also be a code for the user to provide on a page to verify their account, to then reset their password.
- **Reset the password!** — Whether it's a verification code or a link to click behind an email address, the next page should be a clear text field to enter a new password. You can provide guidelines if you have requirements for the password to pass a threshold of strength to be accepted.
- **Password successfully reset** — After the password has been reset, indicate the successful and push their momentum to their initial intent: logging in.

*Voir aussi :* Login, Input Field, Button, Login, Login, Toast, 2FA, Showing input error

---

## Submitting a form

<https://checklist.design/flows/submitting-a-form>

A form can help a user achieve anything from creating an account to subscribing to a newsletter. They are often the last step of a user's journey, so should be quick and easy to complete.

**Notes de conception**

- **Show button to submit** — Below the form fields, a button to submit the information needs to be present. You can change the copy to fit the form e.g. the button can say “Subscribe” if someone is providing their email address to receive emails.
- **Show loading state after submission** — The user must see the form is in the process of being submitted. Note: also make sure your hover state is considered before they press the button!
- **Show success message when it submits** — The form was submitted! Let’s communicate that back to the user with a clear success message.
- **If it doesn't, show an error message** — Sometimes, things don’t work out. If the form can’t submit, because of invalid information or another error, that also needs to be shown.
- **An error may occur because of the wrong information** — If the criteria for a text field isn’t met, the form can fail to submit due to that error, and must be detailed.

*Voir aussi :* Input Field, Button, Toast, Loading, Showing input error, Multi-step form

---

## Saving changes

<https://checklist.design/flows/saving-changes>

Users are constantly updating their details. They might be changing an email address, fixing a typo in their name, or updating their payment details. That's why it's important to confirm that a change has been saved, in the clearest way. Here's a breakdown of how changes being saved should look and feel like.

**Notes de conception**

- **Show action that enables change** — There should be an action to enable information to be updated. It may be automatically editable, but that can be riskier for some software. If it is read-only by default, then a button can trigger the editable version to then update and save.
- **Disable save action until changes are made** — An action should be visible as a source of confirming changes to be saved - this is usually a button. Initially, the action can be disabled. It indicates no changes have been made, and there is nothing to save. A common location for this action is in the navigation above the fold, so it's always visible over the content. Another option is after all the content that's editable.
- **State changes to active once a change is made** — In the example, we've changed the email address, which means a change is waiting to be saved. Changing the button state to active brings the user's attention to the action.
- **Action changes to loading state when pressed** — Now that the changes are being saved, you want to show that action is in progress. You can do so with a loading spinner in the action, as the user's view will be on that element.
- **Notify changes have been saved** — The page will reload or update, and this is the critical part. The user should now be informed that their changes have been saved. They can now safely leave the page, knowing the details are locked in until they choose to change them again.

*Voir aussi :* Billing, Button, Toast, Modal, Submitting a form, Showing input error

---

## Entering promo code

<https://checklist.design/flows/entering-promo-code>

A reward for a user to earn a discount on their purchase, promo codes are a pre-requisite in any e-commerce website. ‍ To avoid a confused customer, make sure they understand what is happening with their code - whether it works, expired or isn't applicable.

**Notes de conception**

- **Show promo code input field** — The cart or checkout are pages expected to have a promo code field. It should be in a place that can be seen when scanning towards the button to continue.
- **Promo code applied successfully** — The change can be reflected using your success state colors (likely green) to indicate the code was applied. In the example is two different options, divided by how much information you want to show. For both, hiding the input field altogether makes it clear only one code can be entered.
- **Reflect promo code impact** — This can be shown with the promo code entry as a total amount, or be represented on In item-to-item basis. It's important to also show or at least repeat the discount near the total at checkout.
- **Promo code error** — The promo code may not be applicable, or entered incorrectly.
- **Remove promo code** — In some cases, a user might not like the discount offered and prefer the original sale price of an item. Or, they found a better promo code to use.

*Voir aussi :* Billing, Input Field, Button, Toast, Badge, Adding to cart, Making a card payment

---

## Verifying account

<https://checklist.design/flows/verifying-account>

Verification is a critical role to promise security for a user in the early phases of onboarding, which means it must be a smooth experience that feels helps rather than burdensome.

**Notes de conception**

- **Establish a trigger point** — Clearly indicate when verification is required, giving context as to why verification is necessary. It is common to verify the email or phone number used for account creation, because this is ensuring the person with access to those details is the same person creating the account.
- **Method selection (optional)** — Depending on the level of sophistication you want to offer, you can make multiple verification methods available (email, SMS, authenticator). The common default is what the user is using to sign up with e.g. if signing up with email address, send code to email.
- **Confirm delivery and contact information used** — Display the email address or phone number where the verification will be sent so the user can see it is the correct destination. That way if they have not received a code and the contact information provided was incorrect, they can see this, go back, and enter the correct value.
- **Ability to input verification code** — The input field can be intuitive to show a field per digit, but the default input field is perfectly accessible.
- **Incorrect value (and resend option)** — Provide specific error messages for different failure scenarios and clear next steps: Expired code: offer link to send a new code Incorrect code: ask to check email/SMS again or offer link to send new code Too many incorrect attempts: contact support team or wait for defined time period before trying again
- **Verification success state** — Display clear confirmation when verification succeeds and continue to next step of interface.

*Voir aussi :* Button, Toast, Modal, 2FA, Login

---

## Showing input error

<https://checklist.design/flows/showing-input-error>

Users mistype all the time - whether it's a finger slipping or rushing through letters, errors happen. So for an everyday occurrence, solving an error should be obvious and seamless. The key parts of making that happen are strong visuals, clear communication, and state changes — which are all featured below.

**Notes de conception**

- **Keep the input in default state** — The text field should be checked for errors only after the information has been entered.
- **Allow user to enter information** — Let the user type without interruptions and submit the information aka don't assess as changes are made.
- **Signal error after loss of focus** — After the input has lost focus (user has clicked another element), the field should be assessed. Looks like we have an error here! In this case, explain why the error happened, and what is required to resolve it. For accessibility, combine the text with a visual icon that indicates an error was found.
- **Return to default state upon reattempt** — Once the user focuses on the field again, the error message should disappear. If there is an error again, the process will simply repeat until they are able to continue.

*Voir aussi :* Input Field, Banner, Toast, Submitting a form

---

## Deleting account

<https://checklist.design/flows/deleting-account>

Sometimes it's just not meant to be, and that's okay. Users come and go, so it's important to recognise your solution is only for some and not for all. For those who want to leave, make it as simple as possible. You can try to understand why they're leaving, but don't get too in the way. ‍ There's no need to be passive aggressive or guilt tripping. They'll remember it, and likely share the experience with others who will reconsider your product.

**Notes de conception**

- **Show a link to delete account** — Don't make this difficult. This link should be visible in the profile or settings of a product. It should also be available in the support area.
- **Politely ask for feedback** — It helps to know why somebody is choosing to leave. But, it should not be pressured or forcefully asked. Convey the request feedback to improve other people's experience and to also consider their personal reasons.
- **Explain what it means to delete the account before confirming** — Be clear with what happens to the account and the information in it should a user close. Is all the data permanently deleted? Can they come back and restore their account? Is the deletion immediate, or can they use their account until a certain date?
- **Confirm account has been deleted** — Now that their account is deleted and it's finally complete, embrace that! Be comfortable acknowledging they have left. Do not show any passive aggressiveness.

*Voir aussi :* Billing, Button, Modal, Toast, Account, Settings

---

## Contacting support

<https://checklist.design/flows/contacting-support>

If there's ever a problem, a user should know how to get help. Then when they try to get that help, they should know exactly what kind of communication they're receiving. Making support not only available but suitable to how users tackle a problem is important on being on the right track together. If you're explaining to a user in text where the interface elements are when a screenshot would tell a much clearer story, then that's the first problem to solve before you even get to theirs.

**Notes de conception**

- **Show a link to contact support** — This can be placed in a number of areas, such as: ‍ • footer in a website • settings in a mobile app • a page experiencing an error Use clear copy and easy to recognise visuals to highlight the link.
- **Show methods of contact** — If you have one option, showcase it! If you have multiple options (chat, call, FAQ), list them out and represent each of their benefits. Chat is great for a specific, complicated issue that needs an instant response. On the other hand, FAQ is great for standard questions that are easy to explain. Also consider the order of the methods. A FAQ as the first option is great because it lets a user find their own answer without waiting on you to respond. But a direct chat can be seen as more convenient as it's less direct troubleshooting for the user.
- **Outline how to communicate and what is expected** — Once a method is chosen, make it clear on how the method will work. Illustrate the response time, and what the user will need to provide to receive support.

*Voir aussi :* Input Field, Button, Toast, Help Center

---

## Making a card payment

<https://checklist.design/flows/making-a-payment>

When paying for something online, two thoughts will come to mind for the user: is this safe, and is this clear? A well-designed payment experience covers these by communicating what's happening with a user's money, and that it's all happening securely. Below are the steps a user will take to submit a card payment, and what factors you'll need to consider.

**Notes de conception**

- **Offer payment methods** — Other methods can be shown, but for this flow we'll focus on the user selecting 'credit or debit card'. This is because it's the one with the most internal effort on designing and building, compared to other services which are often third-party integrations.
- **Request card details** — Show all relevant text fields to complete. Consider the size of these fields relative to the details entered. Note: in a product where the user is revisiting and saved payment methods are available, consider a flow that allows the user to add/remove payment methods.
- **Submit payment with card details entered** — It's also important to consider validation before a user submits their details. Numbers can be mistyped, the card may have expired - so make sure these numerous error states are addressed.
- **Show payment processing** — A payment may not be triggered instantly, taking a few seconds (or minutes). A loading page is crucial to calm the user’s nerves in regards to what’s happening to their money.
- **Confirmation payment processed successfully** — It’s a success! Clearly indicate to the user that their payment was processed, and the funds was received.
- **Outline next steps** — What now? Does the payment trigger something? If so, let the user know. Example 1: a physical product has been purchased. Once the payment has processed, tell the user the order is in motion. Example 2: a user signed up for a subscription. Offer a link to continue to the product to start using it.

*Voir aussi :* Billing, Input Field, Button, Modal, Cart, Toast, Adding to cart

---
