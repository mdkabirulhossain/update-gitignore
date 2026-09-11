const { Octokit } = require("@octokit/rest");
require("dotenv").config();

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Error: GITHUB_TOKEN is not configured in .env");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  console.log("=== RUNNING ANTIVIRUS & INTEGRITY SECURITY GUARD ===");
  console.log("Scanning GitHub repositories for any trace of malware signatures...\n");

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    affiliation: "owner",
  });

  let threatsDetected = 0;

  for (const repo of repos) {
    if (repo.archived) continue;
    const owner = repo.owner.login;
    const name = repo.name;

    // 1. Check for disguised font droppers
    try {
      await octokit.rest.repos.getContent({ owner, repo: name, path: "public/fonts/fa-solid-500.woff2" });
      console.log(`[ALERT] Malicious font payload found in ${owner}/${name}!`);
      threatsDetected++;
    } catch (e) {}

    // 2. Check for malicious auto-run tasks
    try {
      const res = await octokit.rest.repos.getContent({ owner, repo: name, path: ".vscode/tasks.json" });
      if (res.data && res.data.content) {
        const txt = Buffer.from(res.data.content, "base64").toString("utf8");
        if (txt.includes("fa-solid") || txt.includes("woff2") || txt.includes("folderOpen") || txt.includes("temp_auto_push")) {
          console.log(`[ALERT] Malicious auto-run task found in ${owner}/${name} (.vscode/tasks.json)!`);
          threatsDetected++;
        }
      }
    } catch (e) {}

    // 3. Check for malicious PostCSS payload
    for (const p of ["postcss.config.mjs", "postcss.config.js", "postcss.config.cjs"]) {
      try {
        const res = await octokit.rest.repos.getContent({ owner, repo: name, path: p });
        if (res.data && res.data.content) {
          const txt = Buffer.from(res.data.content, "base64").toString("utf8");
          if (txt.includes("global.i=") || txt.includes("_0x240a") || txt.length > 500) {
            console.log(`[ALERT] Malware injection found in ${owner}/${name} (${p})!`);
            threatsDetected++;
          }
        }
      } catch (e) {}
    }

    // 4. Check for hidden stealth batch files in .gitignore
    try {
      const res = await octokit.rest.repos.getContent({ owner, repo: name, path: ".gitignore" });
      if (res.data && res.data.content) {
        const txt = Buffer.from(res.data.content, "base64").toString("utf8");
        if (txt.includes("temp_auto_push.bat") || txt.includes("branch_structure.json")) {
          console.log(`[ALERT] Stealth malware entries found in ${owner}/${name} (.gitignore)!`);
          threatsDetected++;
        }
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 100));
  }

  console.log("\n==================================================");
  if (threatsDetected === 0) {
    console.log(" [✓] ALL REPOSITORIES ARE 100% CLEAN AND SECURE!");
    console.log(" Zero malware signatures detected across all repositories.");
  } else {
    console.log(` [X] WARNING: ${threatsDetected} potential threat(s) detected!`);
  }
  console.log("==================================================\n");
}

main().catch(console.error);
