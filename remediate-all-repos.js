const { Octokit } = require("@octokit/rest");
require("dotenv").config();

const BAD_GITIGNORE_ENTRIES = [
  ".gitignore",
  "branch_structure.json",
  "temp_auto_push.bat",
  "temp_interactive_push.bat"
];

const CLEAN_POSTCSS_MJS = `const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
`;

const CLEAN_POSTCSS_JS = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const CLEAN_TASKS_JSON = JSON.stringify(
  {
    version: "2.0.0",
    tasks: []
  },
  null,
  2
) + "\n";

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Error: GITHUB_TOKEN is not set in .env file.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  let username;
  try {
    const { data: user } = await octokit.rest.users.getAuthenticated();
    username = user.login;
    console.log(`Authenticated as GitHub user: ${username}`);
  } catch (error) {
    console.error("Failed to authenticate with GitHub:", error.message);
    process.exit(1);
  }

  console.log("\n========================================================");
  console.log("   COMMENCING COMPREHENSIVE GITHUB REPO DISINFECTION    ");
  console.log("========================================================\n");

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    affiliation: "owner",
  });

  console.log(`Scanning ${repos.length} owner repositories for complete remediation...\n`);

  const summary = {
    totalScanned: 0,
    fontsDeleted: [],
    tasksSanitized: [],
    settingsSanitized: [],
    postcssSanitized: [],
    gitignoresCleaned: [],
    errors: []
  };

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    if (repo.archived) continue;
    summary.totalScanned++;

    const owner = repo.owner.login;
    const name = repo.name;
    const repoDisplayName = `${owner}/${name}`;

    // -----------------------------------------------------------
    // 1. Eradicate Disguised Font Dropper (fa-solid-500.woff2)
    // -----------------------------------------------------------
    try {
      let fontFile;
      try {
        const res = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path: "public/fonts/fa-solid-500.woff2",
        });
        fontFile = res.data;
      } catch (err) {
        if (err.status !== 404) console.error(`  [${repoDisplayName}] Error checking fa-solid-500.woff2:`, err.message);
      }

      if (fontFile && fontFile.sha) {
        console.log(`[!] [${repoDisplayName}] Malicious font file detected! Deleting from repository...`);
        await octokit.rest.repos.deleteFile({
          owner,
          repo: name,
          path: "public/fonts/fa-solid-500.woff2",
          message: "fix(security): remove disguised malware font payload",
          sha: fontFile.sha,
        });
        console.log(`    -> Successfully deleted public/fonts/fa-solid-500.woff2`);
        summary.fontsDeleted.push(repoDisplayName);
      }
    } catch (err) {
      console.error(`  [${repoDisplayName}] Failed to delete font file:`, err.message);
      summary.errors.push(`${repoDisplayName} font deletion: ${err.message}`);
    }

    // -----------------------------------------------------------
    // 2. Sanitize .vscode/tasks.json (Malicious auto-run tasks)
    // -----------------------------------------------------------
    try {
      let tasksFile;
      try {
        const res = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path: ".vscode/tasks.json",
        });
        tasksFile = res.data;
      } catch (err) {
        if (err.status !== 404) console.error(`  [${repoDisplayName}] Error checking .vscode/tasks.json:`, err.message);
      }

      if (tasksFile && tasksFile.content) {
        const content = Buffer.from(tasksFile.content, "base64").toString("utf8");
        if (content.includes("fa-solid") || content.includes("woff2") || content.includes("folderOpen") || content.includes("temp_auto_push")) {
          console.log(`[!] [${repoDisplayName}] Malicious task found in .vscode/tasks.json. Sanitizing...`);
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo: name,
            path: ".vscode/tasks.json",
            message: "fix(security): sanitize .vscode/tasks.json and remove auto-run malware task",
            content: Buffer.from(CLEAN_TASKS_JSON).toString("base64"),
            sha: tasksFile.sha,
          });
          console.log(`    -> .vscode/tasks.json sanitized on GitHub.`);
          summary.tasksSanitized.push(repoDisplayName);
        }
      }
    } catch (err) {
      console.error(`  [${repoDisplayName}] Failed to sanitize .vscode/tasks.json:`, err.message);
      summary.errors.push(`${repoDisplayName} tasks sanitization: ${err.message}`);
    }

    // -----------------------------------------------------------
    // 3. Sanitize .vscode/settings.json (task.allowAutomaticTasks)
    // -----------------------------------------------------------
    try {
      let settingsFile;
      try {
        const res = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path: ".vscode/settings.json",
        });
        settingsFile = res.data;
      } catch (err) {
        if (err.status !== 404) console.error(`  [${repoDisplayName}] Error checking .vscode/settings.json:`, err.message);
      }

      if (settingsFile && settingsFile.content) {
        const content = Buffer.from(settingsFile.content, "base64").toString("utf8");
        if (content.includes("task.allowAutomaticTasks") || content.includes("folderOpen")) {
          try {
            const parsed = JSON.parse(content);
            delete parsed["task.allowAutomaticTasks"];
            if (parsed.tasks && parsed.tasks.runOn === "folderOpen") {
              delete parsed.tasks;
            }
            const updatedContent = JSON.stringify(parsed, null, 2) + "\n";
            console.log(`[!] [${repoDisplayName}] Disabling automatic tasks in .vscode/settings.json...`);
            await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo: name,
              path: ".vscode/settings.json",
              message: "fix(security): disable automatic tasks in .vscode/settings.json",
              content: Buffer.from(updatedContent).toString("base64"),
              sha: settingsFile.sha,
            });
            console.log(`    -> .vscode/settings.json updated on GitHub.`);
            summary.settingsSanitized.push(repoDisplayName);
          } catch (parseErr) {
            // If invalid JSON, regex replace
            const cleaned = content
              .replace(/"task\.allowAutomaticTasks"\s*:\s*true,?\r?\n?/g, "")
              .replace(/"tasks"\s*:\s*\{[^}]*\},?\r?\n?/g, "");
            await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo: name,
              path: ".vscode/settings.json",
              message: "fix(security): disable automatic tasks in .vscode/settings.json",
              content: Buffer.from(cleaned).toString("base64"),
              sha: settingsFile.sha,
            });
            console.log(`    -> .vscode/settings.json updated on GitHub.`);
            summary.settingsSanitized.push(repoDisplayName);
          }
        }
      }
    } catch (err) {
      console.error(`  [${repoDisplayName}] Failed to sanitize .vscode/settings.json:`, err.message);
      summary.errors.push(`${repoDisplayName} settings sanitization: ${err.message}`);
    }

    // -----------------------------------------------------------
    // 4. Sanitize PostCSS configs (ShopNexa, VTMERCH, etc.)
    // -----------------------------------------------------------
    for (const postcssPath of ["postcss.config.mjs", "postcss.config.js", "postcss.config.cjs"]) {
      try {
        let postcssFile;
        try {
          const res = await octokit.rest.repos.getContent({
            owner,
            repo: name,
            path: postcssPath,
          });
          postcssFile = res.data;
        } catch (err) {
          if (err.status !== 404) console.error(`  [${repoDisplayName}] Error checking ${postcssPath}:`, err.message);
        }

        if (postcssFile && postcssFile.content) {
          const content = Buffer.from(postcssFile.content, "base64").toString("utf8");
          if (content.includes("global.i=") || content.includes("_0x240a") || content.length > 500) {
            console.log(`[!] [${repoDisplayName}] Malware payload detected in ${postcssPath}! Sanitizing...`);
            const cleanContent = postcssPath.endsWith(".mjs") ? CLEAN_POSTCSS_MJS : CLEAN_POSTCSS_JS;
            await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo: name,
              path: postcssPath,
              message: "fix(security): remove corrupted malware injection from postcss config",
              content: Buffer.from(cleanContent).toString("base64"),
              sha: postcssFile.sha,
            });
            console.log(`    -> ${postcssPath} successfully disinfected on GitHub!`);
            summary.postcssSanitized.push(`${repoDisplayName} (${postcssPath})`);
          }
        }
      } catch (err) {
        console.error(`  [${repoDisplayName}] Failed to sanitize ${postcssPath}:`, err.message);
        summary.errors.push(`${repoDisplayName} ${postcssPath}: ${err.message}`);
      }
    }

    // -----------------------------------------------------------
    // 5. Clean .gitignore Stealth Entries
    // -----------------------------------------------------------
    try {
      let gitignoreFile;
      try {
        const res = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path: ".gitignore",
        });
        gitignoreFile = res.data;
      } catch (err) {
        if (err.status !== 404) console.error(`  [${repoDisplayName}] Error checking .gitignore:`, err.message);
      }

      if (gitignoreFile && gitignoreFile.content) {
        const content = Buffer.from(gitignoreFile.content, "base64").toString("utf8");
        const lines = content.split(/\r?\n/);
        let changed = false;
        const filteredLines = lines.filter(line => {
          const trimmed = line.trim();
          const isBad = BAD_GITIGNORE_ENTRIES.some(bad => trimmed === bad || trimmed === `/${bad}`);
          if (isBad) {
            changed = true;
            return false;
          }
          return true;
        });

        if (changed) {
          const updatedContent = filteredLines.join(content.includes("\r\n") ? "\r\n" : "\n");
          console.log(`[+] [${repoDisplayName}] Removing stealth malware entries from .gitignore...`);
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo: name,
            path: ".gitignore",
            message: "chore(security): clean up stealth malware entries in .gitignore",
            content: Buffer.from(updatedContent).toString("base64"),
            sha: gitignoreFile.sha,
          });
          console.log(`    -> .gitignore successfully updated on GitHub!`);
          summary.gitignoresCleaned.push(repoDisplayName);
        }
      }
    } catch (err) {
      console.error(`  [${repoDisplayName}] Failed to clean .gitignore:`, err.message);
      summary.errors.push(`${repoDisplayName} .gitignore: ${err.message}`);
    }

    // Rate-limit pause
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // -----------------------------------------------------------
  // Final Remediation Report
  // -----------------------------------------------------------
  console.log("\n========================================================");
  console.log("            REMEDIATION COMPLETION REPORT               ");
  console.log("========================================================");
  console.log(`Total Repositories Scanned:          ${summary.totalScanned}`);
  console.log(`Malware Font Droppers Deleted:      ${summary.fontsDeleted.length}`);
  console.log(`Malicious Tasks Sanitized:          ${summary.tasksSanitized.length}`);
  console.log(`Auto-Task Settings Sanitized:       ${summary.settingsSanitized.length}`);
  console.log(`Injected PostCSS Configs Cleaned:   ${summary.postcssSanitized.length}`);
  console.log(`Stealth .gitignore Files Cleaned:    ${summary.gitignoresCleaned.length}`);
  console.log(`Errors Encountered:                 ${summary.errors.length}`);

  if (summary.fontsDeleted.length > 0) {
    console.log("\nDeleted Font Droppers in:");
    summary.fontsDeleted.forEach(r => console.log(` - ${r}`));
  }

  if (summary.tasksSanitized.length > 0) {
    console.log("\nSanitized .vscode/tasks.json in:");
    summary.tasksSanitized.forEach(r => console.log(` - ${r}`));
  }

  if (summary.postcssSanitized.length > 0) {
    console.log("\nDisinfected PostCSS in:");
    summary.postcssSanitized.forEach(r => console.log(` - ${r}`));
  }

  if (summary.gitignoresCleaned.length > 0) {
    console.log("\nCleaned .gitignore in:");
    summary.gitignoresCleaned.forEach(r => console.log(` - ${r}`));
  }

  if (summary.errors.length > 0) {
    console.log("\nErrors:");
    summary.errors.forEach(e => console.log(` ! ${e}`));
  }
  console.log("========================================================\n");
}

main().catch(err => {
  console.error("Fatal error during remediation:", err);
  process.exit(1);
});
