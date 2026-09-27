/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');

function killStaleNextProcesses() {
  const cmd = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const args = process.platform === 'win32'
    ? [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        "$root = [IO.Path]::GetFullPath((Get-Location)).TrimEnd('\\'); $current = [int]$env:APC_DEV_SAFE_PID; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ProcessId -ne $current -and $_.CommandLine -and $_.CommandLine.Contains($root) -and (($_.CommandLine -match 'dev-safe\\.js') -or ($_.CommandLine -match 'next[\\\\/].* dev')) } | ForEach-Object { taskkill.exe /PID $_.ProcessId /T /F | Out-Null }"
      ]
    : ['-lc', "ps -eo pid,comm,args | awk '$2==\"node\" && $3 ~ /next/ {print $1}' | xargs -r kill -9"]; 

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('exit', (code) => code === 0 || code === null ? resolve() : reject(new Error(`Cleanup exited with ${code}`)));
    child.on('error', reject);
  });
}

(async () => {
  process.env.APC_DEV_SAFE_PID = String(process.pid);

  try {
    await killStaleNextProcesses();
  } catch (error) {
    console.warn('Cleanup warning:', error.message);
  }

  const next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_DIST_DIR: '.next-dev' },
  });

  next.on('exit', (code) => process.exit(code ?? 0));
  next.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
})();
