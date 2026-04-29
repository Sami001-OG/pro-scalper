import { execSync, spawn } from 'child_process';

try {
  console.log("Running npm run build...");
  execSync('npm run build', { stdio: 'inherit' });
  console.log("Starting server...");
  const server = spawn('node', ['dist/server.cjs']);
  
  server.stdout.on('data', (data: any) => {
    console.log(`stdout: ${data}`);
  });

  server.stderr.on('data', (data: any) => {
    console.error(`stderr: ${data}`);
  });

  setTimeout(() => {
    console.log("Killing server after 5 seconds...");
    server.kill();
    process.exit(0);
  }, 5000);

} catch (e) {
  console.error(e);
}
