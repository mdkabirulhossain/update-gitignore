const { Octokit } = require("@octokit/rest");
require("dotenv").config();

// Configuration
const TARGET_ENTRIES = [
  "branch_structure.json",
  "temp_auto_push.bat",
  "temp_interactive_push.bat"
];

// Determine if we should perform a dry run or write changes
const isDryRun = !process.argv.includes("--write");

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Error: GITHUB_TOKEN is not set in the .env file.");
    process.exit(1);
  }

  // Initialize Octokit client
  const octokit = new Octokit({
    auth: token,
  });

  // Fetch the authenticated user's details
  let username;
  try {
    const { data: user } = await octokit.rest.users.getAuthenticated();
    username = user.login;
    console.log(`Successfully authenticated as GitHub user: ${username}`);
  } catch (error) {
    console.error("Failed to authenticate. Please check your GITHUB_TOKEN.", error.message);
    process.exit(1);
  }

  console.log(`\nStarting .gitignore cleanup script...`);
  console.log(`Mode: ${isDryRun ? "DRY-RUN (No changes will be written)" : "WRITE (Changes will be committed and pushed)"}`);
  console.log(`Targeting entries: ${TARGET_ENTRIES.map(e => `"${e}"`).join(", ")}\n`);

  // Fetch all repositories where the authenticated user is the owner
  console.log("Fetching repositories...");
  let repos = [];
  try {
    repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
      per_page: 100,
      affiliation: "owner",
    });
    console.log(`Found ${repos.length} total owner repositories.`);
  } catch (error) {
    console.error("Failed to retrieve repositories:", error.message);
    process.exit(1);
  }

  const stats = {
    totalScanned: 0,
    totalArchived: 0,
    totalNoGitignore: 0,
    totalNoChangesNeeded: 0,
    totalChanged: 0,
    totalSuccess: 0,
    totalFailed: 0,
    modifiedRepos: []
  };

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    stats.totalScanned++;
    const repoDisplayName = `${repo.owner.login}/${repo.name}`;

    console.log(`[${i + 1}/${repos.length}] Processing ${repoDisplayName}...`);

    // Skip archived repositories as they are read-only
    if (repo.archived) {
      console.log(`  -> Skipping: Repository is archived.`);
      stats.totalArchived++;
      continue;
    }

    try {
      // Get the .gitignore content
      let gitignoreFile;
      try {
        const response = await octokit.rest.repos.getContent({
          owner: repo.owner.login,
          repo: repo.name,
          path: ".gitignore",
        });
        gitignoreFile = response.data;
      } catch (err) {
        if (err.status === 404) {
          console.log(`  -> Skipping: No .gitignore found.`);
          stats.totalNoGitignore++;
          continue;
        }
        throw err;
      }

      // Decoded base64 content
      const content = Buffer.from(gitignoreFile.content, "base64").toString("utf8");
      
      // Filter out the target entries
      const lines = content.split(/\r?\n/);
      let changed = false;
      const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        const isMatch = TARGET_ENTRIES.some(target => trimmed === target || trimmed === `/${target}`);
        if (isMatch) {
          changed = true;
          return false; // Remove this line
        }
        return true; // Keep this line
      });

      if (!changed) {
        console.log(`  -> No target entries found in .gitignore.`);
        stats.totalNoChangesNeeded++;
        continue;
      }

      // Join using original line endings
      const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
      const updatedContent = filteredLines.join(lineEnding);

      stats.totalChanged++;
      stats.modifiedRepos.push(repoDisplayName);

      console.log(`  -> Found target entries! .gitignore will be updated.`);

      if (isDryRun) {
        console.log(`  [DRY-RUN] Would commit updated .gitignore for ${repoDisplayName}`);
        stats.totalSuccess++; // Count as success in dry-run mode
      } else {
        // Write mode: commit the changes
        const commitMessage = "chore: remove temp and structure files from .gitignore";
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: repo.owner.login,
          repo: repo.name,
          path: ".gitignore",
          message: commitMessage,
          content: Buffer.from(updatedContent).toString("base64"),
          sha: gitignoreFile.sha,
        });
        console.log(`  -> Successfully updated and committed changes to GitHub!`);
        stats.totalSuccess++;
      }

    } catch (error) {
      console.error(`  -> Error processing repository:`, error.message);
      stats.totalFailed++;
    }

    // Add a small delay (150ms) to avoid triggering abuse rate limits
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // Print final summary report
  console.log("\n==============================================");
  console.log("             CLEANUP SUMMARY REPORT           ");
  console.log("==============================================");
  console.log(`Total Repositories Scanned:   ${stats.totalScanned}`);
  console.log(`Archived (Skipped):           ${stats.totalArchived}`);
  console.log(`No .gitignore (Skipped):      ${stats.totalNoGitignore}`);
  console.log(`No Action Needed (Clean):     ${stats.totalNoChangesNeeded}`);
  console.log(`Repositories Requiring Edit:  ${stats.totalChanged}`);
  console.log(`Successfully Processed:       ${stats.totalSuccess}`);
  console.log(`Failed Processes:             ${stats.totalFailed}`);
  
  if (stats.modifiedRepos.length > 0) {
    console.log("\nModified Repositories:");
    stats.modifiedRepos.forEach(r => console.log(` - ${r}`));
  } else {
    console.log("\nNo repositories were modified.");
  }
  
  if (isDryRun && stats.totalChanged > 0) {
    console.log("\n*** NOTE: This was a DRY-RUN. No changes were made on GitHub. ***");
    console.log("To apply the changes, run the script with the --write flag:");
    console.log("  node update-gitignore.js --write");
  }
  console.log("==============================================\n");
}

main().catch(error => {
  console.error("Fatal uncaught error during execution:", error);
  process.exit(1);
});
