# Figma Prompt — Digital Product & Automatic Code Delivery Store

Design a **high-fidelity, production-ready mobile e-commerce UI** for a digital product and automatic code delivery platform.

The product allows users to purchase digital products, activation codes, memberships, downloadable documents, and online services. After payment is successfully verified, digital content or activation codes are automatically delivered to the customer.

## Overall Design Direction

Create a clean, elegant, friendly, modern mobile interface.

Visual style:

- Minimal and premium
- Soft hand-drawn illustration style
- Subtle female character illustrations
- Light journal / lifestyle aesthetic
- Large amount of white space
- Soft pink as the primary accent color
- Blue-gray for secondary UI elements
- Green only for success and completed states
- Avoid excessive decoration
- Avoid overly childish cartoon styling
- Avoid strong gradients
- Avoid heavy shadows
- Keep the interface professional enough for a real commercial product

The illustrations should support the interface rather than dominate it.

The final design should feel like a combination of:

**modern digital store + personal creator brand + soft hand-drawn lifestyle aesthetic.**

---

# Design System

Mobile frame:

**390 × 844 px**

Use:

- Auto Layout
- Reusable components
- Component variants
- Consistent spacing
- 8pt spacing system
- Responsive constraints
- Developer-friendly layer naming
- Clear visual hierarchy

## Colors

Background:
#FFFFFF

Secondary background:
#F7F8FA

Primary pink:
#FF6F91

Soft pink:
#FFF1F4

Primary text:
#1F2937

Secondary text:
#6B7280

Border:
#E5E7EB

Success green:
#22C55E

Success background:
#ECFDF3

Warning:
#F59E0B

## Typography

Use a clean modern sans-serif font.

Suggested hierarchy:

Page Title:
24px / SemiBold

Section Title:
18px / SemiBold

Product Title:
16px / Medium

Body:
14px / Regular

Secondary Text:
12px / Regular

Price:
20–24px / Bold

Button:
16px / SemiBold

## UI Tokens

Main page horizontal padding:
16px

Card radius:
16px

Small element radius:
10px

Primary button radius:
14px

Primary button height:
52px

Input height:
48px

Card padding:
16px

Minimum touch target:
44px

Use subtle 1px borders and very soft shadows.

---

# Screen 01 — Home

Create a modern digital product marketplace homepage.

Top navigation:

- Brand logo / creator avatar
- Brand name
- Search icon

Below the navigation create horizontally scrollable category chips:

- Recommended
- Documents
- Memberships
- Activation Codes
- Services

Add a small hand-drawn female illustration or creator illustration near the top as part of the brand identity.

Create a two-column product grid.

Each product card contains:

- Product thumbnail
- Product name
- Short description
- Price
- Delivery status
- Stock status when applicable

Example products:

AI Practical Guide  
$199

1-on-1 AI Coaching  
$599

Premium Membership  
$99

Software Activation Code  
$49

Use small status badges such as:

“Instant Delivery”

“Digital Download”

“Booking Required”

“Low Stock”

Bottom navigation:

Home  
Orders  
Profile

Home should be active.

---

# Screen 02 — Product Detail

Create a clean immersive product detail page.

Top navigation:

Back button  
Product Details

Large product hero image or hand-drawn illustration.

Below the image:

Product title

Short description

Large price

Example:

AI Practical Guide

$199

Add:

“What You’ll Get”

with 3–4 concise benefit points.

Example:

Complete step-by-step guide  
Reusable templates  
Practical examples  
Future content updates

Add delivery information:

“Digital content will be available immediately after successful payment.”

If the product uses inventory, display:

Stock: 23 remaining

Include a subtle stock progress bar.

Quantity selector:

−  1  +

Create a large full-width primary CTA:

**Buy Now**

Below the CTA display supported payment methods.

Keep the bottom purchase area sticky when scrolling.

---

# Screen 03 — Checkout

Top navigation:

Back  
Confirm Order

Create an order summary card containing:

Product image  
Product name  
Quantity  
Unit price  
Subtotal

Payment method section:

Alipay  
WeChat Pay

Use radio selection components.

Order total should be visually prominent.

Example:

Total  
$199

Primary full-width button:

**Pay Now**

Below the button:

“Please complete payment within 15 minutes.”

Keep the checkout page extremely clean and distraction-free.

---

# Screen 04 — Payment Processing

Create a minimal payment processing screen.

Show:

Payment amount

Large amount text

Payment provider

Loading / processing state

Message:

“Confirming your payment…”

Include a subtle animated loading indicator.

Do not include unnecessary navigation or promotional elements.

---

# Screen 05 — Payment Success / Automatic Delivery

This is the most important screen.

Create a strong success state using:

Large green success icon

Title:

**Payment Successful**

Subtitle:

**Your digital product is ready**

Display order information:

Product Name  
Order Number  
Payment Time

Create a dedicated digital delivery card.

For activation-code products:

Activation Code

XXXX-XXXX-XXXX

Button:

**Copy**

If multiple codes exist:

Code 01  
XXXX-XXXX-XXXX

Code 02  
XXXX-XXXX-XXXX

Add a full-width secondary action:

**Copy All Codes**

For downloadable products, support an alternative delivery component:

**Download File**

For service products, support:

**Book Your Session**

Add a small security notice:

“Please save your digital content securely.”

Bottom actions:

View Order

Back to Home

Do not allow accidental navigation back into the payment flow.

---

# Screen 06 — Orders

Title:

My Orders

Create status filter tabs:

All  
Pending Payment  
Delivered  
Completed  
Refunded

Each order card contains:

Order number  
Product thumbnail  
Product name  
Quantity  
Amount  
Order status

Actions depend on status.

Pending:

**Continue Payment**

Delivered:

**View Details**

Use clear color-coded status labels without excessive colors.

Bottom navigation remains visible.

Orders should be active.

---

# Screen 07 — Order Details

Top navigation:

Back  
Order Details

Display:

Order number  
Order time  
Payment method  
Order status  
Product  
Quantity  
Total amount

Below this create:

**Digital Delivery**

For code products show the activation code with Copy button.

For documents show:

Download File

For services show:

Booking Information

Add:

Contact Support

Request Support / After-sales

---

# Screen 08 — Profile

Create a simple personal account page.

Header card:

Avatar  
Username  
Login / Account Management

Order shortcuts:

Pending Payment  
Delivered  
All Orders

Utility section:

Customer Support  
Help Center  
Settings

Bottom navigation:

Home  
Orders  
Profile

Profile should be active.

---

# Desktop Admin Dashboard

Also create a desktop admin interface.

Frame width:

1440px

Use a professional SaaS dashboard design.

Do NOT use the hand-drawn illustration style heavily in the admin dashboard.

The admin interface should be cleaner and more operational.

Left sidebar navigation:

Dashboard  
Products  
Digital Inventory  
Orders  
Customers  
Settings

---

# Admin — Dashboard

Create KPI cards:

Today’s Revenue

Today’s Orders

Digital Inventory

Low Stock Alerts

Create a 7-day revenue chart.

Below the chart show recent orders.

Columns:

Order ID  
Customer  
Product  
Amount  
Payment Status  
Delivery Status  
Time

---

# Admin — Product Management

Create a product management table.

Columns:

ID  
Product  
Type  
Price  
Inventory  
Status  
Sales  
Actions

Product types:

Digital File

Activation Code

Membership

Service

Actions:

Edit  
Publish / Unpublish  
Delete

Primary action:

**Add Product**

---

# Admin — Product Editor

Fields:

Product Name

Product Description

Product Type

Price

Cover Image

Delivery Type

Inventory Source

Automatic Delivery

Publish Status

Delivery types:

Activation Code

Digital File

Download Link

Manual Service

Booking Service

Primary action:

Save Product

---

# Admin — Digital Inventory

Create an inventory management interface.

Support activation code pools.

Display:

Inventory Name

Total Codes

Available

Sold

Reserved

Actions

Inside an inventory pool display:

Code

Status

Related Order

Created Time

Sold Time

Filters:

All  
Available  
Reserved  
Sold

Actions:

Import Codes

Export Available Codes

Delete Sold Codes

---

# Import Codes Modal

Create a modal allowing administrators to paste multiple activation codes.

Instruction:

“One code per line”

Large textarea.

Also support file upload.

Primary action:

**Import Codes**

After import show:

Successfully Imported

Duplicates

Invalid Codes

---

# Admin — Order Management

Create an order table.

Columns:

Order ID

Customer

Product

Quantity

Amount

Payment Status

Delivery Status

Order Time

Actions

Filters:

Order Status

Payment Status

Product

Date Range

Search

---

# Admin — Order Details

Display:

Order ID

Customer

Product

Quantity

Amount

Payment Status

Delivery Status

Payment Method

Order Time

Payment Time

Delivered Digital Content

Admin actions:

Resend Digital Content

Mark as Exception

Refund

Contact Customer

---

# Component Library

Create reusable Figma components for:

Primary Button

Secondary Button

Icon Button

Product Card

Order Card

Digital Delivery Card

Activation Code Card

Category Chip

Status Badge

Navigation Bar

Bottom Tab Bar

Quantity Selector

Payment Method Selector

Input Field

Search Field

Modal

Toast Notification

Empty State

Loading State

Success State

Error State

Dashboard KPI Card

Admin Table

Admin Sidebar

---

# Component States

Buttons:

Default  
Pressed  
Disabled  
Loading

Product:

Available  
Low Stock  
Sold Out

Order:

Pending Payment  
Paid  
Delivered  
Completed  
Refunded  
Failed

Activation Code:

Available  
Reserved  
Sold

Payment:

Waiting  
Processing  
Successful  
Failed

---

# Prototype Interactions

Create a clickable prototype for the main purchase flow:

Home  
→ Product Detail  
→ Checkout  
→ Payment  
→ Payment Success  
→ View Order

Also prototype:

Home  
→ Orders  
→ Order Details

and:

Profile  
→ Orders

Use natural mobile transitions.

---

# Developer Handoff Requirements

The design must be suitable for real frontend development.

Use:

Auto Layout everywhere possible

Consistent spacing tokens

Reusable components

Component variants

Semantic layer names

Consistent typography styles

Color variables

Spacing variables

Clear component hierarchy

Avoid unnecessary absolute positioning.

Keep UI elements technically realistic and easy to implement using React, Next.js, Flutter, React Native, or uni-app.

Do not generate conceptual wireframes.

Generate **polished, high-fidelity, production-ready UI screens**.