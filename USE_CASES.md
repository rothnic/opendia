# OpenDia Use Cases: Content Creation & Research

This document explores how OpenDia's "Companion" architecture enables novel workflows for content creators, researchers, and knowledge workers. The core value proposition is **turning passive browsing into active, structured data collection**.

## 1. The "Curator" Workflow (Aggregators & Lists)
**Scenario**: A user is building a "Top 10 AI Tools" blog post or a "Best Coffee Shops in Tokyo" directory.
-   **Traditional Way**: Open tab, copy name, paste to spreadsheet, copy URL, paste, copy description, paste. Repeat 50 times.
-   **OpenDia Way (Confidence-First)**:
    1.  User visits a tool's landing page.
    2.  OpenDia sidebar asks: "Add to 'AI Tools' list?" (Context Awareness: It knows you are building this list).
    3.  **Auto-Extraction**: Agent extracts Name, Pricing, Key Features, and Logo URL.
    4.  **Visual Confirmation**: The agent highlights the extracted price *directly on the webpage*.
    5.  **User Review**: The user sees the highlight, nods, and clicks "Approve". **Zero doubt** about whether the data is correct because the source is visually verified in real-time.
    6.  **Action**: Data is pushed directly to the user's CMS.

## 2. The "Deep Dive" Researcher
**Scenario**: A market analyst is researching competitor pricing and feature sets.
-   **Challenge**: Competitor sites have vastly different layouts, and some show different prices based on location.
-   **OpenDia Way (Context-Parity)**:
    1.  User defines a "Schema" in the sidebar.
    2.  User navigates through competitor sites.
    3.  **Exact Match Extraction**: Because the agent shares the user's browser session, it extracts the *exact* price the user sees (including any localized discounts or A/B test variations). No "bot detection" blocks, no "US vs. EU" price mismatches.
    4.  **Learning**: If a site uses a tricky layout, the user highlights the correct element. The system learns this *specific* user's preference for interpreting the data.

## 3. The "Tutorial Builder" (Process Capture)
**Scenario**: A technical writer creating a "How-to" guide for a complex web application (e.g., AWS Console).
-   **OpenDia Way**:
    1.  User activates "Watch Mode".
    2.  User performs the task (e.g., "Launch EC2 Instance").
    3.  OpenDia records the sequence of interactions (Clicks, Inputs) and the *context* of each step.
    4.  **Output**: The agent generates a draft tutorial: "Step 1: Click 'Launch Instance' button (located top-right)...".
    5.  **Playbook**: This sequence is saved as an automation script, allowing the user to *re-run* the process later to verify if the UI has changed.

## 4. Personal Knowledge Management (The "Digital Clipper")
**Scenario**: A developer saving code snippets and library documentation.
-   **OpenDia Way**:
    1.  User highlights a code block on a blog.
    2.  Agent extracts the code, the language, the source URL, and *automatically summarizes* the surrounding context.
    3.  Data is saved to the user's "Code Snippets" vault with proper metadata tags.

## 5. Programmatic Content Generation (Headless Mode)
**Scenario**: Keeping a job board up-to-date.
-   **Phase 1 (Supervised)**: User browses 5 major company career pages. OpenDia learns how to extract "Job Title", "Location", and "Apply Link" from each.
-   **Phase 2 (Automated)**: The "Playbooks" for these 5 sites are fed into a headless browser fleet.
-   **Result**: Every morning, the fleet runs the playbooks, extracts new jobs, and updates the job board automatically. If a site design changes and extraction fails, the system alerts the user to "jump in" and retrain the agent via the Companion interface.
