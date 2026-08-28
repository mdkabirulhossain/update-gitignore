const { Octokit } = require("@octokit/rest");
require("dotenv").config();

// Configuration
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

const isDryRun = !process.argv.includes("--write");

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Error: GITHUB_TOKEN is not set in the .env file.");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  let username;
  try {
    const { data: user } = await octokit.rest.users.getAuthenticated();
    username = user.login;
    console.log(`Authenticated as GitHub user: ${username}`);
  } catch (error) {
    console.error("Failed to authenticate:", error.message);
    process.exit(1);
  }

  console.log(`\nStarting cleanup script...`);
  console.log(`Mode: ${isDryRun ? "DRY-RUN (No changes will be written to GitHub)" : "WRITE (Changes will be committed to GitHub)"}\n`);

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    affiliation: "owner",
  });

  console.log(`Found ${repos.length} owner repositories scanning...\n`);

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    if (repo.archived) continue;

    const repoDisplayName = `${repo.owner.login}/${repo.name}`;

    // 1. Check and Clean .gitignore
    try {
      let gitignoreFile;
      try {
        const response = await octokit.rest.repos.getContent({
          owner: repo.owner.login,
          repo: repo.name,
          path: ".gitignore",
        });
        gitignoreFile = response.data;
      } catch (err) {
        if (err.status !== 404) console.error(`  [${repoDisplayName}] Error fetching .gitignore:`, err.message);
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
          console.log(`[+] ${repoDisplayName}: .gitignore requires cleanup.`);
          if (!isDryRun) {
            await octokit.rest.repos.createOrUpdateFileContents({
              owner: repo.owner.login,
              repo: repo.name,
              path: ".gitignore",
              message: "chore: clean up .gitignore file",
              content: Buffer.from(updatedContent).toString("base64"),
              sha: gitignoreFile.sha,
            });
            console.log(`    -> .gitignore successfully updated on GitHub!`);
          }
        }
      }
    } catch (err) {
      console.error(`  [${repoDisplayName}] .gitignore processing failed:`, err.message);
    }

    // 2. Check and Clean postcss.config.mjs / postcss.config.js
    const postcssPaths = ["postcss.config.mjs", "postcss.config.js", "postcss.config.cjs"];
    for (const postcssPath of postcssPaths) {
      try {
        let postcssFile;
        try {
          const response = await octokit.rest.repos.getContent({
            owner: repo.owner.login,
            repo: repo.name,
            path: postcssPath,
          });
          postcssFile = response.data;
        } catch (err) {
          if (err.status !== 404) console.error(`  [${repoDisplayName}] Error fetching ${postcssPath}:`, err.message);
        }

        if (postcssFile && postcssFile.content) {
          const content = Buffer.from(postcssFile.content, "base64").toString("utf8");
          if (content.includes("global.i=") || content.includes("_0x240a") || content.length > 500) {
            console.log(`[!] ${repoDisplayName}: Malware payload detected in ${postcssPath}!`);
            const targetCleanContent = postcssPath.endsWith(".mjs") ? CLEAN_POSTCSS_MJS : CLEAN_POSTCSS_JS;
            if (!isDryRun) {
              await octokit.rest.repos.createOrUpdateFileContents({
                owner: repo.owner.login,
                repo: repo.name,
                path: postcssPath,
                message: "fix: remove corrupted malware injection from postcss config",
                content: Buffer.from(targetCleanContent).toString("base64"),
                sha: postcssFile.sha,
              });
              console.log(`    -> ${postcssPath} successfully cleaned and updated on GitHub!`);
            }
          }
        }
      } catch (err) {
        console.error(`  [${repoDisplayName}] ${postcssPath} processing failed:`, err.message);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  console.log("\n==============================================");
  console.log(isDryRun ? "DRY RUN COMPLETE. Run with --write to apply changes." : "ALL REPOSITORIES CLEANED SUCCESSFULLY!");
  console.log("==============================================\n");
}

main().catch(console.error);
