# GitHub .gitignore Cleanup Utility

A Node.js tool designed to scan all your GitHub repositories, inspect their `.gitignore` files, and automatically clean up specific temporary or structure files (such as `branch_structure.json`, `temp_auto_push.bat`, and `temp_interactive_push.bat`).

## Features
* **Paginated Scanning:** Fetches all your owner repositories automatically (handles 100+ repos).
* **Smart Filter:** Removes only targeted entries (with or without leading slashes) while preserving original line endings.
* **Archived Skipped:** Skips archived repositories as they are read-only.
* **Safety First (Dry-Run):** Safe by default. It won't modify any file on GitHub unless explicitly instructed.
* **Detailed Reports:** Prints a clear summary table of processed repositories at the end.

---

## Requirements
* [Node.js](https://nodejs.org/) (v20 or newer recommended)
* A GitHub Personal Access Token (PAT) with appropriate write access.

---

## Project Setup

### 1. Install Dependencies
Run the following command in your terminal to install the necessary dependencies:
```bash
npm install
```

### 2. Configure Environment Variables (`.env`)
Create a file named `.env` in the root directory of this project and add your GitHub Personal Access Token (PAT) as shown below:

```env
GITHUB_TOKEN=your_github_pat_token_here
```

> [!WARNING]
> Never commit your `.env` file to a public repository. It contains sensitive credentials.

---

## Getting a GitHub Personal Access Token (PAT)

To allow the script to clean up `.gitignore` files on your account:
1. Go to **GitHub** $\rightarrow$ **Settings** $\rightarrow$ **Developer settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Fine-grained tokens**.
2. Click **Generate new token**.
3. Under **Repository access**, select **All repositories** (or select the specific repositories you want to clean up).
4. Under **Repository permissions**, find **Contents** and set it to **Read and write** (this permits committing updates).
5. Click **Generate token**, copy the generated value, and paste it into your `.env` file.

---

## How to Run the Tool

### Step 1: Perform a Dry-Run (Safe Mode)
Always run the script in **Dry-Run** mode first to preview what changes would be made without affecting GitHub:
```bash
node update-gitignore.js
```
Review the list of repositories requiring edits in the final summary report.

### Step 2: Apply the Changes (Write Mode)
If the dry-run output looks correct, apply the changes and commit them to GitHub using the `--write` flag:
```bash
node update-gitignore.js --write
```
The script will update the `.gitignore` files, make commits with the message `chore: remove temp and structure files from .gitignore`, and push them to your repositories.
