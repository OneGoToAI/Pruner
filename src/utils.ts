import { spawn } from 'child_process';
import { createConnection } from 'net';

/**
 * Check if the 'claude' command is available in the system
 */
export function checkClaudeCommand(): Promise<boolean> {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const child = spawn(command, ['claude'], { stdio: 'ignore' });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Check if a port is available for use
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = createConnection(port, 'localhost');

    connection.on('connect', () => {
      connection.end();
      resolve(false); // Port is occupied
    });

    connection.on('error', () => {
      resolve(true); // Port is available
    });
  });
}

/**
 * Find an available port starting from the given port number
 */
export async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  const maxAttempts = 100; // Avoid infinite loop

  for (let i = 0; i < maxAttempts; i++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    port++;
  }

  throw new Error(`Could not find an available port starting from ${startPort}`);
}

/**
 * Open config file in system editor
 */
export function openConfigInEditor(configPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR ||
                   process.env.VISUAL ||
                   (process.platform === 'win32' ? 'notepad' :
                    process.platform === 'darwin' ? 'open' : 'nano');

    const args = process.platform === 'darwin' ? ['-t', configPath] : [configPath];
    const child = spawn(editor, args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}