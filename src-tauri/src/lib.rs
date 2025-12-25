use std::process::Command;
use std::path::Path;
use std::fs;
use std::collections::{HashMap, BTreeMap, HashSet};
use serde::{Serialize, Deserialize};
use std::io::Write;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CommitInfo {
    date: String,
    hash: String,
    author: String,
    message: String,
    branch: String,
    repo_name: String,
    insertions: i32,
    deletions: i32,
    timestamp: i64,
}

#[tauri::command]
async fn git_fetch(repo_path: String) -> Result<(), String> {
    let path = Path::new(&repo_path);
    let repo_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    
    let output = Command::new("git")
        .args(&["fetch", "--all"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git fetch --all in {}: {}", repo_name, e))?;

    if !output.status.success() {
        return Err(format!("Git fetch failed for {}: {}", repo_name, String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
async fn git_check_updates(repo_path: String) -> Result<bool, String> {
    let path = Path::new(&repo_path);
    let repo_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    
    // 使用 git fetch --dry-run 检查是否有更新
    // 如果 stderr 有输出，通常意味着有更新（或者有错误，但 dry-run 的输出通常在 stderr）
    // 更严谨的做法是检查输出内容，但 dry-run 在有更新时会有输出，无更新时通常为空
    let output = Command::new("git")
        .args(&["fetch", "--all", "--dry-run"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git fetch --dry-run in {}: {}", repo_name, e))?;

    if !output.status.success() {
        return Err(format!("Git check updates failed for {}: {}", repo_name, String::from_utf8_lossy(&output.stderr)));
    }

    // git fetch --dry-run 的输出通常在 stderr
    // 如果 stderr 不为空，且不包含 "Fetching"，则认为有更新
    // 注意：不同 git 版本输出可能不同，这里是一个简单的启发式判断
    // 更好的方式可能是对比 ls-remote，但 dry-run 比较快且简单
    // 只要有输出（除了 Fetching origin... 这种进度条），就认为有潜在更新
    
    // 如果 stderr 不为空，说明有更新
    Ok(!output.stderr.is_empty())
}

#[tauri::command]
async fn git_get_remote_url(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(&["remote", "get-url", "origin"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git remote get-url in {}: {}", repo_path, e))?;

    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(url)
    } else {
        // Try to get any remote if origin doesn't exist
        let output_any = Command::new("git")
            .args(&["remote"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("Failed to list remotes in {}: {}", repo_path, e))?;
            
        let remotes = String::from_utf8_lossy(&output_any.stdout);
        let first_remote = remotes.lines().next();
        
        if let Some(remote) = first_remote {
             let output_remote = Command::new("git")
                .args(&["remote", "get-url", remote])
                .current_dir(&repo_path)
                .output()
                .map_err(|e| format!("Failed to get url for remote {} in {}: {}", remote, repo_path, e))?;
                
             if output_remote.status.success() {
                 return Ok(String::from_utf8_lossy(&output_remote.stdout).trim().to_string());
             }
        }

        Ok("".to_string())
    }
}

#[tauri::command]
fn check_git_repo(path: String) -> bool {
    let git_path = Path::new(&path).join(".git");
    git_path.exists()
}

#[tauri::command]
async fn get_commits(repo_paths: Vec<String>, start_date: String, end_date: String) -> Result<Vec<CommitInfo>, String> {
    let mut all_commits = Vec::new();

    for repo_path in repo_paths {
        let path = Path::new(&repo_path);
        let repo_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        
        // 1. git log with numstat
        // Format:
        // ^^^^^COMMIT^^^^^
        // date|||hash|||author
        // message body...
        // ^^^^^MSG_END^^^^^
        // 10      5       file1.rs
        // ...
        let log_args = [
            "log",
            "--all",
            &format!("--since={} 00:00:00", start_date),
            &format!("--until={} 23:59:59", end_date),
            "--no-merges",
            "--date=format:%Y-%m-%d",
            "--numstat",
            "--pretty=format:^^^^^COMMIT^^^^^%n%ad|||%H|||%an|||%at%n%B%n^^^^^MSG_END^^^^^",
        ];

        let output = Command::new("git")
            .args(&log_args)
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git log in {}: {}", repo_name, e))?;

        if !output.status.success() {
            println!("Git log failed for {}: {:?}", repo_name, String::from_utf8_lossy(&output.stderr));
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut commits = Vec::new();
        let mut hashes = Vec::new();

        let lines: Vec<&str> = stdout.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            if lines[i] == "^^^^^COMMIT^^^^^" {
                i += 1;
                if i >= lines.len() { break; }

                // Parse Header
                let header_parts: Vec<&str> = lines[i].split("|||").collect();
                if header_parts.len() < 4 {
                    i += 1;
                    continue;
                }
                let date = header_parts[0].trim().to_string();
                let hash = header_parts[1].trim().to_string();
                let author = header_parts[2].trim().to_string();
                let timestamp = header_parts[3].trim().parse::<i64>().unwrap_or(0);
                i += 1;

                // Parse Message
                let mut message_lines = Vec::new();
                while i < lines.len() && lines[i] != "^^^^^MSG_END^^^^^" {
                    message_lines.push(lines[i]);
                    i += 1;
                }
                let message = message_lines.join("\n").trim().to_string();
                if i < lines.len() { i += 1; } // Skip MSG_END

                // Parse Numstat
                let mut insertions = 0;
                let mut deletions = 0;
                while i < lines.len() && lines[i] != "^^^^^COMMIT^^^^^" {
                    let line = lines[i].trim();
                    if !line.is_empty() {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 2 {
                            // Handle binary files which show as "-"
                            let ins = parts[0].parse::<i32>().unwrap_or(0);
                            let del = parts[1].parse::<i32>().unwrap_or(0);
                            insertions += ins;
                            deletions += del;
                        }
                    }
                    i += 1;
                }

                commits.push(CommitInfo {
                    date,
                    hash: hash.clone(),
                    author,
                    message,
                    branch: "Unknown".to_string(),
                    repo_name: repo_name.clone(),
                    insertions,
                    deletions,
                    timestamp,
                });
                hashes.push(hash);
            } else {
                i += 1;
            }
        }

        // 2. git name-rev
        if !hashes.is_empty() {
            let mut child = Command::new("git")
                .args(&["name-rev", "--stdin", "--refs=refs/heads/*", "--refs=refs/remotes/*"])
                .current_dir(&repo_path)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn git name-rev: {}", e))?;

            if let Some(mut stdin) = child.stdin.take() {
                let input = hashes.join("\n");
                let _ = stdin.write_all(input.as_bytes());
            }

            let output = child.wait_with_output().map_err(|e| format!("Failed to wait for git name-rev: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            let mut branch_map = HashMap::new();
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let hash = parts[0];
                    let branch_raw = parts[1]; 
                    let branch = branch_raw.trim_matches(|c| c == '(' || c == ')');
                    let branch = branch.replace("remotes/origin/", "")
                                     .replace("remotes/", "");
                    let branch = branch.split(&['~', '^'][..]).next().unwrap_or("").to_string();
                    
                    branch_map.insert(hash.to_string(), branch);
                }
            }

            for commit in &mut commits {
                if let Some(branch) = branch_map.get(&commit.hash) {
                    commit.branch = branch.clone();
                }
            }
        }
        
        all_commits.extend(commits);
    }

    Ok(all_commits)
}

fn format_date_range(start: &str, end: &str) -> String {
    let start_parts: Vec<&str> = start.split('-').collect();
    let end_parts: Vec<&str> = end.split('-').collect();
    
    if start_parts.len() == 3 && end_parts.len() == 3 {
        if start_parts[0] == end_parts[0] {
            if start_parts[1] == end_parts[1] {
                return format!("{}~{}", start, end_parts[2]);
            }
            return format!("{}~{}-{}", start, end_parts[1], end_parts[2]);
        }
    }
    format!("{}~{}", start, end)
}

fn generate_report_content(commits: &[CommitInfo], author: &str, start: &str, end: &str, is_total: bool) -> String {
    let mut output = String::new();
    if is_total {
        output.push_str("汇总报告 (所有作者)\n");
    } else {
        output.push_str(&format!("作者: {}\n", author));
    }
    output.push_str(&format!("时间范围: {} 至 {}\n", start, end));
    output.push_str("----------------------------------------\n\n");

    let mut aggregated: BTreeMap<String, BTreeMap<String, BTreeMap<String, Vec<String>>>> = BTreeMap::new();

    for commit in commits {
        aggregated
            .entry(commit.date.clone()).or_default()
            .entry(commit.repo_name.clone()).or_default()
            .entry(commit.branch.clone()).or_default()
            .push(commit.message.clone());
    }

    for (date, repos) in aggregated {
        output.push_str(&format!("【{}】\n", date));
        for (repo, branches) in repos {
            output.push_str(&format!("  📂 项目: {}\n", repo));
            for (branch, messages) in branches {
                output.push_str(&format!("    🌿 分支: {}\n", branch));
                for (i, msg) in messages.iter().enumerate() {
                    let lines: Vec<&str> = msg.lines().collect();
                    if !lines.is_empty() {
                        output.push_str(&format!("      {}. {}\n", i + 1, lines[0]));
                        for line in &lines[1..] {
                            output.push_str(&format!("         {}\n", line));
                        }
                    }
                }
                output.push_str("\n");
            }
        }
        output.push_str("\n");
    }

    output
}

#[tauri::command]
async fn export_report(commits: Vec<CommitInfo>, export_path: String, start_date: String, end_date: String) -> Result<(), String> {
    let mut commits_by_author: HashMap<String, Vec<CommitInfo>> = HashMap::new();
    for commit in &commits {
        commits_by_author.entry(commit.author.clone()).or_default().push(commit.clone());
    }

    let output_dir = Path::new(&export_path).join(format!("{}~{}", start_date, end_date));
    fs::create_dir_all(&output_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    for (author, author_commits) in &commits_by_author {
        let content = generate_report_content(author_commits, author, &start_date, &end_date, false);
        let unique_repos: HashSet<_> = author_commits.iter().map(|c| &c.repo_name).collect();
        let repo_label = if unique_repos.len() > 1 {
            "AllProjects".to_string()
        } else {
            unique_repos.iter().next().map(|s| s.to_string()).unwrap_or_else(|| "Unknown".to_string())
        };

        let filename = format!("{}-{}-{}.txt", author, format_date_range(&start_date, &end_date), repo_label);
        let file_path = output_dir.join(filename);
        fs::write(file_path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    }

    let total_content = generate_report_content(&commits, "ALL", &start_date, &end_date, true);
    let unique_repos: HashSet<_> = commits.iter().map(|c| &c.repo_name).collect();
    let total_repo_label = if unique_repos.len() > 1 {
        "AllProjects".to_string()
    } else {
        unique_repos.iter().next().map(|s| s.to_string()).unwrap_or_else(|| "Unknown".to_string())
    };
    let total_filename = format!("TOTAL-{}-{}.txt", format_date_range(&start_date, &end_date), total_repo_label);
    let total_file_path = output_dir.join(total_filename);
    fs::write(total_file_path, total_content).map_err(|e| format!("Failed to write total file: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![check_git_repo, get_commits, export_report, git_fetch, git_check_updates, git_get_remote_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
