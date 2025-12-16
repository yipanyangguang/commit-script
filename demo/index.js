const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec, spawn } = require('child_process');
let config = {};
try {
    config = require('./config');
} catch (e) {
    // config.js might not exist or be valid, ignore for now
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function getBranchNames(hashes, cwd) {
    return new Promise((resolve, reject) => {
        if (hashes.length === 0) {
            resolve({});
            return;
        }

        // 使用 git name-rev 获取 commit 对应的分支名
        // --refs=refs/heads/* 限制只匹配本地分支
        // --refs=refs/remotes/* 限制只匹配远程分支
        // 注意：不使用 --name-only，因为我们需要 hash 来对应结果
        const args = ['name-rev', '--stdin', '--refs=refs/heads/*', '--refs=refs/remotes/*'];
        const child = spawn('git', args, { cwd });

        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', data => stdoutData += data);
        child.stderr.on('data', data => stderrData += data);

        child.on('close', code => {
            if (code !== 0) {
                // 如果 name-rev 失败，降级处理，不报错，只是没有分支名
                console.warn(`⚠️  获取分支信息失败: ${stderrData}`);
                resolve({});
                return;
            }

            const result = {};
            const lines = stdoutData.trim().split('\n');
            
            lines.forEach(line => {
                // 输出格式通常为: "<hash> (<name>)"
                // 例如: "d2267d95758d2d0f7644cdca94b420458069f2d9 (remotes/origin/feat/equipment)"
                const match = line.match(/^([a-f0-9]+)\s+\((.+)\)$/);
                if (match) {
                    const hash = match[1];
                    let branch = match[2];
                    
                    if (branch && branch !== 'undefined') {
                        // 清理分支名
                        // 去掉 remotes/origin/ 前缀
                        branch = branch.replace(/^remotes\/origin\//, '');
                        branch = branch.replace(/^remotes\//, '');
                        // 去掉 ~2, ^1 等后缀 (表示距离分支顶端的距离)
                        branch = branch.replace(/[\^~].*$/, '');
                        result[hash] = branch;
                    }
                }
            });
            resolve(result);
        });

        child.on('error', (err) => {
             console.warn(`⚠️  启动 git name-rev 失败: ${err.message}`);
             resolve({});
        });

        child.stdin.write(hashes.join('\n'));
        child.stdin.end();
    });
}

function getCurrentWeekRange() {
    const now = new Date();
    const day = now.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const diffToMonday = day === 0 ? -6 : 1 - day; // Adjust when day is Sunday
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    
    return {
        monday: formatDate(monday),
        sunday: formatDate(sunday)
    };
}

function getCommits(repoPath, startDate, endDate) {
    return new Promise((resolve, reject) => {
        const projectName = path.basename(repoPath);
        
        // 构建 git 命令
        // 使用 %B 获取完整 commit message (标题+描述)
        // 使用 ^^^^^COMMIT^^^^^ 作为提交分隔符，防止 message 中包含换行符导致解析错误
        // 格式: 日期|||Hash|||作者|||完整消息^^^^^COMMIT^^^^^
        const COMMIT_DELIMITER = '^^^^^COMMIT^^^^^';
        const command = `git log --all --since="${startDate} 00:00:00" --until="${endDate} 23:59:59" --no-merges --date=format:"%Y-%m-%d" --pretty=format:"%ad|||%H|||%an|||%B${COMMIT_DELIMITER}"`;
        
        exec(command, { cwd: repoPath, maxBuffer: 1024 * 1024 * 10 }, async (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ [${projectName}] 执行 git 命令出错: ${error.message}`);
                resolve([]); // 出错返回空数组，不中断整个流程
                return;
            }

            if (!stdout) {
                resolve([]);
                return;
            }

            const rawCommits = stdout.split(COMMIT_DELIMITER);
            const commits = [];
            const hashes = [];

            rawCommits.forEach(block => {
                if (!block.trim()) return;
                
                const parts = block.split('|||');
                if (parts.length >= 4) {
                    const date = parts[0].trim();
                    const hash = parts[1].trim();
                    const author = parts[2].trim();
                    // 消息可能包含 |||，所以取剩余部分
                    const message = parts.slice(3).join('|||').trim();
                    
                    if (date && hash) {
                        commits.push({ date, message, hash, author });
                        hashes.push(hash);
                    }
                }
            });

            // 获取分支映射
            const branchMap = await getBranchNames(hashes, repoPath);

            // 补充分支信息
            const commitsWithBranch = commits.map(commit => ({
                ...commit,
                branch: branchMap[commit.hash] || 'Unknown Branch',
                repoName: projectName
            }));

            resolve(commitsWithBranch);
        });
    });
}

function generateReportContent(commits, author, startDate, endDate, isTotal = false) {
    // 聚合数据: Date -> Repo -> Branch -> Commits
    const aggregated = {};

    commits.forEach(commit => {
        const { date, repoName, branch, message } = commit;
        if (!aggregated[date]) aggregated[date] = {};
        if (!aggregated[date][repoName]) aggregated[date][repoName] = {};
        if (!aggregated[date][repoName][branch]) aggregated[date][repoName][branch] = [];
        
        aggregated[date][repoName][branch].push(message);
    });

    let outputContent = isTotal ? `汇总报告 (所有作者)\n` : `作者: ${author}\n`;
    outputContent += `时间范围: ${startDate} 至 ${endDate}\n`;
    outputContent += `生成时间: ${new Date().toLocaleString()}\n`;
    outputContent += `----------------------------------------\n\n`;

    const sortedDates = Object.keys(aggregated).sort();

    sortedDates.forEach(date => {
        outputContent += `【${date}】\n`;
        const repos = aggregated[date];
        const sortedRepos = Object.keys(repos).sort();

        sortedRepos.forEach(repo => {
            outputContent += `  📂 项目: ${repo}\n`;
            const branches = repos[repo];
            const sortedBranches = Object.keys(branches).sort();

            sortedBranches.forEach(branch => {
                outputContent += `    🌿 分支: ${branch}\n`;
                branches[branch].forEach((msg, index) => {
                    const msgLines = msg.split('\n');
                    outputContent += `      ${index + 1}. ${msgLines[0]}\n`;
                    // 如果有多行，缩进显示后续行
                    for (let i = 1; i < msgLines.length; i++) {
                        outputContent += `         ${msgLines[i]}\n`;
                    }
                });
                outputContent += `\n`;
            });
        });
        outputContent += `\n`;
    });

    return outputContent;
}

function formatDateRange(startDate, endDate) {
    const [startYear, startMonth, startDay] = startDate.split('-');
    const [endYear, endMonth, endDay] = endDate.split('-');

    if (startYear === endYear) {
        if (startMonth === endMonth) {
            return `${startDate}~${endDay}`;
        }
        return `${startDate}~${endMonth}-${endDay}`;
    }
    return `${startDate}~${endDate}`;
}

async function main() {
    try {
        console.log('--- Git Commit 导出工具 ---');

        const { monday: currentMonday, sunday: currentSunday } = getCurrentWeekRange();

        // 1. 选择模式
        console.log('请选择模式:');
        console.log('1. 输入模式 (手动输入仓库路径和时间)');
        console.log('2. Config 模式 (读取 config.js 配置)');
        
        let mode = await askQuestion('请输入模式编号 (1 或 2): ');
        mode = mode.trim();

        let repos = [];
        let startDate = '';
        let endDate = '';
        let author = '';

        if (mode === '2') {
            // Config 模式
            if (!config || !config.projectPath) {
                console.error('❌ 未找到有效的 config.js 配置。');
                rl.close();
                return;
            }
            
            repos = config.projectPath;
            startDate = config.startTime || currentMonday;
            endDate = config.endTime || currentSunday;
            
            console.log(`\n已读取配置:`);
            console.log(`项目列表: \n  - ${repos.join('\n  - ')}`);
            console.log(`时间范围: ${startDate} 至 ${endDate}`);

        } else {
            // 输入模式
            // 1. 获取仓库地址
            let repoPath = '';
            while (true) {
                repoPath = await askQuestion('请输入 Git 仓库的绝对路径 (例如 /Users/xxx/project): ');
                repoPath = repoPath.trim();
                
                if (!fs.existsSync(repoPath)) {
                    console.log('❌ 路径不存在，请重新输入。');
                    continue;
                }

                const gitDir = path.join(repoPath, '.git');
                if (!fs.existsSync(gitDir)) {
                    console.log('❌ 该路径不是一个 Git 仓库根目录 (未找到 .git 文件夹)，请重新输入。');
                    continue;
                }
                break;
            }
            repos = [repoPath];

            // 2. 获取开始时间
            while (true) {
                startDate = await askQuestion(`请输入开始时间 (格式 YYYY-MM-DD, 例如 ${currentMonday}): `);
                startDate = startDate.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) break;
                console.log('❌ 格式错误，请使用 YYYY-MM-DD 格式。');
            }

            // 3. 获取结束时间
            while (true) {
                endDate = await askQuestion(`请输入结束时间 (格式 YYYY-MM-DD, 例如 ${currentSunday}): `);
                endDate = endDate.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) break;
                console.log('❌ 格式错误，请使用 YYYY-MM-DD 格式。');
            }
        }

        console.log('\n正在查询 Git 记录...');

        // 并行查询所有仓库 (获取所有作者)
        const promises = repos.map(repo => getCommits(repo, startDate, endDate));
        const results = await Promise.all(promises);
        const allCommits = results.flat();

        if (allCommits.length === 0) {
             console.log('⚠️  未找到任何提交记录。');
             rl.close();
             return;
        }

        // 按作者分组
        const commitsByAuthor = {};
        allCommits.forEach(commit => {
            const author = commit.author;
            if (!commitsByAuthor[author]) {
                commitsByAuthor[author] = [];
            }
            commitsByAuthor[author].push(commit);
        });

        // 创建输出目录
        const outputDirName = `${startDate}~${endDate}`;
        const outputDirPath = path.join(__dirname, outputDirName);
        if (!fs.existsSync(outputDirPath)) {
            fs.mkdirSync(outputDirPath, { recursive: true });
        }
        console.log(`\n📂 输出目录: ${outputDirPath}`);

        // 1. 生成每个作者的报告
        for (const author of Object.keys(commitsByAuthor)) {
             const authorCommits = commitsByAuthor[author];
             const content = generateReportContent(authorCommits, author, startDate, endDate, false);
             
             const repoLabel = mode === '2' ? 'AllProjects' : authorCommits[0].repoName;
             const dateRange = formatDateRange(startDate, endDate);
             const fileName = `${author}-${dateRange}-${repoLabel}.txt`;
             const outputPath = path.join(outputDirPath, fileName);
             
             fs.writeFileSync(outputPath, content, 'utf8');
             console.log(`✅ [作者报告] ${author} - 已保存: ${fileName}`);
        }

        // 2. 生成汇总报告 (所有作者)
        console.log('正在生成汇总报告 (所有作者)...');
        const totalContent = generateReportContent(allCommits, 'ALL', startDate, endDate, true);
        const totalRepoLabel = mode === '2' ? 'AllProjects' : allCommits[0].repoName;
        const totalDateRange = formatDateRange(startDate, endDate);
        const totalFileName = `TOTAL-${totalDateRange}-${totalRepoLabel}.txt`;
        const totalOutputPath = path.join(outputDirPath, totalFileName);
        
        fs.writeFileSync(totalOutputPath, totalContent, 'utf8');
        console.log(`✅ [汇总报告] 已保存: ${totalFileName}`);
        
        rl.close();

    } catch (err) {
        console.error('发生错误:', err);
        rl.close();
    }
}

main();
